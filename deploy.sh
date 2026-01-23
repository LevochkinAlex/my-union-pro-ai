#!/bin/bash

# Скрипт деплоя на продакшн сервер
# Использование: ./deploy.sh

set -e

echo "🚀 Начинаем деплой на сервер..."

# Запускаем проверки перед деплоем
echo "🧪 Запуск pre-deploy проверок..."
if pnpm pre-deploy; then
  echo "✅ Pre-deploy проверки пройдены"
else
  echo "❌ Pre-deploy проверки не пройдены! Прерываем деплой."
  exit 1
fi
echo ""

SERVER="root@194.87.49.210"
PROJECT_PATH="/opt/my-union-pro"

echo "📦 Подключение к серверу и обновление кода..."
ssh $SERVER << 'ENDSSH'
cd /opt/my-union-pro
echo "📥 Получаем последние изменения из git..."
git pull origin main

echo "📦 Устанавливаем зависимости..."
pnpm install

echo "🗄️  Применяем миграции базы данных..."
pnpm prisma migrate deploy

echo "🔧 Генерируем Prisma клиент..."
pnpm prisma generate

echo "🏗️  Собираем проект..."
pnpm build

echo "🔄 Перезапускаем приложение..."
pm2 restart my-union-pro

echo "🔄 Перезапускаем socket-server..."
pm2 restart my-union-socket

echo "📋 Статус сервисов:"
pm2 status

echo "📋 Последние логи:"
pm2 logs my-union-pro --lines 30 --nostream

echo "✅ Деплой завершен!"
ENDSSH

echo ""
echo "✅ Деплой успешно выполнен!"
echo ""
echo "🔍 Проверьте логи:"
echo "   ssh $SERVER 'pm2 logs my-union-pro --lines 50'"
echo ""
echo "🔍 Проверьте статус:"
echo "   ssh $SERVER 'pm2 status'"
