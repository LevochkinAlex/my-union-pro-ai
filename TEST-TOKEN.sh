#!/bin/bash
# Тест токена для создания комнаты через admin API
cd /opt/my-union-pro

echo "=== Тест MATRIX_ADMIN_TOKEN ==="
echo ""

# Получаем токен из .env.local
if [ -f .env.local ]; then
  TOKEN=$(grep "^MATRIX_ADMIN_TOKEN=" .env.local | cut -d'=' -f2 | tr -d '"' | tr -d "'")
  if [ -z "$TOKEN" ]; then
    echo "❌ Токен не найден в .env.local"
    exit 1
  fi
  echo "✅ Токен найден в .env.local (длина: ${#TOKEN})"
else
  echo "❌ Файл .env.local не найден"
  exit 1
fi

echo ""
echo "1. Проверка валидности токена..."
RESPONSE=$(curl -s -X GET "https://matrix.myunion.pro/_matrix/client/v3/account/whoami" \
  -H "Authorization: Bearer $TOKEN" 2>&1)

if echo "$RESPONSE" | grep -q "user_id"; then
  echo "✅ Токен валиден"
  USER_ID=$(echo "$RESPONSE" | grep -o '"user_id":"[^"]*"' | cut -d'"' -f4)
  echo "   User ID: $USER_ID"
else
  echo "❌ Токен невалиден"
  echo "   Ответ: $RESPONSE"
  exit 1
fi

echo ""
echo "2. Тест создания комнаты через admin API (как в коде)..."
# Пробуем создать тестовую комнату через admin API (как в app/api/chat/route.ts)
CREATE_ROOM_RESPONSE=$(curl -s -X POST "https://matrix.myunion.pro/_matrix/client/v3/createRoom" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "preset": "trusted_private_chat",
    "is_direct": true,
    "creation_content": {
      "m.federate": false
    }
  }' 2>&1)

if echo "$CREATE_ROOM_RESPONSE" | grep -q "room_id"; then
  ROOM_ID=$(echo "$CREATE_ROOM_RESPONSE" | grep -o '"room_id":"[^"]*"' | cut -d'"' -f4)
  echo "✅ Комната успешно создана!"
  echo "   Room ID: $ROOM_ID"
  echo ""
  echo "✅ Токен работает для создания комнат через admin API!"
  echo ""
  echo "Теперь можно создавать чаты. Проверьте создание чата в приложении."
  
  # Удаляем тестовую комнату
  echo ""
  echo "Удаление тестовой комнаты..."
  curl -s -X POST "https://matrix.myunion.pro/_matrix/client/v3/rooms/$ROOM_ID/leave" \
    -H "Authorization: Bearer $TOKEN" > /dev/null 2>&1
else
  echo "❌ Не удалось создать комнату"
  echo "   Ответ: $CREATE_ROOM_RESPONSE"
  echo ""
  echo "⚠️  Токен может не иметь прав администратора"
  echo "   Но попробуйте создать чат в приложении - возможно, токен работает для обычных операций"
fi

echo ""
echo "3. Проверка переменной окружения в приложении..."
# Проверяем, что переменная доступна в приложении
if pm2 describe my-union-pro | grep -q "MATRIX_ADMIN_TOKEN"; then
  echo "✅ Переменная видна в PM2"
else
  echo "⚠️  Переменная не видна в PM2 (может потребоваться перезапуск с --update-env)"
fi
