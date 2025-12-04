#!/bin/bash

# Скрипт для исправления nginx и деплоя

echo "🔧 Исправление nginx конфигурации..."

ssh root@194.87.49.210 << 'EOF'
# Добавляем client_max_body_size в nginx конфигурацию
if ! grep -q "client_max_body_size" /etc/nginx/sites-enabled/myunion.pro; then
  # Добавляем в начало server блока
  sed -i '/server {/a\    client_max_body_size 50M;' /etc/nginx/sites-enabled/myunion.pro
  echo "✅ Добавлен client_max_body_size 50M"
else
  # Обновляем существующее значение
  sed -i 's/client_max_body_size.*/client_max_body_size 50M;/' /etc/nginx/sites-enabled/myunion.pro
  echo "✅ Обновлен client_max_body_size до 50M"
fi

# Проверяем конфигурацию
nginx -t

# Перезагружаем nginx
systemctl reload nginx
echo "✅ Nginx перезагружен"
EOF

echo ""
echo "🚀 Деплой приложения..."

cd /opt/my-union-pro || exit 1
git pull origin main
pnpm install
npx prisma generate
npx prisma migrate deploy
pnpm build
pm2 restart my-union-pro

echo "✅ Готово!"

