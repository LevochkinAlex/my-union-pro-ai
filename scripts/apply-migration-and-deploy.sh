#!/bin/bash
set -e

echo "🚀 Применяем миграцию и деплоим обновления..."

# SSH подключение к серверу
SSH_CMD="sshpass -p 'wu,iMrZj6goZh?' ssh -o StrictHostKeyChecking=no root@194.87.49.210"
PROJECT_DIR="/opt/my-union-pro"

# 1. Применяем миграцию БД
echo "📦 Применяем миграцию БД..."
$SSH_CMD "cd $PROJECT_DIR && pnpm prisma migrate deploy"

# 2. Генерируем Prisma Client
echo "⚙️  Генерируем Prisma Client..."
$SSH_CMD "cd $PROJECT_DIR && pnpm prisma generate"

# 3. Очищаем историю ИИ
echo "🧹 Очищаем историю ИИ..."
$SSH_CMD "cd $PROJECT_DIR && node scripts/clear-ai-chat-history.mjs"

# 4. Собираем проект
echo "🔨 Собираем проект..."
$SSH_CMD "cd $PROJECT_DIR && pnpm build"

# 5. Перезапускаем приложение
echo "🔄 Перезапускаем приложение..."
$SSH_CMD "pm2 restart my-union-pro"

# 6. Запускаем WebSocket сервер (если еще не запущен)
echo "🌐 Проверяем WebSocket сервер..."
$SSH_CMD "pm2 list | grep chat-server || pm2 start server/chat-server.ts --name chat-server --interpreter tsx || pm2 start 'pnpm socket:chat' --name chat-server"

echo "✅ Деплой завершен!"
