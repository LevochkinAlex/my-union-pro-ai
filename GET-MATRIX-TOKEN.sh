#!/bin/bash
# Финальный скрипт для получения MATRIX_ADMIN_TOKEN
# Выполните на сервере: bash GET-MATRIX-TOKEN.sh

cd /opt/my-union-pro

echo "=== Поиск и создание MATRIX_ADMIN_TOKEN ==="
echo ""

# Метод 1: Проверка существующего токена
if [ -f .env.local ] && grep -q "^MATRIX_ADMIN_TOKEN=" .env.local; then
  TOKEN=$(grep "^MATRIX_ADMIN_TOKEN=" .env.local | cut -d'=' -f2 | tr -d '"' | tr -d "'")
  if [ -n "$TOKEN" ] && [ ${#TOKEN} -gt 10 ]; then
    echo "✅ Токен найден в .env.local"
    echo "Проверка валидности..."
    RESPONSE=$(curl -s -X GET "https://matrix.myunion.pro/_matrix/client/v3/account/whoami" \
      -H "Authorization: Bearer $TOKEN" 2>&1)
    if echo "$RESPONSE" | grep -q "user_id"; then
      echo "✅ Токен валиден и работает!"
      exit 0
    else
      echo "❌ Токен невалиден, нужно создать новый"
    fi
  fi
fi

# Метод 2: Поиск в Docker
if command -v docker >/dev/null 2>&1 && docker ps | grep -q synapse; then
  echo "Проверка Docker контейнера synapse..."
  TOKEN=$(docker exec synapse cat /data/admin_token.txt 2>/dev/null | head -1 | tr -d '\n\r ')
  if [ -n "$TOKEN" ] && [ ${#TOKEN} -gt 10 ]; then
    echo "✅ Найден токен в Docker контейнере!"
    if [ -f .env.local ]; then
      sed -i '/^MATRIX_ADMIN_TOKEN=/d' .env.local
    fi
    echo "MATRIX_ADMIN_TOKEN=$TOKEN" >> .env.local
    echo "✅ Токен добавлен в .env.local"
    exit 0
  fi
fi

# Метод 3: Попытка получить через существующего пользователя из БД
echo "Попытка получить токен через базу данных..."
if command -v node >/dev/null 2>&1; then
  node -e "
    const { PrismaClient } = require('@prisma/client');
    const prisma = new PrismaClient();
    prisma.user.findFirst({
      where: {
        role: { in: ['SUPER_ADMIN', 'ADMIN'] },
        matrixAccessToken: { not: null }
      },
      select: { matrixAccessToken: true }
    }).then(user => {
      if (user && user.matrixAccessToken) {
        console.log('Найден токен в БД');
        console.log('MATRIX_ADMIN_TOKEN=' + user.matrixAccessToken);
      } else {
        console.log('Токен не найден в БД');
      }
      prisma.\$disconnect();
    }).catch(err => {
      console.error('Ошибка:', err.message);
      prisma.\$disconnect();
    });
  " 2>/dev/null | grep "MATRIX_ADMIN_TOKEN" && exit 0
fi

# Метод 4: Инструкция для ручного создания
echo ""
echo "❌ Автоматически получить токен не удалось"
echo ""
echo "=== Инструкция для ручного создания ==="
echo ""
echo "1. Войдите на Matrix сервер как администратор:"
echo "   curl -X POST https://matrix.myunion.pro/_matrix/client/v3/login \\"
echo "     -H 'Content-Type: application/json' \\"
echo "     -d '{\"type\":\"m.login.password\",\"user\":\"@admin:matrix.myunion.pro\",\"password\":\"ВАШ_ПАРОЛЬ\"}'"
echo ""
echo "2. Используя полученный access_token, создайте постоянный токен:"
echo "   curl -X POST https://matrix.myunion.pro/_synapse/admin/v1/users/@admin:matrix.myunion.pro/access_token \\"
echo "     -H 'Authorization: Bearer ВАШ_ACCESS_TOKEN_ИЗ_ШАГА_1' \\"
echo "     -H 'Content-Type: application/json' \\"
echo "     -d '{\"valid_until_ms\":null}'"
echo ""
echo "3. Добавьте полученный токен в .env.local:"
echo "   echo 'MATRIX_ADMIN_TOKEN=ваш_полученный_токен' >> .env.local"
echo ""
echo "4. Перезапустите приложение:"
echo "   pm2 restart my-union-pro"
