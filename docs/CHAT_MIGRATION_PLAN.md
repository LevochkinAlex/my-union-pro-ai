# План миграции с Matrix на собственный сервер чатов

## Цель
Заменить Matrix на простой WebSocket + REST API сервер для чатов, сохранив весь текущий UI.

## Текущая архитектура
- **UI**: `components/chat/MatrixChat.tsx` (~3800 строк)
- **API**: REST endpoints в `app/api/chat/`
- **Matrix**: Интеграция через `lib/matrix-client.ts`, `lib/matrix-messages.ts`
- **WebSocket**: Есть базовый сервер в `server/socket-server.ts`

## Новая архитектура

### 1. База данных
**Создать модели для сообщений:**
```prisma
model ChatMessage {
  id          String   @id @default(cuid())
  chatId      String
  chat        Chat     @relation(fields: [chatId], references: [id], onDelete: Cascade)
  senderId    String
  sender      User     @relation(fields: [senderId], references: [id])
  content     String   @db.Text
  messageType String   @default("text") // text, image, file, etc.
  
  // Для ответов
  replyToId   String?
  replyTo     ChatMessage? @relation("MessageReplies", fields: [replyToId], references: [id])
  replies     ChatMessage[] @relation("MessageReplies")
  
  // Редактирование
  editedAt    DateTime?
  
  // Вложения
  attachments ChatMessageAttachment[]
  
  // Реакции
  reactions   ChatMessageReaction[]
  
  // Метрики
  readBy      ChatMessageRead[]
  
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
  
  @@index([chatId, createdAt])
  @@index([senderId])
}

model ChatMessageAttachment {
  id          String      @id @default(cuid())
  messageId   String
  message     ChatMessage @relation(fields: [messageId], references: [id], onDelete: Cascade)
  type        String      // image, file, video, audio
  url         String
  name        String
  size        Int?
  mimeType    String?
  thumbnailUrl String?
  width       Int?
  height      Int?
  
  createdAt   DateTime    @default(now())
}

model ChatMessageReaction {
  id          String      @id @default(cuid())
  messageId   String
  message     ChatMessage @relation(fields: [messageId], references: [id], onDelete: Cascade)
  userId      String
  user        User        @relation(fields: [userId], references: [id])
  emoji       String      // 🎉, 👍, ❤️ и т.д.
  
  createdAt   DateTime    @default(now())
  
  @@unique([messageId, userId, emoji])
  @@index([messageId])
}

model ChatMessageRead {
  id          String      @id @default(cuid())
  messageId   String
  message     ChatMessage @relation(fields: [messageId], references: [id], onDelete: Cascade)
  userId      String
  user        User        @relation(fields: [userId], references: [id])
  
  readAt      DateTime    @default(now())
  
  @@unique([messageId, userId])
  @@index([userId])
}

// Обновить модель Chat
model Chat {
  // ... существующие поля ...
  matrixRoomId String? // УДАЛИТЬ после миграции
  
  // Добавить поля для нашего сервера
  lastMessageId   String?
  lastMessage     ChatMessage? @relation(fields: [lastMessageId], references: [id])
  lastMessageAt   DateTime?
  
  messages        ChatMessage[]
}
```

### 2. WebSocket сервер (`server/chat-server.ts`)
**Расширить существующий `socket-server.ts`:**

```typescript
// Основные события:
- message:new - новое сообщение
- message:updated - сообщение отредактировано
- message:deleted - сообщение удалено
- typing:start - пользователь печатает
- typing:stop - пользователь перестал печатать
- read:update - обновление статуса прочитано
- reaction:add - добавлена реакция
- reaction:remove - удалена реакция
- user:online - пользователь онлайн
- user:offline - пользователь оффлайн
```

### 3. REST API (`app/api/chat/`)
**Обновить существующие endpoints:**

- `GET /api/chat` - список чатов (убрать Matrix)
- `POST /api/chat` - создать чат
- `GET /api/chat/[chatId]/messages` - получить сообщения
- `POST /api/chat/[chatId]/messages` - отправить сообщение
- `PUT /api/chat/[chatId]/messages/[messageId]` - редактировать сообщение
- `DELETE /api/chat/[chatId]/messages/[messageId]` - удалить сообщение
- `POST /api/chat/[chatId]/messages/[messageId]/reactions` - добавить/удалить реакцию
- `POST /api/chat/[chatId]/messages/[messageId]/read` - отметить как прочитанное
- `POST /api/chat/[chatId]/attachments` - загрузить вложение

### 4. UI компонент (`components/chat/Chat.tsx`)
**Переписать `MatrixChat.tsx` → `Chat.tsx`:**

```typescript
// Убрать всю Matrix логику:
- Matrix sync
- Matrix credentials
- Matrix API calls

// Заменить на:
- WebSocket подключение
- REST API для загрузки истории
- Простая отправка через WebSocket
```

## План миграции

### Этап 1: Подготовка (1-2 часа)
1. ✅ Создать Prisma миграцию для новых моделей
2. ✅ Обновить `lib/chat-service.ts` - убрать Matrix зависимости
3. ✅ Создать новый WebSocket сервер

### Этап 2: Бэкенд API (2-3 часа)
1. ✅ Обновить все REST endpoints
2. ✅ Добавить отправку сообщений через WebSocket
3. ✅ Реализовать реакции, редактирование, удаление

### Этап 3: UI миграция (3-4 часа)
1. ✅ Создать новый `components/chat/Chat.tsx`
2. ✅ Заменить Matrix логику на WebSocket + REST
3. ✅ Сохранить весь UI (стили, компоненты, функционал)

### Этап 4: Тестирование и деплой (1-2 часа)
1. ✅ Протестировать все функции
2. ✅ Удалить Matrix зависимости
3. ✅ Деплой

### Этап 5: Очистка (30 минут)
1. ✅ Удалить Matrix код из проекта
2. ✅ Удалить `matrixRoomId` из БД
3. ✅ Обновить документацию

## Преимущества нового решения
- ✅ **Простота** - один сервер, без внешних зависимостей
- ✅ **Полный контроль** - все данные у нас в БД
- ✅ **Производительность** - прямой доступ к данным
- ✅ **Гибкость** - легко добавлять новые функции
- ✅ **Отладка** - проще искать проблемы
- ✅ **UI остается** - пользователи не заметят изменений

## Время выполнения: ~8-10 часов
