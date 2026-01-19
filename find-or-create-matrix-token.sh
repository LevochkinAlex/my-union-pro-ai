#!/bin/bash

echo "=== Поиск или создание MATRIX_ADMIN_TOKEN ==="

sshpass -p 'wu,iMrZj6goZh?' ssh -o StrictHostKeyChecking=no root@194.87.49.210 << 'ENDSSH'
cd /opt/my-union-pro

echo ""
echo "=== 1. Проверка существующего токена в .env.local ==="
if [ -f .env.local ] && grep -q "^MATRIX_ADMIN_TOKEN=" .env.local; then
  TOKEN=$(grep "^MATRIX_ADMIN_TOKEN=" .env.local | cut -d'=' -f2)
  if [ -n "$TOKEN" ]; then
    echo "✅ Токен уже существует в .env.local"
    echo "Длина токена: ${#TOKEN} символов"
    echo ""
    echo "Проверка валидности токена..."
    RESPONSE=$(curl -s -X GET "https://matrix.myunion.pro/_matrix/client/v3/account/whoami" \
      -H "Authorization: Bearer $TOKEN" 2>&1)
    if echo "$RESPONSE" | grep -q "user_id"; then
      echo "✅ Токен валиден!"
      echo "$RESPONSE" | head -3
      exit 0
    else
      echo "❌ Токен невалиден или истек"
      echo "Ответ: $RESPONSE"
    fi
  fi
else
  echo "Токен не найден в .env.local"
fi

echo ""
echo "=== 2. Поиск токена в Docker контейнерах ==="
if docker ps | grep -q synapse; then
  echo "Найден контейнер synapse"
  TOKEN=$(docker exec synapse cat /data/admin_token.txt 2>/dev/null)
  if [ -n "$TOKEN" ]; then
    echo "✅ Найден токен в Docker контейнере!"
    echo "Токен: ${TOKEN:0:20}... (длина: ${#TOKEN})"
    echo ""
    echo "Добавление в .env.local..."
    if [ -f .env.local ]; then
      # Удаляем старую строку если есть
      sed -i '/^MATRIX_ADMIN_TOKEN=/d' .env.local
    fi
    echo "MATRIX_ADMIN_TOKEN=$TOKEN" >> .env.local
    echo "✅ Токен добавлен в .env.local"
    exit 0
  else
    echo "Токен не найден в /data/admin_token.txt"
  fi
else
  echo "Контейнер synapse не запущен или не найден"
fi

echo ""
echo "=== 3. Поиск токена в файловой системе ==="
FOUND_TOKEN=$(find /opt /var/lib /home -name "*admin_token*" -o -name "*matrix*admin*" 2>/dev/null | head -1)
if [ -n "$FOUND_TOKEN" ] && [ -f "$FOUND_TOKEN" ]; then
  TOKEN=$(cat "$FOUND_TOKEN" 2>/dev/null | head -1 | tr -d '\n\r ')
  if [ -n "$TOKEN" ] && [ ${#TOKEN} -gt 10 ]; then
    echo "✅ Найден токен в файле: $FOUND_TOKEN"
    echo "Добавление в .env.local..."
    if [ -f .env.local ]; then
      sed -i '/^MATRIX_ADMIN_TOKEN=/d' .env.local
    fi
    echo "MATRIX_ADMIN_TOKEN=$TOKEN" >> .env.local
    echo "✅ Токен добавлен в .env.local"
    exit 0
  fi
fi

echo ""
echo "=== 4. Попытка создать токен через API ==="
echo "Для создания токена нужен пароль администратора Matrix"
echo "Если у вас есть пароль, выполните вручную:"
echo ""
echo "curl -X POST https://matrix.myunion.pro/_matrix/client/v3/login \\"
echo "  -H 'Content-Type: application/json' \\"
echo "  -d '{\"type\":\"m.login.password\",\"user\":\"@admin:matrix.myunion.pro\",\"password\":\"ВАШ_ПАРОЛЬ\"}'"
echo ""
echo "Затем используйте полученный access_token для создания постоянного токена:"
echo ""
echo "curl -X POST https://matrix.myunion.pro/_synapse/admin/v1/users/@admin:matrix.myunion.pro/access_token \\"
echo "  -H 'Authorization: Bearer ВАШ_ACCESS_TOKEN' \\"
echo "  -H 'Content-Type: application/json' \\"
echo "  -d '{\"valid_until_ms\":null}'"
echo ""

ENDSSH
