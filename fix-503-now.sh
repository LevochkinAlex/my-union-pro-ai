#!/bin/bash

echo "=== Диагностика и исправление 503 ошибок ==="

sshpass -p 'wu,iMrZj6goZh?' ssh -o StrictHostKeyChecking=no root@194.87.49.210 << 'ENDSSH'
cd /opt/my-union-pro

echo "=== 1. Проверка PM2 статуса ==="
pm2 status

echo ""
echo "=== 2. Проверка последних логов ==="
pm2 logs my-union-pro --lines 20 --nostream

echo ""
echo "=== 3. Проверка наличия build файла ==="
ls -lh .next/server.js 2>&1 || echo "Build файл отсутствует!"

echo ""
echo "=== 4. Остановка PM2 процесса ==="
pm2 delete my-union-pro 2>/dev/null || echo "Процесс не найден или уже остановлен"

echo ""
echo "=== 5. Обновление кода ==="
git pull

echo ""
echo "=== 6. Пересборка проекта ==="
rm -rf .next
pnpm build

echo ""
echo "=== 7. Запуск приложения ==="
pm2 start npm --name "my-union-pro" -- start

echo ""
echo "=== 8. Ожидание запуска (5 сек) ==="
sleep 5

echo ""
echo "=== 9. Финальный статус PM2 ==="
pm2 status

echo ""
echo "=== 10. Проверка API ==="
curl -s -I https://myunion.pro/api/profile | head -1

echo ""
echo "=== Готово ==="
ENDSSH

echo ""
echo "=== Проверка сайта ==="
sleep 3
curl -s -I https://myunion.pro 2>&1 | head -3
