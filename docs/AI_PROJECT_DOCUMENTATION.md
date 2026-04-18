# Документация проекта MyUnion Pro для ИИ

## 🎯 Обзор проекта

**MyUnion Pro** - это платформа для управления профсоюзом с AI-ассистентом, построенная на Next.js 14+ (App Router), PostgreSQL (Prisma ORM), и WebSocket для real-time коммуникации.

### Ключевые технологии
- **Frontend**: Next.js 14+ (App Router), React, TypeScript, Tailwind CSS
- **Backend**: Next.js API Routes, Prisma ORM, PostgreSQL
- **Real-time**: WebSocket (Socket.IO) - кастомный сервер (`server/chat-server.ts`)
- **AI**: Yandex Foundation Models (YandexGPT + text-embedding) с поддержкой баз знаний (RAG)
- **Auth**: NextAuth.js с поддержкой SMS, Email, Yandex OAuth
- **Deployment**: PM2 на VDS (79.143.29.66). БД — PostgreSQL в VK Cloud (83.166.237.161, myunion_db).

### ⚠️ ВАЖНО: Matrix удален полностью
- Все упоминания Matrix удалены из кода
- Используется кастомный WebSocket сервер для чатов
- База данных не содержит `matrixRoomId` в модели `Chat`

---

## 📁 Структура проекта

```
my-union-pro-ai/
├── app/                          # Next.js App Router
│   ├── (auth)/                   # Страницы авторизации
│   ├── api/                      # API Routes
│   │   ├── chat/                 # Чат API (без Matrix)
│   │   │   ├── [chatId]/        # Операции с чатом
│   │   │   │   ├── messages/    # Сообщения
│   │   │   │   ├── attachments/ # Вложения
│   │   │   │   └── ...
│   │   │   ├── rooms/           # Список комнат
│   │   │   └── route.ts         # Создание чата
│   │   └── ...
│   ├── dashboard/                # Основной интерфейс
│   └── ...
├── components/                    # React компоненты
│   ├── chat/                     # Компоненты чата
│   │   ├── MatrixChat.tsx       # Главный компонент чата (название устарело)
│   │   ├── ChatMessages.tsx      # Список сообщений
│   │   ├── MessageItem.tsx      # Отдельное сообщение
│   │   ├── ThreadView.tsx       # Просмотр треда
│   │   └── GroupChatModal.tsx   # Создание группы
│   └── ...
├── server/                       # Серверные процессы
│   ├── chat-server.ts           # WebSocket сервер для чатов
│   └── socket-server.ts         # Общий Socket.IO сервер
├── lib/                          # Утилиты и сервисы
│   ├── chat-service.ts          # Логика работы с чатами
│   ├── prisma.ts                 # Prisma клиент
│   └── ...
├── prisma/
│   ├── schema.prisma            # Схема базы данных
│   └── migrations/              # Миграции
└── scripts/                     # Скрипты для администрирования
```

---

## 🗄️ База данных (Prisma Schema)

### Основные модели для чатов

#### `Chat` - Чат
```prisma
model Chat {
  id          String   @id @default(cuid())
  type        ChatType // PRIVATE, GROUP, TICKET
  displayName String?  // Для групповых чатов
  avatarUrl   String?  // Аватар чата
  createdById String   // Создатель
  archivedAt  DateTime? // Архивирован ли
  
  participants ChatParticipant[]
  messages     ChatMessage[]
  tickets      Ticket[] // Обращения связанные с чатом
}
```

#### `ChatMessage` - Сообщение
```prisma
model ChatMessage {
  id            String   @id @default(cuid())
  chatId        String
  senderId      String
  content       String   @db.Text
  messageType   String   @default("text") // text, image, file, video, audio
  replyToId     String?  // Ответ на сообщение
  threadRootId  String?  // ID корневого сообщения треда
  editedAt      DateTime?
  deletedAt     DateTime?
  
  attachments   ChatMessageAttachment[]
  reactions     ChatMessageReaction[]
  reads         ChatMessageRead[]
  replies       ChatMessage[] @relation("ThreadReplies")
}
```

#### `ChatParticipant` - Участник чата
```prisma
model ChatParticipant {
  id        String   @id @default(cuid())
  chatId    String
  userId    String
  role      String   @default("member") // member, admin
  joinedAt  DateTime @default(now())
  leftAt    DateTime?
}
```

### Типы чатов
- **PRIVATE** - Личный чат между двумя пользователями
- **GROUP** - Групповой чат
- **TICKET** - Чат для обращения (связан с `Ticket`)

---

## 🔌 WebSocket API (Socket.IO)

### Сервер: `server/chat-server.ts`

#### События от клиента к серверу:

**`chat:join`** - Присоединиться к чату
```typescript
socket.emit("chat:join", chatId: string)
```

**`message:send`** - Отправить сообщение
```typescript
socket.emit("message:send", {
  chatId: string,
  content: string,
  messageType?: "text" | "image" | "file",
  replyToId?: string,      // Ответ на сообщение
  threadRootId?: string,    // Ответ в треде
  attachments?: Array<{...}>
}, callback: (response) => void)
```

**`typing:start`** / **`typing:stop`** - Индикатор печати
```typescript
socket.emit("typing:start", chatId: string)
socket.emit("typing:stop", chatId: string)
```

**`read:mark`** - Отметить как прочитанное
```typescript
socket.emit("read:mark", { chatId: string, messageId: string })
```

**`reaction:toggle`** - Добавить/удалить реакцию
```typescript
socket.emit("reaction:toggle", { messageId: string, emoji: string })
```

#### События от сервера к клиенту:

**`message:new`** - Новое сообщение
```typescript
socket.on("message:new", (message: ChatMessage) => {})
```

**`message:updated`** - Сообщение обновлено
```typescript
socket.on("message:updated", (message: ChatMessage) => {})
```

**`message:deleted`** - Сообщение удалено
```typescript
socket.on("message:deleted", ({ messageId, chatId }) => {})
```

**`thread:new`** - Новый ответ в треде
```typescript
socket.on("thread:new", ({ threadRootId, message }) => {})
```

**`typing:start`** / **`typing:stop`** - Кто-то печатает
```typescript
socket.on("typing:start", ({ chatId, userId, userName }) => {})
socket.on("typing:stop", ({ chatId, userId }) => {})
```

**`read:update`** - Обновление статуса прочитано
```typescript
socket.on("read:update", ({ chatId, userId, messageId }) => {})
```

**`reaction:add`** / **`reaction:remove`** - Реакция
```typescript
socket.on("reaction:add", ({ messageId, userId, emoji }) => {})
socket.on("reaction:remove", ({ messageId, userId, emoji }) => {})
```

---

## 🌐 REST API

### Чат API (`/api/chat`)

#### `GET /api/chat` - Список чатов пользователя
```typescript
Response: {
  chats: Array<{
    id: string
    type: "PRIVATE" | "GROUP" | "TICKET"
    displayName?: string
    avatarUrl?: string
    lastMessage?: { content: string, createdAt: Date }
    unreadCount: number
    participants: Array<{ id: string, firstName: string, ... }>
  }>
}
```

#### `POST /api/chat` - Создать чат
```typescript
Request: {
  targetUserId?: string  // Для личного чата
  participantIds?: string[] // Для группового чата
  name?: string // Название группы
}
Response: {
  chat: {
    id: string
    type: string
    otherUser?: { id, firstName, lastName, ... }
  }
}
```

#### `GET /api/chat/[chatId]/messages` - Получить сообщения
```typescript
Query params:
  - limit?: number (default: 50)
  - before?: string (messageId для пагинации)
  - threadRootId?: string (для тредов)

Response: {
  messages: Array<{
    id: string
    senderId: string
    sender: { firstName, lastName, avatarUrl }
    content: string
    messageType: string
    createdAt: Date
    replyTo?: { id, content, sender }
    threadRepliesCount?: number
    reactions?: Record<string, { count: number, userIds: string[] }>
    attachments?: Array<{ type, url, name }>
  }>
}
```

#### `POST /api/chat/[chatId]` - Отправить сообщение
```typescript
Request: {
  content: string
  messageType?: "text" | "image" | "file"
  replyToId?: string
  threadRootId?: string
  attachments?: Array<{...}>
}
```

#### `POST /api/chat/[chatId]/messages/[messageId]/reactions` - Реакция
```typescript
Request: {
  emoji: string
}
```

#### `PATCH /api/chat/[chatId]/messages/[messageId]` - Редактировать
```typescript
Request: {
  content: string
}
```

#### `DELETE /api/chat/[chatId]/messages/[messageId]` - Удалить
```typescript
Response: { success: boolean }
```

---

## 🧵 Треды (Threads)

Треды реализованы как ответы на сообщения с `threadRootId`.

### Создание треда
1. Пользователь нажимает "Ответить в треде" на сообщение
2. Отправляется сообщение с `threadRootId = message.id`
3. Сообщение отображается в треде, а не в основном чате

### Просмотр треда
- Компонент `ThreadView.tsx` показывает все ответы в треде
- API: `GET /api/chat/[chatId]/messages?threadRootId=[rootId]`

### Обновления в реальном времени
- WebSocket событие `thread:new` отправляется всем участникам чата
- Обновляется счетчик `threadRepliesCount` в корневом сообщении

---

## 👥 Групповые чаты

### Создание группы
1. Компонент `GroupChatModal.tsx`
2. API: `POST /api/chat` с `participantIds` и `name`
3. Создатель автоматически получает роль `admin`

### Управление участниками
- Добавление: `POST /api/chat/[chatId]/participants`
- Удаление: `DELETE /api/chat/[chatId]/participants/[userId]`
- Изменение роли: `PATCH /api/chat/[chatId]/participants/[userId]`

---

## 🤖 AI Чат

### Особенности
- Каждый пользователь имеет дефолтный AI чат (`type: PRIVATE` с ботом)
- AI чат всегда закреплен в списке чатов
- Приветственное сообщение с кнопками популярных вопросов
- Поддержка Markdown в сообщениях

### База знаний пользователя
- Модель `UserKnowledgeBase` хранит информацию о пользователе
- Автоматически обновляется при изменении профиля
- Используется для персонализации ответов AI

### API для AI
- `POST /api/chat/[chatId]` - отправка сообщения AI
- AI обрабатывается через Yandex Foundation Models API
- Контекст берется из `UserKnowledgeBase`

---

## 🔐 Аутентификация

### NextAuth.js
- Провайдеры: Email, SMS (PIN), Yandex OAuth
- Сессия хранится в JWT
- WebSocket использует JWT токен для авторизации

### WebSocket авторизация
```typescript
// В chat-server.ts
const token = socket.handshake.auth.token;
const decoded = verify(token, process.env.NEXTAUTH_SECRET);
socket.data.userId = decoded.sub;
```

---

## 📦 Зависимости

### Основные пакеты
```json
{
  "next": "^14.x",
  "react": "^18.x",
  "prisma": "^5.x",
  "@prisma/client": "^5.x",
  "socket.io": "^4.x",
  "socket.io-client": "^4.x",
  "next-auth": "^4.x",
  "react-markdown": "^9.x",
  "remark-gfm": "^4.x"
}
```

---

## 🚀 Деплой

### Сервер приложения
- **Host**: 79.143.29.66
- **Path**: `/opt/my-union-pro`
- **PM2**: `my-union-pro` (Next.js), `my-union-socket` (WebSocket)

### База данных
- **VK Cloud PostgreSQL**: 83.166.237.161, база `myunion_db`. На сервере и локально в `DATABASE_URL` указан этот хост.

### Команды деплоя
```bash
ssh root@79.143.29.66
cd /opt/my-union-pro
git pull origin main
pnpm install
npx prisma migrate deploy   # миграции в БД VK Cloud
pnpm build
pm2 restart my-union-pro
pm2 restart my-union-socket
```

---

## ⚠️ Важные замечания для ИИ

1. **Matrix полностью удален** - не используйте `matrixRoomId`, `matrixUserId`, `matrixFetch` и т.д.
2. **WebSocket сервер** - основной способ real-time коммуникации
3. **Треды** - реализованы через `threadRootId` в `ChatMessage`
4. **Группы** - через `Chat.type = "GROUP"` и `ChatParticipant`
5. **AI чат** - всегда `PRIVATE` с ботом, закреплен в списке
6. **Кэширование** - используется `withCache` для API ответов
7. **Обращения (Tickets)** - связаны с чатами через `Ticket.chatId`

---

## 🔄 Миграция с Matrix

Все упоминания Matrix удалены:
- ✅ `matrixRoomId` удален из `Chat`
- ✅ `matrixUserId` удален из `User`
- ✅ Все `matrixFetch` вызовы заменены на REST API
- ✅ WebSocket сервер заменяет Matrix sync
- ✅ Медиа файлы хранятся на VDS, не в Matrix

---

## 📝 TODO для рефакторинга

См. `docs/SLACK_REFACTORING_PLAN.md` для плана создания полноценного аналога Slack.
