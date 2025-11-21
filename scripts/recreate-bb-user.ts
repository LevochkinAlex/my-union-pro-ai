#!/usr/bin/env node

/**
 * Скрипт для пересоздания пользователя в BestBenefits после удаления
 * 
 * ВАЖНО: Сначала удалите пользователя из BestBenefits через поддержку или админ-панель!
 * 
 * Usage:
 *   pnpm dotenv -e .env.local -- tsx scripts/recreate-bb-user.ts ceo@yappix.ru "w+Aj7UH5/FpB"
 */

import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { createBestBenefitsUser } from '../lib/best-benefits-users';

const prisma = new PrismaClient();

async function recreateBbUser(email: string, password: string) {
  console.log(`\n🔍 Ищем пользователя: ${email}`);

  try {
    const user = await prisma.user.findUnique({
      where: { email },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        bestBenefitsUserId: true,
        bestBenefitsStatus: true,
        bestBenefitsCreatedAt: true,
      },
    });

    if (!user) {
      console.error(`❌ Пользователь с email "${email}" не найден в базе данных.`);
      console.error(`   Сначала зарегистрируйте пользователя в системе.`);
      process.exit(1);
    }

    console.log(`\n✅ Пользователь найден:`);
    console.log(`   ID: ${user.id}`);
    console.log(`   Имя: ${user.firstName || 'N/A'} ${user.lastName || 'N/A'}`);
    console.log(`   Email: ${user.email}`);
    console.log(`   BestBenefits ID: ${user.bestBenefitsUserId || 'НЕ СИНХРОНИЗИРОВАН'}`);
    console.log(`   BestBenefits Status: ${user.bestBenefitsStatus || 'N/A'}`);

    if (!user.firstName || !user.lastName) {
      console.error(`\n❌ У пользователя не заполнены ФИО`);
      console.error(`   BestBenefits требует имя и фамилию для создания пользователя`);
      console.error(`   Заполните профиль пользователя перед синхронизацией`);
      process.exit(1);
    }

    console.log(`\n⚠️  ВАЖНО: Убедитесь, что пользователь удален из BestBenefits!`);
    console.log(`   Если пользователь еще существует, создание завершится ошибкой.`);
    console.log(`\n🚀 Попытка создать пользователя в BestBenefits...`);
    console.log(`   Email: ${user.email}`);
    console.log(`   Имя: ${user.firstName} ${user.lastName}`);
    console.log(`   Пароль: ${'*'.repeat(password.length)} (скрыт)`);
    
    // Generate full name
    const name = [user.firstName, user.lastName].filter(Boolean).join(" ");

    try {
      const result = await createBestBenefitsUser({
        name,
        email: user.email,
        password: password,
        city_id: null,
      });

      console.log(`\n✅ Пользователь успешно создан в BestBenefits!`);
      console.log(`   Status: ${result.status}`);
      console.log(`   Message: ${result.message}`);

      // Update user in database
      await prisma.user.update({
        where: { id: user.id },
        data: {
          bestBenefitsUserId: user.email, // Email как идентификатор
          bestBenefitsStatus: result.status,
          bestBenefitsCreatedAt: new Date(),
        },
      });

      console.log(`\n💾 Данные сохранены в базе данных`);
      console.log(`\n✅ ГОТОВО! Теперь вы можете войти на bestbenefits.ru:`);
      console.log(`   Email: ${user.email}`);
      console.log(`   Пароль: ${password}`);
      console.log(`\n🔗 https://bestbenefits.ru/login`);
      
    } catch (error: any) {
      console.error(`\n❌ Ошибка создания пользователя в BestBenefits:`);
      console.error(`   ${error.message}`);
      
      if (error.message.includes('401')) {
        console.error(`\n🔑 Проблема с авторизацией в BestBenefits API`);
        console.error(`   Проверьте BB_PROFSOYUZY_TOKEN в .env.local`);
      } else if (error.message.includes('422') || error.message.includes('уже существует')) {
        console.error(`\n⚠️  Пользователь уже существует в BestBenefits!`);
        console.error(`\n💡 Решения:`);
        console.error(`   1. Удалите пользователя из BestBenefits через поддержку`);
        console.error(`   2. Или используйте восстановление пароля на bestbenefits.ru/login`);
        console.error(`   3. Или используйте другой email для тестирования`);
        console.error(`\n📞 Если нужно удалить пользователя:`);
        console.error(`   - Обратитесь в поддержку BestBenefits`);
        console.error(`   - Или используйте админ-панель BestBenefits (если есть доступ)`);
      } else if (error.message.includes('400')) {
        console.error(`\n⚠️  Возможные причины:`);
        console.error(`   1. Неверный формат данных`);
        console.error(`   2. Пароль не соответствует требованиям BestBenefits`);
        console.error(`   3. Пользователь уже существует`);
        console.error(`\n💡 Попробуйте:`);
        console.error(`   - Проверить, что пользователь удален из BestBenefits`);
        console.error(`   - Использовать другой пароль`);
      }
      
      process.exit(1);
    }

  } catch (error: any) {
    console.error(`\n❌ Ошибка: ${error.message}`);
    if (error.stack) {
      console.error(error.stack);
    }
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

// Main
const email = process.argv[2];
const password = process.argv[3];

if (!email) {
  console.error('❌ Укажите email пользователя:');
  console.error('   pnpm dotenv -e .env.local -- tsx scripts/recreate-bb-user.ts EMAIL PASSWORD');
  process.exit(1);
}

if (!password) {
  console.error('❌ Укажите пароль для BestBenefits:');
  console.error('   pnpm dotenv -e .env.local -- tsx scripts/recreate-bb-user.ts EMAIL PASSWORD');
  process.exit(1);
}

recreateBbUser(email, password);

