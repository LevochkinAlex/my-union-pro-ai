#!/bin/bash
# Однократное применение колонок ChatParticipant (deletedUserDisplayName, clearedAt) на продакшн.
# Запускать на сервере из корня проекта: bash scripts/fix-chat-participant-columns-on-server.sh

set +e

cd "$(dirname "$0")/.."

echo "🔧 Добавление колонок ChatParticipant (deletedUserDisplayName, clearedAt)..."

npx prisma db execute --file prisma/migrations/20260204100000_add_chat_participant_deleted_display_name/migration.sql --schema prisma/schema.prisma
if [ $? -eq 0 ]; then
  echo "✅ SQL выполнен"
else
  echo "⚠️  Колонки уже есть или ошибка (продолжаем...)"
fi

npx prisma migrate resolve --applied 20260204100000_add_chat_participant_deleted_display_name 2>/dev/null || true
echo "✅ Готово."
