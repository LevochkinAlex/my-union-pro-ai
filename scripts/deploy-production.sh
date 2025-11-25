#!/bin/bash
# Скрипт для деплоя на продакшн сервер

set -e

echo "🚀 Деплой на продакшн сервер myunion.pro"
echo "========================================="

# Подключаемся к серверу и выполняем команды
sshpass -p 'sAt,8?Bh+Ny_BW' ssh -o StrictHostKeyChecking=no root@194.87.49.210 << 'ENDSSH'
  cd /opt/my-union-pro || exit 1
  
  echo "🛑 Останавливаем приложение..."
  pm2 stop my-union-pro || true
  
  echo "📥 Подтягиваем изменения из Git..."
  git pull origin main
  
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

