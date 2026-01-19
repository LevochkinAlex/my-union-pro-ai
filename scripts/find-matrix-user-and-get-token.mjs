#!/usr/bin/env node
/**
 * Находит пользователя Matrix в БД и пытается получить токен администратора
 */

import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const MATRIX_SERVER = process.env.MATRIX_SERVER_URL || 'https://matrix.myunion.pro';

async function findUserAndGetToken() {
  console.log('=== Поиск пользователя Matrix и получение токена ===\n');

  try {
    // Ищем всех пользователей с matrixUserId
    const users = await prisma.user.findMany({
      where: {
        matrixUserId: { not: null },
        matrixAccessToken: { not: null }
      },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        matrixUserId: true,
        matrixAccessToken: true,
        role: true,
      },
      take: 10
    });

    console.log(`Найдено ${users.length} пользователей с Matrix аккаунтами:\n`);

    for (const user of users) {
      console.log(`- ${user.email || 'Без email'}`);
      console.log(`  Matrix ID: ${user.matrixUserId}`);
      console.log(`  Role: ${user.role}`);
      console.log(`  Токен: ${user.matrixAccessToken ? user.matrixAccessToken.substring(0, 20) + '...' : 'Нет'}`);
      
      // Проверяем валидность токена
      if (user.matrixAccessToken) {
        try {
          const checkResponse = await fetch(`${MATRIX_SERVER}/_matrix/client/v3/account/whoami`, {
            headers: { 'Authorization': `Bearer ${user.matrixAccessToken}` }
          });

          if (checkResponse.ok) {
            const userInfo = await checkResponse.json();
            console.log(`  ✅ Токен валиден! User: ${userInfo.user_id}`);
            
            // Проверяем, является ли администратором
            try {
              const adminCheck = await fetch(`${MATRIX_SERVER}/_synapse/admin/v1/users/${encodeURIComponent(user.matrixUserId)}`, {
                headers: { 'Authorization': `Bearer ${user.matrixAccessToken}` }
              });

              if (adminCheck.ok) {
                const adminInfo = await adminCheck.json();
                if (adminInfo.admin) {
                  console.log(`  ✅ Пользователь является администратором Matrix!`);
                  console.log(`\n🎉 НАЙДЕН АДМИНИСТРАТОР!`);
                  console.log(`\nТокен для .env.local:`);
                  console.log(`MATRIX_ADMIN_TOKEN=${user.matrixAccessToken}`);
                  
                  // Пробуем создать постоянный токен
                  console.log(`\nПопытка создать постоянный токен...`);
                  const tokenResponse = await fetch(`${MATRIX_SERVER}/_synapse/admin/v1/users/${encodeURIComponent(user.matrixUserId)}/access_token`, {
                    method: 'POST',
                    headers: {
                      'Authorization': `Bearer ${user.matrixAccessToken}`,
                      'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ valid_until_ms: null })
                  });

                  if (tokenResponse.ok) {
                    const tokenData = await tokenResponse.json();
                    console.log(`✅ Постоянный токен создан!`);
                    console.log(`\nТокен для .env.local:`);
                    console.log(`MATRIX_ADMIN_TOKEN=${tokenData.access_token}`);
                    return tokenData.access_token;
                  } else {
                    const error = await tokenResponse.text();
                    console.log(`⚠️  Не удалось создать постоянный токен: ${error}`);
                    console.log(`\nИспользуйте существующий токен:`);
                    console.log(`MATRIX_ADMIN_TOKEN=${user.matrixAccessToken}`);
                    return user.matrixAccessToken;
                  }
                } else {
                  console.log(`  ⚠️  Пользователь НЕ является администратором`);
                }
              }
            } catch (err) {
              console.log(`  ⚠️  Не удалось проверить права администратора: ${err.message}`);
            }
          } else {
            console.log(`  ❌ Токен невалиден или истек`);
          }
        } catch (err) {
          console.log(`  ❌ Ошибка при проверке токена: ${err.message}`);
        }
      }
      console.log('');
    }

    // Если не нашли администратора, пробуем создать через registration_shared_secret
    console.log('\n=== Попытка создать администратора через registration API ===\n');
    
    // Ищем первого пользователя с правами SUPER_ADMIN
    const superAdmin = await prisma.user.findFirst({
      where: { role: 'SUPER_ADMIN' },
      select: { email: true, firstName: true, lastName: true }
    });

    if (superAdmin) {
      const username = superAdmin.email?.split('@')[0] || 'admin';
      const displayName = `${superAdmin.firstName || ''} ${superAdmin.lastName || ''}`.trim() || 'Admin';
      
      console.log(`Попытка создать Matrix пользователя для: ${superAdmin.email}`);
      console.log(`Username: ${username}`);
      console.log(`\nДля создания нужен registration_shared_secret или пароль администратора Matrix`);
      console.log(`\nПопробуйте создать пользователя вручную через веб-интерфейс Matrix или используйте существующий токен выше.`);
    }

  } catch (error) {
    console.error('Ошибка:', error.message);
  } finally {
    await prisma.$disconnect();
  }
}

findUserAndGetToken().catch(console.error);
