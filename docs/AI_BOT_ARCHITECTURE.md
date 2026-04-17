# AI Бот MyUnion — Архитектура и логика работы

## Обзор

AI-бот платформы MyUnion — это умный ассистент, который помогает пользователям с любыми вопросами, при этом имеет доступ к базе данных профсоюзов с информацией о председателях, организациях и контактах.

## Ключевые принципы

1. **Свободный бот** — отвечает на любые вопросы, не ограничен только темой профсоюзов
2. **Использует данные** — если в БД есть релевантная информация, ОБЯЗАТЕЛЬНО использует её
3. **Персонализация** — знает имя пользователя и его организацию
4. **Мульти-источники** — ищет информацию в нескольких местах перед ответом

---

## Архитектура

### Компоненты

```
┌─────────────────────────────────────────────────────────────────┐
│                        FRONTEND                                  │
├─────────────────────────────────────────────────────────────────┤
│  FloatingChatBot.tsx    │  Мини-чат (виджет в углу экрана)      │
│  /dashboard/chat        │  Полноценный чат                       │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                         API ROUTES                               │
├─────────────────────────────────────────────────────────────────┤
│  /api/assistant/chat    │  API для мини-чата                    │
│  /api/chat/[chatId]     │  API для основного чата               │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    ENHANCED SEARCH                               │
│                 lib/chat-enhanced-search.ts                      │
├─────────────────────────────────────────────────────────────────┤
│  1. База знаний         │  Векторный поиск по документам        │
│  2. Персональная БЗ     │  История взаимодействий пользователя  │
│  3. БД организаций      │  Председатели, контакты, адреса       │
│  4. Tavily API          │  Веб-поиск (если данных недостаточно) │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                      AI PROVIDERS                                │
├─────────────────────────────────────────────────────────────────┤
│  Yandex Foundation      │  YandexGPT + text-embedding (256-dim) │
│  Models API             │                                        │
│  - GPT-4                │                                        │
│  - Gemini               │                                        │
└─────────────────────────────────────────────────────────────────┘
```

---

## Поток обработки сообщения

### 1. Пользователь отправляет сообщение

```typescript
// Frontend показывает индикатор "Печатает" СРАЗУ
if (isBotChat) {
  setIsBotTyping(true);
}
```

### 2. Enhanced Search (расширенный поиск)

```typescript
const searchResults = await enhancedSearch(query, botId, userId);
```

#### 2.1 Поиск в базе знаний
```typescript
const chunks = await retrieveRelevantChunks(query, botId, 5);
```
- Векторный поиск по загруженным документам
- Возвращает топ-5 релевантных фрагментов

#### 2.2 Поиск в персональной БЗ пользователя
```typescript
const userChunks = await searchUserKnowledge(userId, query, 3);
```
- История взаимодействий пользователя с ботом
- Данные профиля пользователя

#### 2.3 Поиск организаций (если запрос о председателе)
```typescript
if (isOrganizationQuery(query)) {
  // Определяем организацию из запроса или профиля пользователя
  let orgName = extractOrganizationName(query);
  
  // Если "наш председатель" — берём организацию пользователя
  if (!orgName && /\b(наш|нашей|моей)\b/i.test(query)) {
    orgName = userOrgName; // Из профиля
  }
  
  const orgInfo = await searchOrganizationWithChairman(orgName);
}
```

#### 2.4 Веб-поиск (Tavily API)
```typescript
// Только если НЕТ информации о председателе в БД
if (!hasChairmanInfo) {
  const webResults = await searchWeb(`председатель ${orgName} профсоюз`);
}
```

### 3. Формирование промпта

```typescript
const systemPrompt = `Ты умный и дружелюбный AI-ассистент. 
Ты можешь помочь с любыми вопросами.

Пользователь: ${userName}
Его организация: ${userOrg}

У тебя есть доступ к базе данных профсоюзов.

${formattedSearchInfo ? `### ДАННЫЕ ИЗ БАЗЫ ЗНАНИЙ:\n${formattedSearchInfo}` : ""}

Правила:
- Если в данных есть ответ — используй эту информацию
- Если спрашивают о председателе и данные есть — назови имя
- Можешь отвечать на любые вопросы
- Если информации нет — честно скажи`;
```

### 4. Вызов AI модели

```typescript
const messages = [
  { role: "system", content: systemPrompt },
  ...conversationHistory.slice(-10), // Последние 10 сообщений
  { role: "user", content: userMessage }
];

const aiResponse = await callAI(bot, messages);
```

### 5. Сохранение и ответ

```typescript
// Сохраняем сообщение пользователя
const userMsg = await prisma.chatMessage.create({...});

// Сохраняем ответ бота
const botMsg = await prisma.chatMessage.create({...});

// Сохраняем в базу знаний для обучения
await saveChatConversationToKnowledgeBase(botId, query, response);

// Сохраняем в персональную БЗ пользователя
await saveUserInteractionToKnowledgeBase(userId, query, response);

// Возвращаем оба сообщения
return { message: userMsg, botMessage: botMsg };
```

### 6. Frontend получает ответ

```typescript
if (data.botMessage) {
  // Ответ пришёл — выключаем индикатор
  setIsBotTyping(false);
  setMessages(prev => [...prev, data.botMessage]);
} else {
  // Ответ ещё не готов — polling каждую секунду
  startPollingForBotMessage();
}
```

---

## База данных

### Таблица Organization
```prisma
model Organization {
  id              String   @id
  name            String   // "Дмитровская городская организация"
  chairmanName    String?  // "Иванов Иван Иванович"
  chairmanJobTitle String? // "Председатель"
  phone           String?
  email           String?
  address         String?
}
```

### Таблица UserKnowledgeBase
```prisma
model UserKnowledgeBase {
  id     String @id
  userId String @unique
  chunks UserKnowledgeChunk[]
}

model UserKnowledgeChunk {
  id        String
  type      UserKnowledgeChunkType // PROFILE_DATA, INTERACTION, DOCUMENT_CONTENT
  content   String
  embedding Float[]  // Векторное представление для поиска
}
```

---

## Определение запросов об организации

```typescript
function isOrganizationQuery(query: string): boolean {
  const keywords = [
    "председатель", "руководитель", "глава", "директор",
    "организац", "МООП", "РЗ", "РФ",
    "кто возглавляет", "кто руководит", "как зовут"
  ];
  return keywords.some(k => query.toLowerCase().includes(k));
}
```

---

## Важные файлы

| Файл | Описание |
|------|----------|
| `lib/chat-enhanced-search.ts` | Расширенный поиск (KB, орги, веб) |
| `app/api/chat/[chatId]/route.ts` | API основного чата |
| `app/api/assistant/chat/route.ts` | API мини-чата |
| `lib/user-knowledge-base.ts` | Персональная база знаний |
| `lib/vector-search.ts` | Векторный поиск |
| `components/common/FloatingChatBot.tsx` | UI мини-чата |
| `app/dashboard/chat/page.tsx` | UI основного чата |

---

## Переменные окружения

```env
# AI Provider — Yandex Foundation Models (основной)
YANDEX_AI_STUDIO_API_KEY=AQVN...
YANDEX_CLOUD_FOLDER_ID=b1g...

# Веб-поиск
TAVILY_API_KEY=tvly-...

# База данных
DATABASE_URL=postgresql://...
```

---

## Индикатор "Печатает"

### Логика:
1. **Показывается СРАЗУ** при отправке сообщения в чат с ботом
2. **Выключается** когда:
   - Пришёл `botMessage` в ответе API
   - Polling обнаружил новое сообщение от бота
   - Прошло 60 секунд (таймаут)
   - Произошла ошибка

```typescript
// При отправке
if (isBotChat) {
  setIsBotTyping(true);
}

// При получении ответа
if (data.botMessage) {
  setIsBotTyping(false);
} else {
  // Polling каждую секунду
  setInterval(() => checkForNewBotMessage(), 1000);
}
```

---

## Пример работы

**Пользователь:** "Кто наш председатель?"

**Поток:**
1. `isOrganizationQuery("Кто наш председатель?")` → `true`
2. Слово "наш" → берём организацию из профиля пользователя
3. Поиск в БД: `Organization.findMany({ name: "Дмитровская..." })`
4. Найдено: `chairmanName: "Петров Пётр Петрович"`
5. В промпт добавляется:
   ```
   ### ДАННЫЕ ИЗ БАЗЫ ЗНАНИЙ:
   ### НАЙДЕННАЯ ИНФОРМАЦИЯ ОБ ОРГАНИЗАЦИЯХ:
   Организация: Дмитровская городская организация
   ⭐ ПРЕДСЕДАТЕЛЬ: Петров Пётр Петрович
   ```
6. AI видит данные и отвечает: "Председатель вашей организации — Петров Пётр Петрович"

---

## Расширение функционала

### Добавить новый источник данных:
1. Создать функцию поиска в `lib/chat-enhanced-search.ts`
2. Добавить вызов в `enhancedSearch()`
3. Добавить форматирование в `formatSearchResultsForPrompt()`

### Изменить промпт:
- Основной чат: `app/api/chat/[chatId]/route.ts` → `systemPrompt`
- Мини-чат: `app/api/assistant/chat/route.ts` → `buildSystemPromptWithEnhancedSearch()`

### Добавить новые ключевые слова для поиска организаций:
- `lib/chat-enhanced-search.ts` → `isOrganizationQuery()`

