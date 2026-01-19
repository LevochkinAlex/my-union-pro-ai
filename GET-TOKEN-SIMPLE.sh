#!/bin/bash
# Простой скрипт для получения токена из БД
cd /opt/my-union-pro

echo "=== Поиск MATRIX_ADMIN_TOKEN в базе данных ==="
echo ""

node -e "
const { PrismaClient } = require('@prisma/client');
const https = require('https');
const prisma = new PrismaClient();
const MATRIX_SERVER = 'https://matrix.myunion.pro';

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
      take: 10
    });

    console.log(\`Найдено \${users.length} пользователей с Matrix аккаунтами\\n\`);

    for (const user of users) {
      console.log(\`Проверка: \${user.email || 'Без email'} (\${user.matrixUserId})\`);
      console.log(\`  Role: \${user.role}\`);
      
      if (user.matrixAccessToken) {
        try {
          const url = new URL(\`\${MATRIX_SERVER}/_matrix/client/v3/account/whoami\`);
          const options = {
            hostname: url.hostname,
            path: url.pathname,
            method: 'GET',
            headers: { 'Authorization': \`Bearer \${user.matrixAccessToken}\` }
          };

          const response = await new Promise((resolve, reject) => {
            const req = https.request(options, (res) => {
              let data = '';
              res.on('data', (chunk) => data += chunk);
              res.on('end', () => resolve({ ok: res.statusCode === 200, data }));
            });
            req.on('error', reject);
            req.end();
          });

          if (response.ok) {
            const userInfo = JSON.parse(response.data);
            console.log(\`  ✅ Токен валиден! User: \${userInfo.user_id}\`);
            
            // Проверяем права администратора
            try {
              const adminUrl = new URL(\`\${MATRIX_SERVER}/_synapse/admin/v1/users/\${encodeURIComponent(user.matrixUserId)}\`);
              const adminOptions = {
                hostname: adminUrl.hostname,
                path: adminUrl.pathname,
                method: 'GET',
                headers: { 'Authorization': \`Bearer \${user.matrixAccessToken}\` }
              };

              const adminResponse = await new Promise((resolve, reject) => {
                const req = https.request(adminOptions, (res) => {
                  let data = '';
                  res.on('data', (chunk) => data += chunk);
                  res.on('end', () => resolve({ ok: res.statusCode === 200, data }));
                });
                req.on('error', reject);
                req.end();
              });

              if (adminResponse.ok) {
                const adminInfo = JSON.parse(adminResponse.data);
                if (adminInfo.admin) {
                  console.log(\`  ✅ АДМИНИСТРАТОР НАЙДЕН!\\n\`);
                  console.log(\`Токен для .env.local:\`);
                  console.log(\`MATRIX_ADMIN_TOKEN=\${user.matrixAccessToken}\`);
                  
                  // Сохраняем в файл
                  const fs = require('fs');
                  let envContent = '';
                  if (fs.existsSync('.env.local')) {
                    envContent = fs.readFileSync('.env.local', 'utf8');
                    envContent = envContent.replace(/^MATRIX_ADMIN_TOKEN=.*$/m, '');
                  }
                  envContent += \`\\nMATRIX_ADMIN_TOKEN=\${user.matrixAccessToken}\\n\`;
                  fs.writeFileSync('.env.local', envContent.trim() + '\\n');
                  console.log(\`\\n✅ Токен добавлен в .env.local!\\n\`);
                  process.exit(0);
                } else {
                  console.log(\`  ⚠️  Пользователь НЕ является администратором\`);
                }
              }
            } catch (err) {
              // Игнорируем ошибки проверки прав
            }
          } else {
            console.log(\`  ❌ Токен невалиден\`);
          }
        } catch (err) {
          console.log(\`  ❌ Ошибка: \${err.message}\`);
        }
      }
      console.log('');
    }

    console.log('❌ Администратор Matrix не найден');
    console.log('Попробуйте создать администратора вручную или используйте существующий токен.');
  } catch (error) {
    console.error('Ошибка:', error.message);
  } finally {
    await prisma.\$disconnect();
  }
})();
"

if [ $? -eq 0 ]; then
  echo ""
  echo "✅ Токен успешно установлен!"
  echo "Перезапустите: pm2 restart my-union-pro"
else
  echo ""
  echo "⚠️  Автоматически установить токен не удалось"
fi
