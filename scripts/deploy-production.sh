#!/bin/bash
# Скрипт для деплоя на продакшн сервер

set -e

echo "🚀 Деплой на продакшн сервер myunion.pro"
echo "========================================="

# Подключаемся к серверу и выполняем команды
# ⚠️ ВАЖНО: Используйте переменные окружения для паролей!
# Установите VDS_PASSWORD в переменных окружения перед запуском
VDS_PASSWORD="${VDS_PASSWORD:-YOUR_SSH_PASSWORD}"
VDS_HOST="${VDS_HOST:-194.87.49.210}"
VDS_USER="${VDS_USER:-root}"

if [ "$VDS_PASSWORD" = "YOUR_SSH_PASSWORD" ] || [ "$VDS_HOST" = "YOUR_SERVER_IP" ]; then
  echo "❌ Ошибка: Необходимо установить переменные окружения VDS_PASSWORD и VDS_HOST"
  echo "Пример: export VDS_PASSWORD='your_password' && export VDS_HOST='194.87.49.210'"
  exit 1
fi

echo "🔐 Подключение к ${VDS_USER}@${VDS_HOST}..."

sshpass -p "${VDS_PASSWORD}" ssh -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null ${VDS_USER}@${VDS_HOST} << 'ENDSSH'
  cd /opt/my-union-pro || exit 1
  
  echo "🛑 Останавливаем приложение..."
  pm2 stop my-union-pro || true
  
  echo "📥 Подтягиваем изменения из Git..."
  git stash --include-untracked || true
  git pull origin main
  git stash pop || true
  
  echo "📦 Устанавливаем зависимости..."
  npm install
  
  echo "🔧 Обновляем Prisma Client..."
  npx prisma generate
  
  echo "🗄️ Синхронизируем схему БД..."
  npx prisma db push
  
  echo "📚 Добавляем справочники должностей и профессий..."
  npx tsx prisma/seed-dictionaries.ts
  
  echo "🔨 Собираем приложение..."
  npm run build
  
  echo "🔄 Перезапускаем PM2..."
  pm2 restart my-union-pro
  pm2 save
  
  echo "✅ Деплой завершен!"
  echo ""
  echo "📊 Статус приложения:"
  pm2 list
  
  echo ""
  echo "📋 Последние логи:"
  pm2 logs my-union-pro --lines 20 --nostream
ENDSSH

echo ""
echo "✅ Деплой успешно завершен!"
echo "🌐 Проверьте: https://myunion.pro"

