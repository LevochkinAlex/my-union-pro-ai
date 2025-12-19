#!/usr/bin/env node

/**
 * Перешифровка пароля BestBenefits для пользователя
 * 
 * Usage:
 *   pnpm tsx scripts/re-encrypt-bb-password.mjs cursedx@ya.ru 8Bh5Zrzjl3M
 */

import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { PrismaClient } from '@prisma/client';
import { encryptPassword } from '../lib/best-benefits-password.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Загружаем .env.local
dotenv.config({ path: join(__dirname, "..", ".env.local") });

const prisma = new PrismaClient({
  datasources: {
    db: {
      url: process.env.DATABASE_URL?.replace('194.87.49.210', 'localhost') || process.env.DATABASE_URL,
    },
  },
});

async function reEncryptPassword(email, newPassword) {
  console.log(`\n🔐 Перешифровка пароля для: ${email}`);

  try {
    const user = await prisma.user.findUnique({
      where: { email },
      select: {
        id: true,
        email: true,
        bestBenefitsUserId: true,
      },
    });

    if (!user) {
      console.error(`❌ Пользователь не найден`);
      process.exit(1);
    }

    console.log(`✅ Пользователь найден: ${user.email}`);

    // Шифруем новый пароль
    const encryptedPassword = encryptPassword(newPassword);
    console.log(`✅ Пароль зашифрован`);

    // Сохраняем в БД
    await prisma.user.update({
      where: { id: user.id },
      data: {
        bestBenefitsPassword: encryptedPassword,
      },
    });

    console.log(`✅ Пароль сохранен в БД`);

  } catch (error) {
    console.error(`\n❌ Ошибка:`, error);
    if (error.stack) {
      console.error(`   Stack:`, error.stack);
    }
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

const email = process.argv[2];
const password = process.argv[3];

if (!email || !password) {
  console.error('❌ Укажите email и пароль:');
  console.error('   pnpm tsx scripts/re-encrypt-bb-password.mjs cursedx@ya.ru 8Bh5Zrzjl3M');
  process.exit(1);
}

reEncryptPassword(email, password);

