#!/usr/bin/env node

/**
 * Синхронизация пользователя с BestBenefits с указанным паролем
 * 
 * Usage:
 *   pnpm tsx scripts/sync-bb-with-password.mjs cursedx@ya.ru 8Bh5Zrzjl3M
 */

import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { createBestBenefitsUser } from '../lib/best-benefits-users.ts';

const prisma = new PrismaClient();

async function syncWithPassword(email, password) {
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
      },
    });

    if (!user) {
      console.error(`❌ Пользователь с email ${email} не найден`);
      process.exit(1);
    }

    console.log(`✅ Пользователь найден: ${user.email}`);

    // Синхронизируем с BestBenefits
    console.log(`\n🚀 Синхронизация с BestBenefits...`);
    const name = [user.firstName, user.lastName].filter(Boolean).join(" ") || user.email.split("@")[0];

    try {
      const result = await createBestBenefitsUser({
        name,
        email: user.email,
        password: password, // Используем переданный пароль
        city_id: null,
      });

      const bbUserId = result.data?.id?.toString() || user.email;

      await prisma.user.update({
        where: { id: user.id },
        data: {
          bestBenefitsUserId: bbUserId,
          bestBenefitsStatus: result.data?.status || result.status || "active",
          bestBenefitsCreatedAt: new Date(),
        },
      });

      console.log(`\n✅ УСПЕХ!`);
      console.log(`📧 Email: ${user.email}`);
      console.log(`🆔 BestBenefits User ID: ${bbUserId}`);
      console.log(`📊 Status: ${result.data?.status || result.status || "active"}`);

    } catch (error) {
      console.error(`\n❌ Ошибка синхронизации с BestBenefits:`, error.message);
      process.exit(1);
    }

  } catch (error) {
    console.error(`\n❌ Ошибка:`, error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

const email = process.argv[2];
const password = process.argv[3];

if (!email || !password) {
  console.error('❌ Укажите email и пароль:');
  console.error('   pnpm tsx scripts/sync-bb-with-password.mjs cursedx@ya.ru 8Bh5Zrzjl3M');
  process.exit(1);
}

syncWithPassword(email, password);

