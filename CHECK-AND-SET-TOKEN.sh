#!/bin/bash
# Проверка токена support@myunion.pro и добавление в .env.local
cd /opt/my-union-pro

echo "=== Проверка токена support@myunion.pro ==="
echo ""

# Получаем токен из БД
TOKEN=$(node -e "
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
prisma.user.findUnique({
  where: { email: 'support@myunion.pro' },
  select: { matrixAccessToken: true }
}).then(user => {
  if (user && user.matrixAccessToken) {
    console.log(user.matrixAccessToken);
  }
  prisma.\$disconnect();
});
" 2>/dev/null)

if [ -z "$TOKEN" ]; then
  echo "❌ Токен не найден в БД"
  exit 1
fi

echo "Токен найден (длина: ${#TOKEN})"
echo "Проверка валидности..."

# Проверяем валидность токена
RESPONSE=$(curl -s -X GET "https://matrix.myunion.pro/_matrix/client/v3/account/whoami" \
  -H "Authorization: Bearer $TOKEN" 2>&1)

if echo "$RESPONSE" | grep -q "user_id"; then
  echo "✅ Токен валиден!"
  USER_ID=$(echo "$RESPONSE" | grep -o '"user_id":"[^"]*"' | cut -d'"' -f4)
  echo "User ID: $USER_ID"
  
  echo ""
  echo "Проверка прав администратора..."
  
  # Проверяем права администратора
  ADMIN_CHECK=$(curl -s -X GET "https://matrix.myunion.pro/_synapse/admin/v1/users/$(echo "$USER_ID" | sed 's/@/%40/g' | sed 's/:/%3A/g')" \
    -H "Authorization: Bearer $TOKEN" 2>&1)
  
  if echo "$ADMIN_CHECK" | grep -q '"admin":true'; then
    echo "✅ Пользователь является администратором Matrix!"
    echo ""
    echo "Добавление токена в .env.local..."
    
    # Добавляем токен в .env.local
    if [ -f .env.local ]; then
      # Удаляем старую строку если есть
      sed -i '/^MATRIX_ADMIN_TOKEN=/d' .env.local
    fi
    
    echo "MATRIX_ADMIN_TOKEN=$TOKEN" >> .env.local
    echo ""
    echo "✅ Токен успешно добавлен в .env.local!"
    echo ""
    echo "Перезапустите приложение:"
    echo "  pm2 restart my-union-pro"
  else
    echo "⚠️  Пользователь НЕ является администратором Matrix"
    echo ""
    echo "Попытка создать постоянный токен через admin API..."
    
    # Пробуем создать постоянный токен
    NEW_TOKEN_RESPONSE=$(curl -s -X POST "https://matrix.myunion.pro/_synapse/admin/v1/users/$(echo "$USER_ID" | sed 's/@/%40/g' | sed 's/:/%3A/g')/access_token" \
      -H "Authorization: Bearer $TOKEN" \
      -H "Content-Type: application/json" \
      -d '{"valid_until_ms":null}' 2>&1)
    
    if echo "$NEW_TOKEN_RESPONSE" | grep -q "access_token"; then
      NEW_TOKEN=$(echo "$NEW_TOKEN_RESPONSE" | grep -o '"access_token":"[^"]*"' | cut -d'"' -f4)
      echo "✅ Постоянный токен создан!"
      echo ""
      echo "Добавление в .env.local..."
      if [ -f .env.local ]; then
        sed -i '/^MATRIX_ADMIN_TOKEN=/d' .env.local
      fi
      echo "MATRIX_ADMIN_TOKEN=$NEW_TOKEN" >> .env.local
      echo "✅ Токен добавлен!"
    else
      echo "❌ Не удалось создать постоянный токен"
      echo "Ответ: $NEW_TOKEN_RESPONSE"
      echo ""
      echo "Используйте существующий токен (может не иметь прав администратора):"
      if [ -f .env.local ]; then
        sed -i '/^MATRIX_ADMIN_TOKEN=/d' .env.local
      fi
      echo "MATRIX_ADMIN_TOKEN=$TOKEN" >> .env.local
      echo "Токен добавлен, но может не работать для admin API"
    fi
  fi
else
  echo "❌ Токен невалиден или истек"
  echo "Ответ: $RESPONSE"
  exit 1
fi
