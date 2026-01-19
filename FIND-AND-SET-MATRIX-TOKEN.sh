#!/bin/bash
# Скрипт для поиска и установки MATRIX_ADMIN_TOKEN
# Выполните на сервере: bash FIND-AND-SET-MATRIX-TOKEN.sh

cd /opt/my-union-pro

echo "=== Поиск и установка MATRIX_ADMIN_TOKEN ==="
echo ""

# Проверяем Node.js
if ! command -v node >/dev/null 2>&1; then
  echo "❌ Node.js не установлен"
  exit 1
fi

# Запускаем скрипт поиска
echo "Поиск пользователей Matrix в базе данных..."
node << 'NODE_SCRIPT'
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const MATRIX_SERVER = process.env.MATRIX_SERVER_URL || 'https://matrix.myunion.pro';

(async () => {
  try {
    const users = await prisma.user.findMany({
      where: {
        matrixUserId: { not: null },
        matrixAccessToken: { not: null }
      },
      select: {
        email: true,
        matrixUserId: true,
        matrixAccessToken: true,
        role: true,
      },
      take: 5
    });

    console.log(`Найдено ${users.length} пользователей с Matrix аккаунтами\n`);

    for (const user of users) {
      console.log(`Проверка: ${user.email || 'Без email'} (${user.matrixUserId})`);
      
      if (user.matrixAccessToken) {
        try {
          const fetch = (await import('node-fetch')).default;
          const checkResponse = await fetch(`${MATRIX_SERVER}/_matrix/client/v3/account/whoami`, {
            headers: { 'Authorization': `Bearer ${user.matrixAccessToken}` }
          });

          if (checkResponse.ok) {
            const userInfo = await checkResponse.json();
            console.log(`  ✅ Токен валиден!`);
            
            // Проверяем права администратора
            try {
              const adminCheck = await fetch(`${MATRIX_SERVER}/_synapse/admin/v1/users/${encodeURIComponent(user.matrixUserId)}`, {
                headers: { 'Authorization': `Bearer ${user.matrixAccessToken}` }
              });

              if (adminCheck.ok) {
                const adminInfo = await adminCheck.json();
                if (adminInfo.admin) {
                  console.log(`  ✅ АДМИНИСТРАТОР НАЙДЕН!`);
                  console.log(`\nТокен для .env.local:`);
                  console.log(`MATRIX_ADMIN_TOKEN=${user.matrixAccessToken}`);
                  
                  // Сохраняем в файл
                  const fs = require('fs');
                  let envContent = '';
                  if (fs.existsSync('.env.local')) {
                    envContent = fs.readFileSync('.env.local', 'utf8');
                    envContent = envContent.replace(/^MATRIX_ADMIN_TOKEN=.*$/m, '');
                  }
                  envContent += `\nMATRIX_ADMIN_TOKEN=${user.matrixAccessToken}\n`;
                  fs.writeFileSync('.env.local', envContent.trim() + '\n');
                  console.log(`\n✅ Токен добавлен в .env.local!`);
                  process.exit(0);
                }
              }
            } catch (err) {
              // Игнорируем ошибки проверки прав
            }
          }
        } catch (err) {
          console.log(`  ❌ Ошибка: ${err.message}`);
        }
      }
    }

    console.log('\n❌ Администратор Matrix не найден');
    console.log('\nСоздайте администратора вручную или используйте существующий токен.');
  } catch (error) {
    console.error('Ошибка:', error.message);
  } finally {
    await prisma.$disconnect();
  }
})();
NODE_SCRIPT

if [ $? -eq 0 ]; then
  echo ""
  echo "✅ Токен успешно установлен!"
  echo "Перезапустите приложение: pm2 restart my-union-pro"
else
  echo ""
  echo "⚠️  Автоматически установить токен не удалось"
  echo "Выполните скрипт вручную: node scripts/find-matrix-user-and-get-token.mjs"
fi
