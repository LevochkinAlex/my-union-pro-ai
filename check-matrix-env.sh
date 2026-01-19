#!/bin/bash

echo "=== Проверка переменных окружения Matrix на сервере ==="

sshpass -p 'wu,iMrZj6goZh?' ssh -o StrictHostKeyChecking=no root@194.87.49.210 << 'ENDSSH'
cd /opt/my-union-pro

echo ""
echo "=== 1. Проверка файлов .env ==="
ls -la .env* 2>&1

echo ""
echo "=== 2. Проверка .env.local ==="
if [ -f .env.local ]; then
  echo "Файл .env.local существует"
  if grep -q "^MATRIX_SERVER_URL" .env.local; then
    echo "MATRIX_SERVER_URL найден:"
    grep "^MATRIX_SERVER_URL" .env.local | head -1
  else
    echo "MATRIX_SERVER_URL НЕ найден"
  fi
  
  if grep -q "^MATRIX_ADMIN_TOKEN" .env.local; then
    echo "MATRIX_ADMIN_TOKEN найден (скрыт):"
    grep "^MATRIX_ADMIN_TOKEN" .env.local | head -1 | sed 's/=.*/=***HIDDEN***/'
  else
    echo "MATRIX_ADMIN_TOKEN НЕ найден"
  fi
else
  echo "Файл .env.local НЕ существует"
fi

echo ""
echo "=== 3. Проверка .env ==="
if [ -f .env ]; then
  echo "Файл .env существует"
  if grep -q "^MATRIX_SERVER_URL" .env; then
    echo "MATRIX_SERVER_URL найден:"
    grep "^MATRIX_SERVER_URL" .env | head -1
  else
    echo "MATRIX_SERVER_URL НЕ найден"
  fi
  
  if grep -q "^MATRIX_ADMIN_TOKEN" .env; then
    echo "MATRIX_ADMIN_TOKEN найден (скрыт):"
    grep "^MATRIX_ADMIN_TOKEN" .env | head -1 | sed 's/=.*/=***HIDDEN***/'
  else
    echo "MATRIX_ADMIN_TOKEN НЕ найден"
  fi
else
  echo "Файл .env НЕ существует"
fi

echo ""
echo "=== 4. Проверка переменных в процессе PM2 ==="
pm2 describe my-union-pro 2>/dev/null | grep -E "MATRIX" || echo "Переменные не найдены в PM2"

echo ""
echo "=== 5. Проверка через Node.js (если приложение запущено) ==="
# Попробуем проверить через API endpoint, который может использовать эти переменные
curl -s http://localhost:3000/api/profile 2>&1 | head -1 || echo "Приложение не отвечает на localhost:3000"

ENDSSH
