#!/bin/bash
# Простой тест токена - выполните на сервере
cd /opt/my-union-pro

echo "=== Тест MATRIX_ADMIN_TOKEN ==="

# Получаем токен из .env.local
TOKEN=$(grep "^MATRIX_ADMIN_TOKEN=" .env.local | cut -d'=' -f2 | tr -d '"' | tr -d "'")

if [ -z "$TOKEN" ]; then
  echo "❌ Токен не найден в .env.local"
  exit 1
fi

echo "Токен найден (длина: ${#TOKEN})"
echo ""

echo "1. Проверка валидности..."
curl -s -X GET "https://matrix.myunion.pro/_matrix/client/v3/account/whoami" \
  -H "Authorization: Bearer $TOKEN" | jq .

echo ""
echo "2. Тест создания комнаты..."
curl -s -X POST "https://matrix.myunion.pro/_matrix/client/v3/createRoom" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"preset":"trusted_private_chat","is_direct":true,"creation_content":{"m.federate":false}}' | jq .
