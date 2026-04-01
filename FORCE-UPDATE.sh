#!/bin/bash
set -e

# Пароль: export VDS_PASSWORD='...' или VDS_PASSWORD в .env / vds.deploy.env (не коммитить пароли в этот файл)
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"
if [ -z "${VDS_PASSWORD:-}" ] && [ -f "$SCRIPT_DIR/vds.deploy.env" ]; then
  # shellcheck source=/dev/null
  source "$SCRIPT_DIR/vds.deploy.env"
fi
if [ -z "${VDS_PASSWORD:-}" ] && [ -f "$SCRIPT_DIR/.env" ]; then
  VDS_PASSWORD=$(grep -E '^VDS_PASSWORD=' "$SCRIPT_DIR/.env" 2>/dev/null | sed 's/^VDS_PASSWORD=//' | sed 's/^["'\'']//;s/["'\'']$//' | head -1)
  export VDS_PASSWORD
fi
VDS_PASSWORD="${VDS_PASSWORD:?Задайте VDS_PASSWORD или добавьте в .env / vds.deploy.env}"

echo "=========================================="
echo "ПРИНУДИТЕЛЬНОЕ ОБНОВЛЕНИЕ СЕРВЕРА"
echo "=========================================="

echo ""
echo "1. Проверка локального git..."
git log --oneline -3
git push origin HEAD

echo ""
echo "2. Принудительное обновление на сервере..."
sshpass -p "$VDS_PASSWORD" ssh -o StrictHostKeyChecking=no root@194.87.49.210 bash << 'EOF'
cd /opt/my-union-pro

echo "--- Текущий коммит ---"
git log --oneline -1

echo "--- Fetch и reset ---"
git fetch origin
git reset --hard origin/main

echo "--- Новый коммит ---"
git log --oneline -1

echo "--- Версия ---"
grep '"version"' package.json | head -1

echo "--- Зависимости и миграции ---"
pnpm install
npx prisma migrate deploy

echo "--- Очистка сборки ---"
rm -rf .next
rm -rf node_modules/.cache

echo "--- Сборка ---"
pnpm build

echo "--- Перезапуск ---"
pm2 restart my-union-pro
pm2 restart my-union-socket
pm2 save

echo "--- Статус ---"
pm2 list

echo "--- Логи (последние строки) ---"
pm2 logs my-union-pro --lines 10 --nostream | tail -10
EOF

echo ""
echo "3. Проверка API..."
sleep 5
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" https://myunion.pro/api/profile)
echo "HTTP код: $HTTP_CODE"

echo ""
echo "=========================================="
echo "ОБНОВЛЕНИЕ ЗАВЕРШЕНО"
echo "=========================================="
