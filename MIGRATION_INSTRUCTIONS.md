# Инструкция по полной миграции на Matrix

## ⚠️ ВНИМАНИЕ! 

Это **деструктивная** операция, которая удалит:
- Все чаты без `matrixRoomId`
- Все старые сообщения из БД
- Все обращения/тикеты
- Legacy поля из схемы БД

## Шаги миграции

### 1. Очистка данных (ОСТОРОЖНО!)

```bash
# На сервере
ssh root@79.143.29.66
cd /opt/my-union-pro
git pull
node scripts/cleanup-and-migrate-to-matrix.mjs --confirm
```

### 2. Применение миграции БД

```bash
# На сервере
cd /opt/my-union-pro
pnpm prisma migrate deploy
# Или для разработки:
pnpm prisma migrate dev --name remove_legacy_chat_fields
```

### 3. Регенерация Prisma Client

```bash
pnpm prisma generate
```

### 4. Удаление legacy кода

После миграции БД нужно:
1. Удалить все проверки `participant1Id`/`participant2Id` из `lib/chat-service.ts`
2. Удалить код работы с `ChatMessage` (все сообщения теперь в Matrix)
3. Обновить все API endpoints

### 5. Сборка и перезапуск

```bash
pnpm build
pm2 restart my-union-pro --update-env
pm2 restart matrix-bot --update-env
```

## Что останется

После миграции:
- ✅ Все чаты будут иметь `matrixRoomId`
- ✅ Все сообщения будут храниться только в Matrix
- ✅ Чистая схема БД без legacy полей
- ✅ Единая система через `ChatParticipant`

## Проверка после миграции

```bash
# Проверить чаты
node scripts/validate-and-fix-all-chats.mjs

# Проверить, что нет чатов без matrixRoomId
psql -d myunion_pro -c "SELECT COUNT(*) FROM \"Chat\" WHERE \"matrixRoomId\" IS NULL;"
```

## Откат (если что-то пошло не так)

Если нужен откат:
1. Восстановить БД из бэкапа
2. Вернуть код из git
3. Перезапустить приложение
