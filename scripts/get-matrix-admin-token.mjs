#!/usr/bin/env node
/**
 * Скрипт для получения MATRIX_ADMIN_TOKEN
 * Пытается получить токен через API Matrix
 */

import 'dotenv/config';

const MATRIX_SERVER = process.env.MATRIX_SERVER_URL || 'https://matrix.myunion.pro';

async function getAdminToken() {
  console.log('=== Получение MATRIX_ADMIN_TOKEN ===\n');
  console.log(`Matrix Server: ${MATRIX_SERVER}\n`);

  // Вариант 1: Попробуем найти существующего администратора в базе
  try {
    const { PrismaClient } = await import('@prisma/client');
    const prisma = new PrismaClient();

    // Ищем пользователя с matrixUserId, который может быть администратором
    const adminUser = await prisma.user.findFirst({
      where: {
        matrixUserId: { not: null },
        role: { in: ['SUPER_ADMIN', 'ADMIN'] }
      },
      select: {
        id: true,
        email: true,
        matrixUserId: true,
        firstName: true,
        lastName: true,
      }
    });

    if (adminUser && adminUser.matrixUserId) {
      console.log(`Найден администратор в БД:`);
      console.log(`  Email: ${adminUser.email}`);
      console.log(`  Matrix User ID: ${adminUser.matrixUserId}`);
      console.log(`\nПопытка получить токен через API...\n`);

      // Пробуем получить токен через admin API
      // Но для этого нужен существующий токен или пароль
      // Попробуем через registration_shared_secret или другой метод
    }

    await prisma.$disconnect();
  } catch (error) {
    console.error('Ошибка при работе с БД:', error.message);
  }

  // Вариант 2: Попробуем создать токен через API, если есть registration_shared_secret
  const REGISTRATION_SHARED_SECRET = process.env.MATRIX_REGISTRATION_SHARED_SECRET;
  
  if (REGISTRATION_SHARED_SECRET) {
    console.log('Найден MATRIX_REGISTRATION_SHARED_SECRET, попытка создать администратора...\n');
    
    try {
      // Создаем администратора через registration API
      const username = 'admin';
      const password = `admin_${Date.now()}_${Math.random().toString(36).substring(7)}`;
      
      const registerResponse = await fetch(`${MATRIX_SERVER}/_matrix/client/v3/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username,
          password,
          initial_device_display_name: 'Admin Token Generator',
          auth: {
            type: 'm.login.shared_secret',
            shared_secret: REGISTRATION_SHARED_SECRET
          }
        })
      });

      if (registerResponse.ok) {
        const data = await registerResponse.json();
        console.log('✅ Администратор создан!');
        console.log(`  User ID: ${data.user_id}`);
        console.log(`  Access Token: ${data.access_token}`);
        console.log(`\nДобавьте в .env.local:`);
        console.log(`MATRIX_ADMIN_TOKEN=${data.access_token}`);
        return;
      } else {
        const errorText = await registerResponse.text();
        console.log('Не удалось создать через registration API:', errorText);
      }
    } catch (error) {
      console.error('Ошибка при создании через registration API:', error.message);
    }
  }

  // Вариант 3: Инструкция для ручного получения
  console.log('\n=== Инструкция для ручного получения токена ===\n');
  console.log('1. Войдите на Matrix сервер как администратор:');
  console.log(`   curl -X POST ${MATRIX_SERVER}/_matrix/client/v3/login \\`);
  console.log(`     -H "Content-Type: application/json" \\`);
  console.log(`     -d '{"type":"m.login.password","user":"@admin:matrix.myunion.pro","password":"ваш_пароль"}'`);
  console.log('\n2. Используя полученный access_token, создайте постоянный токен:');
  console.log(`   curl -X POST ${MATRIX_SERVER}/_synapse/admin/v1/users/@admin:matrix.myunion.pro/access_token \\`);
  console.log(`     -H "Authorization: Bearer ВАШ_ACCESS_TOKEN" \\`);
  console.log(`     -H "Content-Type: application/json" \\`);
  console.log(`     -d '{"valid_until_ms":null}'`);
  console.log('\n3. Добавьте полученный токен в .env.local:');
  console.log('   MATRIX_ADMIN_TOKEN=ваш_полученный_токен');
}

getAdminToken().catch(console.error);
