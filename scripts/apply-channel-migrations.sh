#!/bin/bash
# Скрипт для применения миграций каналов на продакшн сервере

set -e

echo "🔧 Применение миграций для каналов..."

# Применяем миграцию для добавления CHANNEL типа
echo "📝 Применяем миграцию: add_channel_chat_type"
npx prisma db execute --file prisma/migrations/20260121000000_add_channel_chat_type/migration.sql --schema prisma/schema.prisma

# Применяем миграцию для связи Chat с NewsChannel
echo "📝 Применяем миграцию: link_chat_news_channel"
npx prisma db execute --file prisma/migrations/20260121000001_link_chat_news_channel/migration.sql --schema prisma/schema.prisma

# Применяем миграцию для исправления структуры ChatMessageAttachment
echo "📝 Применяем миграцию: fix_chat_message_attachment_columns"
npx prisma db execute --file prisma/migrations/20260121130000_fix_chat_message_attachment_columns/migration.sql --schema prisma/schema.prisma

# Помечаем миграции как примененные
echo "✅ Помечаем миграции как примененные..."
npx prisma migrate resolve --applied 20260121000000_add_channel_chat_type
npx prisma migrate resolve --applied 20260121000001_link_chat_news_channel
npx prisma migrate resolve --applied 20260121130000_fix_chat_message_attachment_columns

# Генерируем Prisma Client
echo "🔄 Генерируем Prisma Client..."
npx prisma generate

echo "✅ Миграции применены успешно!"
