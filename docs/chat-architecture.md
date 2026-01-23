# Архитектура и документация чата

## Содержание

1. [Обзор системы](#обзор-системы)
2. [Типы чатов](#типы-чатов)
3. [Архитектура базы данных](#архитектура-базы-данных)
4. [API Endpoints](#api-endpoints)
5. [Компоненты фронтенда](#компоненты-фронтенда)
6. [Real-time коммуникация](#real-time-коммуникация)
7. [Кэширование и оптимизация](#кэширование-и-оптимизация)
8. [Потоки данных](#потоки-данных)
9. [Особенности реализации](#особенности-реализации)

---

## Обзор системы

Система чатов представляет собой полнофункциональный мессенджер в стиле Slack, поддерживающий:
- Личные чаты между пользователями
- Групповые чаты с несколькими участниками
- Каналы для публикации новостей
- Автоматическое создание чатов для обращений (tickets)
- Треды (threads) для обсуждений
- Реакции на сообщения
- Пересылку, редактирование и удаление сообщений
- Вложения (файлы, изображения, видео)
- Real-time обновления через WebSocket
- Push-уведомления

---

## Типы чатов

### 1. Личные чаты (PRIVATE)

**Описание:** Один-на-один общение между двумя пользователями.

**Особенности:**
- Автоматическое создание при первом сообщении
- Уникальность: один чат на пару пользователей
- Оба участника имеют равные права
- Нельзя добавить третьего участника

**Создание:**
```typescript
// Автоматически через getOrCreatePrivateChat()
const { chat, isNew } = await getOrCreatePrivateChat(userId1, userId2);
```

### 2. Групповые чаты (GROUP)

**Описание:** Многостороннее общение с несколькими участниками.

**Особенности:**
- Создается вручную с указанием участников
- Есть администраторы (role: "admin") и участники (role: "member")
- Можно добавлять/удалять участников
- Можно редактировать название, описание, иконку
- Поддержка тредов

**Создание:**
```typescript
POST /api/chat
{
  "participantIds": ["user1", "user2", "user3"],
  "name": "Название группы",
  "description": "Описание",
  "type": "GROUP"
}
```

### 3. Каналы (CHANNEL)

**Описание:** Публичные каналы для новостей и объявлений.

**Особенности:**
- Связан с `NewsChannel` в разделе "Новости"
- Синхронизация постов с новостной лентой
- Только председатели/админы могут публиковать
- Участники могут комментировать в тредах
- Реакция ❤️ синхронизируется с лайком в новостях
- Автоматическая подписка всех членов организации на дефолтный канал

**Создание:**
```typescript
POST /api/chat
{
  "participantIds": ["user1", "user2"],
  "name": "Название канала",
  "type": "CHANNEL"
}
// Автоматически создается NewsChannel
```

### 4. Чаты обращений (GROUP для tickets)

**Описание:** Автоматически создаваемые групповые чаты для обращений членов профсоюза.

**Особенности:**
- Создается автоматически при создании обращения
- Участники: создатель обращения + председатель организации
- Председатель всегда админ
- Связан с `Ticket` через `chatId`
- Начальное сообщение содержит полную информацию об обращении
- История операций отображается как activity messages

**Создание:**
```typescript
// Автоматически в POST /api/tickets
// При создании обращения создается чат с председателем
```

---

## Архитектура базы данных

### Основные таблицы

#### Chat
```prisma
model Chat {
  id            String   @id @default(cuid())
  type          ChatType @default(PRIVATE) // PRIVATE, GROUP, CHANNEL
  name          String?  // Название (для GROUP/CHANNEL)
  description   String?  // Описание
  iconUrl       String?  // Иконка
  isPublic      Boolean  @default(true)
  createdById   String?  // Создатель
  lastMessageId String?  // Последнее сообщение
  lastMessageAt DateTime?
  
  // Связи
  participants  ChatParticipant[]
  messages      ChatMessage[]
  ticket        Ticket?  @relation("TicketChat")
  newsChannel   NewsChannel? @relation("ChatNewsChannel")
}
```

#### ChatParticipant
```prisma
model ChatParticipant {
  id          String   @id @default(cuid())
  chatId      String
  userId      String
  role        String   @default("member") // "admin", "member"
  invitedById String?  // Кто пригласил
  readAt      DateTime? // Прочитано ли последнее сообщение
  clearedAt   DateTime? // Очищена история
  joinedAt    DateTime  @default(now())
  leftAt      DateTime? // Когда покинул чат
  
  @@unique([chatId, userId])
  @@index([chatId])
  @@index([userId])
}
```

#### ChatMessage
```prisma
model ChatMessage {
  id              String   @id @default(cuid())
  chatId          String
  senderId        String
  content         String   @db.Text
  messageType     String   @default("text") // text, image, file, video, audio, channel_post
  replyToId       String?  // Ответ на сообщение
  threadRootId    String?  // Корневое сообщение треда
  editedAt        DateTime?
  
  // Связи
  attachments     ChatMessageAttachment[]
  reactions       ChatMessageReaction[]
  readBy          ChatMessageRead[]
  threadReplies   ChatMessage[] // Ответы в треде
  
  // Метрики треда
  threadRepliesCount Int       @default(0)
  threadLastReplyAt  DateTime?
  
  createdAt       DateTime  @default(now())
  updatedAt       DateTime  @updatedAt
  
  @@index([chatId, createdAt])
  @@index([chatId, threadRootId, createdAt])
}
```

#### ChatMessageAttachment
```prisma
model ChatMessageAttachment {
  id           String      @id @default(cuid())
  messageId    String
  type         String      // image, file, video, audio
  url          String
  name         String
  size         Int?
  mimeType     String?
  thumbnailUrl String?
  width        Int?
  height       Int?
}
```

#### ChatMessageReaction
```prisma
model ChatMessageReaction {
  id        String      @id @default(cuid())
  messageId String
  userId    String
  emoji     String      // 🎉, 👍, ❤️ и т.д.
  
  @@unique([messageId, userId, emoji])
  @@index([messageId])
}
```

### Индексы для производительности

- `@@index([chatId, createdAt])` - быстрая загрузка сообщений
- `@@index([chatId, threadRootId, createdAt])` - загрузка тредов
- `@@index([userId])` на ChatParticipant - список чатов пользователя
- `@@index([publicId])` на Ticket - поиск обращений

---

## API Endpoints

### Создание и получение чатов

#### `GET /api/chat`
Получить список чатов текущего пользователя.

**Параметры:**
- `filter` (query): "all" | "work" | "personal" | "channels"
- `search` (query): поиск по названию

**Ответ:**
```json
{
  "chats": [
    {
      "id": "chat_id",
      "type": "PRIVATE",
      "name": null,
      "otherUser": { ... },
      "lastMessage": "Текст последнего сообщения",
      "lastMessageAt": "2024-01-01T00:00:00Z",
      "unreadCount": 5
    }
  ]
}
```

#### `POST /api/chat`
Создать новый чат (личный, групповой или канал).

**Тело запроса:**
```json
{
  "targetUserId": "user_id",  // Для личного чата
  "participantIds": ["id1", "id2"],  // Для группы/канала
  "name": "Название",
  "description": "Описание",
  "type": "GROUP" | "CHANNEL"
}
```

### Работа с сообщениями

#### `GET /api/chat/[chatId]`
Получить данные чата и сообщения.

**Параметры:**
- `cursor` (query): ID сообщения для пагинации
- `direction` (query): "up" | "down"

**Ответ:**
```json
{
  "chat": { ... },
  "messages": [
    {
      "id": "msg_id",
      "senderId": "user_id",
      "sender": { ... },
      "content": "Текст сообщения",
      "messageType": "text",
      "attachments": [ ... ],
      "reactions": { ... },
      "createdAt": "2024-01-01T00:00:00Z"
    }
  ],
  "pagination": {
    "hasMore": true,
    "cursor": "msg_id"
  }
}
```

#### `POST /api/chat/[chatId]`
Отправить сообщение в чат.

**Тело запроса:**
```json
{
  "content": "Текст сообщения",
  "replyToId": "msg_id",  // Опционально
  "threadRootId": "msg_id",  // Для ответа в треде
  "mentionedUserIds": ["user_id1", "user_id2"],  // Упоминания
  "attachments": [ ... ]  // Опционально
}
```

#### `PATCH /api/chat/[chatId]/messages/[messageId]`
Редактировать сообщение.

**Тело запроса:**
```json
{
  "content": "Новый текст"
}
```

#### `DELETE /api/chat/[chatId]/messages/[messageId]`
Удалить сообщение.

### Реакции

#### `POST /api/chat/[chatId]/messages/[messageId]/reactions`
Добавить/удалить реакцию на сообщение.

**Тело запроса:**
```json
{
  "emoji": "❤️"
}
```

**Особенности:**
- Если реакция уже есть - удаляется
- Для каналов: реакция ❤️ синхронизируется с `NewsLike`
- Поддержка виртуальных сообщений (посты каналов)

### Пересылка сообщений

#### `POST /api/chat/forward`
Переслать сообщение в другой чат.

**Тело запроса:**
```json
{
  "messageId": "msg_id",
  "targetUserId": "user_id"
}
```

**Особенности:**
- Для постов каналов: если получатель в канале - пересылается со ссылкой, иначе без ссылки
- Создается новый личный чат, если его нет

### Каналы

#### `POST /api/chat/[chatId]/posts`
Создать пост в канале.

**Тело запроса:**
```json
{
  "title": "Заголовок поста",
  "content": "Содержимое",
  "coverImage": "url",
  "isPublished": true,
  "polls": [ ... ]
}
```

**Особенности:**
- Создается `NewsPost` в `NewsChannel`
- Создается `ChatMessage` типа `channel_post`
- Синхронизируется с разделом "Новости"

### Участники

#### `POST /api/chat/[chatId]/participants`
Добавить участника в групповой чат.

#### `DELETE /api/chat/[chatId]/participants/[userId]`
Удалить участника из чата.

#### `PATCH /api/chat/[chatId]/participants/[userId]/role`
Изменить роль участника (admin/member).

---

## Компоненты фронтенда

### Основные компоненты

#### `SlackStyleChat.tsx`
Главный компонент чата, объединяющий все подкомпоненты.

**Функции:**
- Управление состоянием чата
- Загрузка сообщений
- Обработка WebSocket событий
- Управление тредами
- Интеграция с `useChat` hook

#### `SlackStyleMessages.tsx`
Отображение списка сообщений.

**Функции:**
- Рендеринг сообщений с группировкой
- Отображение дат-разделителей
- Сохранение и восстановление позиции скролла
- Обработка контекстного меню
- Отображение activity messages

**Оптимизации:**
- `React.memo` для `MessageBubble`
- `useMemo` для списка сообщений
- Ленивая загрузка изображений с blur placeholder
- Сохранение позиции скролла в localStorage

#### `ChatInput.tsx`
Поле ввода сообщений.

**Функции:**
- Автоматическое изменение высоты
- Упоминания пользователей (`@username`)
- Прикрепление файлов
- Предпросмотр ссылок (OG preview)
- Отправка через Enter (Shift+Enter для новой строки)

#### `MessageBubble.tsx`
Отдельное сообщение.

**Функции:**
- Отображение текста, изображений, файлов
- Реакции
- Контекстное меню (ответить, переслать, редактировать, удалить)
- Отображение статуса редактирования
- Отображение прочитанных сообщений

#### `ThreadView.tsx`
Просмотр треда.

**Функции:**
- Отображение корневого сообщения
- Список ответов в треде
- Ввод ответа в треде
- Двухколоночный layout на desktop
- Полноэкранный режим на mobile

#### `ChannelThreadView.tsx`
Просмотр треда для постов канала.

**Функции:**
- Синхронизация с комментариями новостей
- Отображение корневого поста
- Комментарии с вложенными ответами
- Возможность ответа в канал или в тред

#### `ChannelComments.tsx`
Компонент комментариев для постов канала.

**Функции:**
- Отображение количества комментариев
- Сворачиваемый список комментариев
- Мини-аватарки участников
- Открытие треда при клике

### Hooks

#### `useChat.ts`
Главный hook для работы с чатом.

**Функции:**
- `loadChats()` - загрузка списка чатов
- `loadMessages()` - загрузка сообщений
- `handleSend()` - отправка сообщения
- `toggleReaction()` - добавление/удаление реакции
- `deleteMessage()` - удаление сообщения
- `editMessage()` - редактирование сообщения
- `forwardMessage()` - пересылка сообщения
- `loadThread()` - загрузка треда

**Оптимистичные обновления:**
- Реакции обновляются мгновенно
- Сообщения добавляются сразу после отправки

---

## Real-time коммуникация

### WebSocket (Socket.io)

**Сервер:** `server/socket.ts`

**События:**

#### `join-chat`
Присоединение к чату.
```typescript
socket.emit('join-chat', { chatId });
```

#### `leave-chat`
Выход из чата.
```typescript
socket.emit('leave-chat', { chatId });
```

#### `new-message`
Новое сообщение в чате.
```typescript
socket.on('new-message', (message) => {
  // Обновить UI
});
```

#### `message-updated`
Сообщение обновлено (редактирование).
```typescript
socket.on('message-updated', (message) => {
  // Обновить сообщение в UI
});
```

#### `message-deleted`
Сообщение удалено.
```typescript
socket.on('message-deleted', ({ messageId }) => {
  // Удалить сообщение из UI
});
```

#### `reaction-updated`
Реакция обновлена.
```typescript
socket.on('reaction-updated', ({ messageId, reactions }) => {
  // Обновить реакции в UI
});
```

#### `typing`
Пользователь печатает.
```typescript
socket.emit('typing', { chatId, userId });
socket.on('typing', ({ userId, userName }) => {
  // Показать индикатор печати
});
```

### Fallback на HTTP

Если WebSocket недоступен, используется HTTP polling:
- Периодическая проверка новых сообщений
- Обновление через `loadMessages()`

---

## Кэширование и оптимизация

### Redis кэширование

**Файл:** `lib/chat-redis.ts`

**Функции:**

#### `cacheChatMessages(chatId, messages, cursor, direction)`
Кэширование сообщений чата.

**TTL:** 5 минут

**Ключ:** `chat:messages:${chatId}:${cursor || 'initial'}:${direction}`

#### `getCachedChatMessages(chatId, cursor, direction)`
Получение закэшированных сообщений.

#### `cacheChatData(chatId, chat)`
Кэширование данных чата.

**TTL:** 10 минут

**Ключ:** `chat:data:${chatId}`

#### `getCachedChatData(chatId)`
Получение закэшированных данных чата.

#### `invalidateChatCache(chatId)`
Инвалидация кэша чата.

**Использование:**
- При отправке нового сообщения
- При редактировании/удалении сообщения
- При изменении участников
- При изменении данных чата

### Оптимизации фронтенда

1. **Мемоизация компонентов**
   - `React.memo` для `MessageBubble`
   - `useMemo` для списка сообщений

2. **Ленивая загрузка изображений**
   - Blur placeholder для старых изображений
   - Lazy loading с Intersection Observer

3. **Сохранение позиции скролла**
   - Относительная позиция (расстояние от низа)
   - ID последнего видимого сообщения
   - Восстановление при возврате в чат

4. **Оптимистичные обновления**
   - Реакции обновляются мгновенно
   - Сообщения добавляются сразу

---

## Потоки данных

### Отправка сообщения

```
1. Пользователь вводит текст → ChatInput
2. handleSend() в useChat
3. POST /api/chat/[chatId]
4. Создание ChatMessage в БД
5. Отправка через WebSocket (emitNewMessage)
6. Обновление UI (оптимистично)
7. Получение подтверждения от сервера
8. Инвалидация кэша Redis
9. Отправка уведомлений участникам
```

### Загрузка сообщений

```
1. Компонент монтируется → SlackStyleMessages
2. loadMessages() в useChat
3. Проверка кэша Redis
4. Если нет в кэше → GET /api/chat/[chatId]
5. Загрузка из БД с пагинацией
6. Форматирование сообщений
7. Добавление activity messages (для обращений)
8. Добавление virtual messages (для постов каналов)
9. Кэширование в Redis
10. Обновление UI
11. Восстановление позиции скролла
```

### Реакции

```
1. Пользователь кликает на эмодзи → MessageBubble
2. toggleReaction() в useChat
3. Оптимистичное обновление UI
4. POST /api/chat/[chatId]/messages/[messageId]/reactions
5. Обновление в БД
6. Если канал и ❤️ → синхронизация с NewsLike
7. Отправка через WebSocket
8. Обновление UI всех участников
```

### Треды

```
1. Пользователь кликает "Ответить в треде" → MessageBubble
2. Открытие ThreadView
3. loadThread() в useChat
4. GET /api/chat/[chatId]?threadRootId=msg_id
5. Загрузка корневого сообщения и ответов
6. Отображение в ThreadView
7. Отправка ответа → handleSend() с threadRootId
8. Обновление threadRepliesCount
```

---

## Особенности реализации

### Виртуальные сообщения

Посты каналов отображаются как "виртуальные" сообщения до создания реального `ChatMessage`.

**ID формат:** `virtual_${postId}`

**Обработка:**
- При реакции создается реальный `ChatMessage`
- При загрузке сообщений создаются virtual messages из `NewsPost`

### Activity Messages

Для обращений (tickets) отображаются системные сообщения о действиях:
- Создание обращения
- Изменение статуса
- Закрытие обращения
- Оценка обращения

**Источник:** `TicketActionLog`

**Формат:**
```typescript
{
  id: `activity_${logId}`,
  isActivity: true,
  activityType: "created" | "status_changed" | "closed" | "rated",
  content: "Описание действия",
  createdAt: Date
}
```

### Синхронизация каналов с новостями

1. **Создание поста:**
   - Создается `NewsPost` в `NewsChannel`
   - Создается `ChatMessage` типа `channel_post`
   - JSON в `content` содержит `postId`, `title`, `content`, `coverImage`

2. **Реакции:**
   - Реакция ❤️ → создается/удаляется `NewsLike`
   - Другие реакции → только в чате

3. **Комментарии:**
   - Комментарии в канале → комментарии в новостях
   - Используется `/api/news/[id]/comments`

### Уведомления

**Типы:**
- `chat_message` - новое сообщение
- `chat_mention` - упоминание в сообщении
- `ticket_response` - ответ на обращение

**Отправка:**
- Push-уведомления через Firebase Cloud Messaging
- Запись в `UserNotification` для раздела "Уведомления"
- Email-уведомления (если включены)

**Метаданные:**
```typescript
{
  chatId: "chat_id",
  messageId: "msg_id",
  ticketId: "ticket_id",  // Для обращений
  ticketPublicId: "12345678"
}
```

### Обработка файлов

**Загрузка:**
- Сохранение в `/public/uploads/chat/`
- Генерация thumbnail для изображений
- Поддержка HEIC (конвертация в JPEG)
- Ограничение размера файла

**CDN:**
- Все файлы отдаются через CDN
- Функция `getFileUrlWithCDN()` добавляет CDN URL

**Отображение:**
- Изображения с lazy loading
- Blur placeholder для старых изображений
- Модальное окно для просмотра
- Скачивание файлов

### Безопасность

1. **Проверка доступа:**
   - `requireChatAccess()` - проверка участия в чате
   - Только участники могут видеть сообщения

2. **Валидация:**
   - Проверка прав на редактирование/удаление (только свои сообщения)
   - Проверка прав админа для управления участниками

3. **Санитизация:**
   - Markdown рендеринг с безопасными настройками
   - Защита от XSS

---

## Рекомендации по использованию

### Для разработчиков

1. **Добавление нового типа сообщения:**
   - Добавить `messageType` в `ChatMessage`
   - Создать компонент отображения в `MessageBubble`
   - Обновить форматирование в API

2. **Добавление новой реакции:**
   - Добавить эмодзи в `EmojiPicker`
   - Обработка уже есть в API

3. **Оптимизация производительности:**
   - Использовать мемоизацию для тяжелых компонентов
   - Ленивая загрузка для больших списков
   - Виртуализация для чатов с >1000 сообщений

### Для пользователей

1. **Личные чаты:**
   - Создаются автоматически при первом сообщении
   - Нельзя добавить третьего участника

2. **Групповые чаты:**
   - Создаются вручную
   - Админы могут управлять участниками

3. **Каналы:**
   - Только председатели могут публиковать
   - Все участники могут комментировать

4. **Обращения:**
   - Чат создается автоматически
   - Председатель всегда админ
   - История операций отображается в чате

---

## Troubleshooting

### Проблема: Сообщения не отправляются

**Решение:**
1. Проверить WebSocket соединение
2. Проверить права доступа к чату
3. Проверить консоль на ошибки

### Проблема: Реакции не отображаются

**Решение:**
1. Проверить, что `messageId` передается корректно
2. Для постов каналов проверить создание реального `ChatMessage`
3. Проверить кэш Redis

### Проблема: Позиция скролла не сохраняется

**Решение:**
1. Проверить localStorage (может быть переполнен)
2. Проверить, что `chatId` корректный
3. Проверить, что `restoreScrollPosition` вызывается

### Проблема: Уведомления не приходят

**Решение:**
1. Проверить настройки уведомлений пользователя
2. Проверить Firebase Cloud Messaging токен
3. Проверить логи отправки уведомлений

---

## Будущие улучшения

1. **Виртуализация списка сообщений** - для больших чатов
2. **Batch WebSocket updates** - группировка обновлений
3. **Database read replicas** - для масштабирования
4. **Service Worker** - для офлайн работы
5. **Message compression** - для больших сообщений
6. **Мягкое удаление** - добавить `deletedAt` в `ChatMessage`
7. **Голосовые сообщения** - запись и воспроизведение
8. **Видеозвонки** - интеграция с WebRTC

---

## Связанные документы

- [Chat Performance Optimization](./chat-performance-optimization.md)
- [API Documentation](../app/api/chat/README.md)
- [Database Schema](../prisma/schema.prisma)
