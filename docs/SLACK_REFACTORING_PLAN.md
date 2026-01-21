# План рефакторинга: Создание аналога Slack

## 🎯 Цель

Превратить текущую систему чатов в полноценный аналог Slack с:
- Каналами (channels) вместо групп
- Прямыми сообщениями (DMs)
- Тредами для каждого сообщения
- Workspace/Организациями
- Поиском по сообщениям
- Уведомлениями и настройками
- Интеграциями

---

## 📊 Текущее состояние

### ✅ Что уже есть:
- Базовые чаты (PRIVATE, GROUP, TICKET)
- Треды (через `threadRootId`)
- WebSocket для real-time
- Реакции на сообщения
- Редактирование/удаление сообщений
- Вложения (attachments)
- Групповые чаты

### ❌ Чего не хватает:
- Каналы (channels) с публичным/приватным доступом
- Workspace/Организации как контейнеры
- Поиск по сообщениям
- Упоминания (@mentions)
- Закрепленные сообщения
- Закрепленные каналы
- Настройки уведомлений на уровне канала
- История активности
- Интеграции (webhooks, bots)

---

## 🗄️ Изменения в базе данных

### 1. Модель `Workspace` (новая)

```prisma
model Workspace {
  id          String   @id @default(cuid())
  name        String
  slug        String   @unique // URL-friendly имя
  description String?  @db.Text
  avatarUrl   String?
  
  // Владелец
  ownerId     String
  owner       User     @relation("WorkspaceOwner", fields: [ownerId], references: [id])
  
  // Участники workspace
  members     WorkspaceMember[]
  
  // Каналы workspace
  channels    Channel[]
  
  // Настройки
  settings    Json?    // Дополнительные настройки
  
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
  
  @@index([slug])
  @@index([ownerId])
}

model WorkspaceMember {
  id          String   @id @default(cuid())
  workspaceId String
  workspace   Workspace @relation(fields: [workspaceId], references: [id], onDelete: Cascade)
  userId      String
  user        User     @relation("WorkspaceMembers", fields: [userId], references: [id], onDelete: Cascade)
  
  // Роль в workspace
  role        WorkspaceRole @default(MEMBER) // OWNER, ADMIN, MEMBER
  
  // Настройки уведомлений для этого workspace
  notificationSettings Json?
  
  joinedAt    DateTime @default(now())
  
  @@unique([workspaceId, userId])
  @@index([workspaceId])
  @@index([userId])
}

enum WorkspaceRole {
  OWNER   // Владелец
  ADMIN   // Администратор
  MEMBER  // Участник
}
```

### 2. Модель `Channel` (новая, вместо GROUP чатов)

```prisma
model Channel {
  id          String   @id @default(cuid())
  workspaceId String
  workspace   Workspace @relation(fields: [workspaceId], references: [id], onDelete: Cascade)
  
  // Информация о канале
  name        String   // Название канала (без #)
  description String?  @db.Text
  topic       String?  @db.Text // Тема канала (отображается в заголовке)
  avatarUrl   String?
  
  // Тип канала
  type        ChannelType @default(PUBLIC) // PUBLIC, PRIVATE, DIRECT
  
  // Создатель
  createdById String
  createdBy   User     @relation("ChannelCreator", fields: [createdById], references: [id])
  
  // Участники канала
  members     ChannelMember[]
  
  // Сообщения в канале (связь с Chat)
  chatId      String?  @unique
  chat        Chat?    @relation("ChannelChat", fields: [chatId], references: [id])
  
  // Настройки
  isArchived  Boolean  @default(false)
  isGeneral   Boolean  @default(false) // Общий канал (нельзя удалить)
  
  // Закрепленные сообщения
  pinnedMessages ChannelPinnedMessage[]
  
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
  
  @@unique([workspaceId, name]) // Уникальное имя в рамках workspace
  @@index([workspaceId])
  @@index([type])
  @@index([isArchived])
}

enum ChannelType {
  PUBLIC   // Публичный канал (все видят)
  PRIVATE  // Приватный канал (только участники)
  DIRECT   // Прямой канал (2 участника, как DM)
}

model ChannelMember {
  id        String   @id @default(cuid())
  channelId String
  channel   Channel  @relation(fields: [channelId], references: [id], onDelete: Cascade)
  userId    String
  user      User     @relation("ChannelMembers", fields: [userId], references: [id], onDelete: Cascade)
  
  // Настройки уведомлений для этого канала
  notificationSettings Json? // { mentions: true, all: false, ... }
  
  // Последнее прочитанное сообщение
  lastReadMessageId String?
  lastReadAt        DateTime?
  
  joinedAt  DateTime @default(now())
  leftAt    DateTime?
  
  @@unique([channelId, userId])
  @@index([channelId])
  @@index([userId])
}

model ChannelPinnedMessage {
  id        String   @id @default(cuid())
  channelId String
  channel   Channel  @relation(fields: [channelId], references: [id], onDelete: Cascade)
  messageId String
  message   ChatMessage @relation(fields: [messageId], references: [id], onDelete: Cascade)
  pinnedById String
  pinnedBy   User     @relation("ChannelPinnedMessages", fields: [pinnedById], references: [id])
  
  pinnedAt  DateTime @default(now())
  
  @@unique([channelId, messageId])
  @@index([channelId])
}
```

### 3. Обновление модели `Chat`

```prisma
model Chat {
  id          String   @id @default(cuid())
  type        ChatType // PRIVATE, GROUP, TICKET, CHANNEL
  displayName String?
  avatarUrl   String?
  createdById String
  archivedAt  DateTime?
  
  // Связь с каналом (если type = CHANNEL)
  channel     Channel? @relation("ChannelChat")
  
  // Остальное без изменений
  participants ChatParticipant[]
  messages     ChatMessage[]
  tickets      Ticket[]
  
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
}
```

### 4. Добавление упоминаний (@mentions)

```prisma
model ChatMessage {
  // ... существующие поля ...
  
  // Упоминания в сообщении
  mentions    MessageMention[]
  
  // ... остальное ...
}

model MessageMention {
  id        String   @id @default(cuid())
  messageId String
  message   ChatMessage @relation(fields: [messageId], references: [id], onDelete: Cascade)
  userId    String   // Упомянутый пользователь
  user      User     @relation("MessageMentions", fields: [userId], references: [id])
  
  // Тип упоминания
  type      MentionType @default(USER) // USER, CHANNEL, HERE, EVERYONE
  
  createdAt DateTime @default(now())
  
  @@unique([messageId, userId, type])
  @@index([messageId])
  @@index([userId])
}

enum MentionType {
  USER      // @username
  CHANNEL   // #channel
  HERE      // @here (все онлайн)
  EVERYONE  // @everyone (все участники)
}
```

### 5. Поиск по сообщениям

```prisma
model MessageSearchIndex {
  id        String   @id @default(cuid())
  messageId String   @unique
  message   ChatMessage @relation(fields: [messageId], references: [id], onDelete: Cascade)
  
  // Индексированный текст для поиска
  searchText String   @db.Text
  
  // Метаданные для фильтрации
  chatId     String
  channelId  String?
  workspaceId String?
  senderId   String
  createdAt  DateTime
  
  @@index([searchText], type: Gin) // PostgreSQL GIN индекс для полнотекстового поиска
  @@index([chatId])
  @@index([channelId])
  @@index([workspaceId])
  @@index([senderId])
  @@index([createdAt])
}
```

---

## 🔄 Миграция данных

### Шаг 1: Создание Workspace для существующих организаций

```typescript
// scripts/migrate-to-workspaces.ts
// Для каждой Organization создаем Workspace
// Все существующие GROUP чаты становятся каналами
```

### Шаг 2: Конвертация GROUP чатов в Channels

```typescript
// Все Chat с type = "GROUP" конвертируем в Channel
// Создаем связь Chat -> Channel
```

### Шаг 3: Миграция участников

```typescript
// ChatParticipant -> ChannelMember
// Сохраняем роли и настройки
```

---

## 🎨 UI/UX изменения

### 1. Боковая панель (Sidebar)

```
┌─────────────────────────┐
│ Workspace: MyUnion      │
├─────────────────────────┤
│ 📢 Каналы               │
│   # general             │
│   # random               │
│   🔒 private-channel     │
│                         │
│ 👥 Прямые сообщения     │
│   @ Иван Иванов         │
│   @ Мария Петрова       │
│                         │
│ ➕ Создать канал        │
└─────────────────────────┘
```

### 2. Заголовок канала

```
┌─────────────────────────────────────────┐
│ # general                    [🔍] [ℹ️]  │
│ Обсуждение общих вопросов               │
└─────────────────────────────────────────┘
```

### 3. Сообщения с тредами

```
┌─────────────────────────────────────────┐
│ Иван Иванов 10:30                       │
│ Привет всем!                             │
│ └─ 3 ответа в треде [Показать]          │
│                                         │
│ Мария Петрова 10:35                     │
│ Отличная идея!                           │
└─────────────────────────────────────────┘
```

---

## 🔌 API изменения

### Новые endpoints

#### Workspace API
- `GET /api/workspaces` - Список workspace пользователя
- `POST /api/workspaces` - Создать workspace
- `GET /api/workspaces/[id]` - Информация о workspace
- `PATCH /api/workspaces/[id]` - Обновить workspace
- `DELETE /api/workspaces/[id]` - Удалить workspace

#### Channel API
- `GET /api/workspaces/[workspaceId]/channels` - Список каналов
- `POST /api/workspaces/[workspaceId]/channels` - Создать канал
- `GET /api/channels/[id]` - Информация о канале
- `PATCH /api/channels/[id]` - Обновить канал
- `POST /api/channels/[id]/join` - Присоединиться
- `POST /api/channels/[id]/leave` - Покинуть
- `POST /api/channels/[id]/members` - Добавить участника
- `DELETE /api/channels/[id]/members/[userId]` - Удалить участника

#### Search API
- `GET /api/search?q=query&workspaceId=...&channelId=...` - Поиск сообщений

#### Mentions API
- `GET /api/mentions` - Получить упоминания пользователя
- `GET /api/mentions/unread` - Непрочитанные упоминания

---

## 📝 Поэтапный план реализации

### Фаза 1: Базовая структура (2-3 недели)
- [ ] Создать модели `Workspace`, `Channel`, `ChannelMember`
- [ ] Миграция данных (GROUP -> Channel)
- [ ] API для workspace и channels
- [ ] Базовый UI для sidebar с каналами

### Фаза 2: Улучшения чата (1-2 недели)
- [ ] Упоминания (@mentions)
- [ ] Закрепленные сообщения
- [ ] Улучшенный UI для тредов
- [ ] Настройки уведомлений на уровне канала

### Фаза 3: Поиск и фильтры (1 неделя)
- [ ] Полнотекстовый поиск по сообщениям
- [ ] Фильтры (по дате, автору, каналу)
- [ ] Сохраненные поиски

### Фаза 4: Интеграции (2-3 недели)
- [ ] Webhooks для каналов
- [ ] Bot API
- [ ] Интеграции с внешними сервисами

### Фаза 5: Полировка (1-2 недели)
- [ ] История активности
- [ ] Статистика
- [ ] Экспорт данных
- [ ] Мобильная адаптация

---

## 🧪 Тестирование

### Unit тесты
- Логика создания workspace/channel
- Миграция данных
- Поиск по сообщениям

### Integration тесты
- API endpoints
- WebSocket события
- Упоминания и уведомления

### E2E тесты
- Создание канала
- Отправка сообщения с упоминанием
- Поиск сообщений

---

## 📚 Документация

После реализации:
- [ ] Обновить `AI_PROJECT_DOCUMENTATION.md`
- [ ] Создать `CHANNELS_GUIDE.md` для пользователей
- [ ] API документация (Swagger/OpenAPI)

---

## ⚠️ Важные замечания

1. **Обратная совместимость**: Старые GROUP чаты должны продолжать работать
2. **Миграция**: Постепенная миграция без downtime
3. **Производительность**: Индексы для поиска, пагинация
4. **Безопасность**: Проверка прав доступа к каналам
5. **Уведомления**: Push-уведомления для упоминаний

---

## 🎯 Критерии успеха

- ✅ Пользователи могут создавать каналы в workspace
- ✅ Треды работают для каждого сообщения
- ✅ Поиск находит релевантные сообщения
- ✅ Упоминания отправляют уведомления
- ✅ UI интуитивен и похож на Slack
- ✅ Производительность не ухудшилась
