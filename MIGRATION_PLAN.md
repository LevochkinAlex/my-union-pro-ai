# План миграции на Matrix

## Этап 1: Очистка данных (ВЫПОЛНЕНО)

1. ✅ Создан скрипт `scripts/cleanup-and-migrate-to-matrix.mjs`
   - Удаляет все чаты без matrixRoomId
   - Удаляет все старые сообщения
   - Удаляет все обращения/тикеты
   - Мигрирует чаты на новую схему

## Этап 2: Обновление схемы БД

1. ✅ Удалены legacy поля из `Chat`:
   - `participant1Id`, `participant2Id`
   - `participant1ReadAt`, `participant2ReadAt`
   - `participant1ClearedAt`, `participant2ClearedAt`
   - `lastMessage` (сообщения теперь только в Matrix)

2. ✅ Обновлена схема Prisma
   - Удалены связи `chatsAsParticipant1`, `chatsAsParticipant2`
   - Оставлена только `chatParticipants`

3. 📝 Модели `ChatMessage` и `ChatMessageAttachment` закомментированы (для будущего удаления)

## Этап 3: Очистка кода (TODO)

1. Удалить legacy код из `lib/chat-service.ts`:
   - Все проверки `participant1Id`/`participant2Id`
   - Поддержку старой схемы

2. Удалить код работы с `ChatMessage`:
   - API endpoints для сообщений
   - Функции сохранения сообщений

3. Обновить компоненты чата:
   - Убрать использование старых полей
   - Использовать только Matrix API

## Этап 4: Тестирование

1. Проверить создание новых чатов
2. Проверить отправку сообщений через Matrix
3. Проверить получение сообщений из Matrix
4. Проверить push-уведомления

## Команды для выполнения

```bash
# 1. Очистка данных (ОСТОРОЖНО! Удаляет все данные)
node scripts/cleanup-and-migrate-to-matrix.mjs --confirm

# 2. Применение миграции БД
pnpm prisma migrate dev --name remove_legacy_chat_fields

# 3. Регенерация Prisma Client
pnpm prisma generate

# 4. Сборка и перезапуск
pnpm build
pm2 restart my-union-pro
```
