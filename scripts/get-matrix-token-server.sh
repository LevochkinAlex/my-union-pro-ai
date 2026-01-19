#!/bin/bash
# Скрипт для получения MATRIX_ADMIN_TOKEN на сервере

cd /opt/my-union-pro

echo "=== Поиск MATRIX_ADMIN_TOKEN ==="

# 1. Проверка существующего токена
if [ -f .env.local ] && grep -q "^MATRIX_ADMIN_TOKEN=" .env.local; then
  TOKEN=$(grep "^MATRIX_ADMIN_TOKEN=" .env.local | cut -d'=' -f2)
  if [ -n "$TOKEN" ]; then
    echo "✅ Токен найден в .env.local (длина: ${#TOKEN})"
    echo "Проверка валидности..."
    RESPONSE=$(curl -s -X GET "https://matrix.myunion.pro/_matrix/client/v3/account/whoami" \
      -H "Authorization: Bearer $TOKEN" 2>&1)
    if echo "$RESPONSE" | grep -q "user_id"; then
      echo "✅ Токен валиден!"
      exit 0
    else
      echo "❌ Токен невалиден"
    fi
  fi
fi

# 2. Поиск в Docker
if docker ps | grep -q synapse; then
  TOKEN=$(docker exec synapse cat /data/admin_token.txt 2>/dev/null | head -1 | tr -d '\n\r ')
  if [ -n "$TOKEN" ] && [ ${#TOKEN} -gt 10 ]; then
    echo "✅ Найден токен в Docker контейнере!"
    echo "MATRIX_ADMIN_TOKEN=$TOKEN" >> .env.local
    echo "✅ Токен добавлен в .env.local"
    exit 0
  fi
fi

# 3. Если токен не найден, выводим инструкцию
echo "❌ Токен не найден"
echo ""
echo "Для создания токена выполните:"
echo "curl -X POST https://matrix.myunion.pro/_matrix/client/v3/login \\"
echo "  -H 'Content-Type: application/json' \\"
echo "  -d '{\"type\":\"m.login.password\",\"user\":\"@admin:matrix.myunion.pro\",\"password\":\"ВАШ_ПАРОЛЬ\"}'"
