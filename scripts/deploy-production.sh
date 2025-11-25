#!/bin/bash
# Скрипт для деплоя на продакшн сервер

set -e

echo "🚀 Деплой на продакшн сервер myunion.pro"
echo "========================================="

# Подключаемся к серверу и выполняем команды
ssh root@194.87.49.210 << 'ENDSSH'
  cd /root/my-union-pro-ai || exit 1
  
  echo "📥 Подтягиваем изменения из Git..."
  git pull origin main
  
  echo "📦 Устанавливаем зависимости..."
  npm install
  
  echo "🔨 Собираем приложение..."
  npm run build
  
  echo "🔄 Перезапускаем PM2..."
  pm2 restart my-union-dashboard
  
  echo "✅ Деплой завершен!"
  echo ""
  echo "📊 Статус приложения:"
  pm2 list
  
  echo ""
  echo "📋 Последние логи:"
  pm2 logs my-union-dashboard --lines 20 --nostream
ENDSSH

echo ""
echo "✅ Деплой успешно завершен!"
echo "🌐 Проверьте: https://myunion.pro"

