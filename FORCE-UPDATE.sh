#!/bin/bash
set -e

echo "=========================================="
echo "ПРИНУДИТЕЛЬНОЕ ОБНОВЛЕНИЕ СЕРВЕРА"
echo "=========================================="

cd /Users/renatusmanov/my-union-pro-ai

echo ""
echo "1. Проверка локального git..."
git log --oneline -3
git push origin HEAD

echo ""
echo "2. Принудительное обновление на сервере..."
sshpass -p 'wu,iMrZj6goZh?' ssh -o StrictHostKeyChecking=no root@194.87.49.210 bash << 'EOF'
cd /opt/my-union-pro

echo "--- Текущий коммит ---"
git log --oneline -1

echo "--- Fetch и reset ---"
git fetch origin
git reset --hard origin/main

echo "--- Новый коммит ---"
git log --oneline -1

echo "--- Версия ---"
grep version package.json

echo "--- Очистка сборки ---"
rm -rf .next
rm -rf node_modules/.cache

echo "--- Сборка ---"
pnpm build

echo "--- Перезапуск ---"
pm2 delete my-union-pro || true
pm2 start npm --name my-union-pro -- start
sleep 15

echo "--- Статус ---"
pm2 list

echo "--- Логи ---"
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
