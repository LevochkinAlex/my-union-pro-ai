#!/bin/bash
# ПОЛНЫЙ ДЕПЛОЙ - запустите этот скрипт

set -e

echo "🚀 НАЧАЛО ДЕПЛОЯ"
echo ""

cd /Users/renatusmanov/my-union-pro-ai

echo "1️⃣ Коммит изменений..."
git add -A
git commit -m "Fix: версия 1.7.2, исправления создания чата и уведомлений" || echo "Уже закоммичено"
git push

echo ""
echo "2️⃣ Деплой на сервер..."
sshpass -p 'wu,iMrZj6goZh?' ssh -o StrictHostKeyChecking=no root@194.87.49.210 bash << 'SERVERDEPLOY'
cd /opt/my-union-pro
echo "📥 Обновление кода..."
git pull
echo "📋 Версия:"
grep version package.json
echo "🏗️ Сборка..."
pnpm build
echo "🔄 Перезапуск..."
pm2 delete my-union-pro || true
pm2 start npm --name my-union-pro -- start
sleep 12
echo "✅ Статус:"
pm2 list
echo "📝 Логи:"
pm2 logs my-union-pro --lines 10 --nostream | tail -10
SERVERDEPLOY

echo ""
echo "3️⃣ Проверка API..."
sleep 8
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" https://myunion.pro/api/profile)
echo "HTTP код: $HTTP_CODE"

if [ "$HTTP_CODE" = "200" ] || [ "$HTTP_CODE" = "401" ]; then
    echo "✅ СЕРВЕР РАБОТАЕТ!"
else
    echo "⚠️ Проблема: HTTP $HTTP_CODE"
fi

echo ""
echo "🎉 ДЕПЛОЙ ЗАВЕРШЕН"
