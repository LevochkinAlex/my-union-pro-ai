#!/usr/bin/env node
/**
 * Скрипт для создания MATRIX_ADMIN_TOKEN
 * Использует существующего пользователя из БД или создает новый токен
 */

import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const MATRIX_SERVER = process.env.MATRIX_SERVER_URL || 'https://matrix.myunion.pro';

async function createAdminToken() {
  console.log('=== Создание MATRIX_ADMIN_TOKEN ===\n');

  try {
    // Ищем пользователя с правами администратора, у которого есть matrixUserId
    const adminUser = await prisma.user.findFirst({
      where: {
        role: { in: ['SUPER_ADMIN', 'ADMIN'] },
        matrixUserId: { not: null },
        matrixAccessToken: { not: null }
      },
      select: {
        id: true,
        email: true,
        matrixUserId: true,
        matrixAccessToken: true,
      },
      orderBy: { createdAt: 'asc' }
    });

    if (adminUser && adminUser.matrixAccessToken) {
      console.log(`Найден администратор с Matrix токеном:`);
      console.log(`  Email: ${adminUser.email}`);
      console.log(`  Matrix User ID: ${adminUser.matrixUserId}`);
      console.log(`\nПроверка токена...`);

      // Проверяем валидность токена
      const checkResponse = await fetch(`${MATRIX_SERVER}/_matrix/client/v3/account/whoami`, {
        headers: { 'Authorization': `Bearer ${adminUser.matrixAccessToken}` }
      });

      if (checkResponse.ok) {
        const userInfo = await checkResponse.json();
        console.log(`✅ Токен валиден!`);
        console.log(`  User: ${userInfo.user_id}`);
        
        // Проверяем, является ли пользователь администратором
        const adminCheck = await fetch(`${MATRIX_SERVER}/_synapse/admin/v1/users/${encodeURIComponent(adminUser.matrixUserId)}`, {
          headers: { 'Authorization': `Bearer ${adminUser.matrixAccessToken}` }
        });

        if (adminCheck.ok) {
          const adminInfo = await adminCheck.json();
          if (adminInfo.admin) {
            console.log(`✅ Пользователь является администратором Matrix!`);
            console.log(`\nТокен для .env.local:`);
            console.log(`MATRIX_ADMIN_TOKEN=${adminUser.matrixAccessToken}`);
            return adminUser.matrixAccessToken;
          }
        }

        // Пробуем создать постоянный токен через admin API
        console.log(`\nПопытка создать постоянный токен...`);
        const tokenResponse = await fetch(`${MATRIX_SERVER}/_synapse/admin/v1/users/${encodeURIComponent(adminUser.matrixUserId)}/access_token`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${adminUser.matrixAccessToken}`,
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
          console.log(`❌ Не удалось создать постоянный токен: ${error}`);
          console.log(`\nИспользуйте существующий токен:`);
          console.log(`MATRIX_ADMIN_TOKEN=${adminUser.matrixAccessToken}`);
          return adminUser.matrixAccessToken;
        }
      } else {
        console.log(`❌ Токен невалиден или истек`);
      }
    } else {
      console.log(`❌ Не найден администратор с Matrix токеном`);
      console.log(`\nСоздайте администратора Matrix вручную или используйте существующий токен.`);
    }
  } catch (error) {
    console.error('Ошибка:', error.message);
  } finally {
    await prisma.$disconnect();
  }
}

createAdminToken().catch(console.error);
