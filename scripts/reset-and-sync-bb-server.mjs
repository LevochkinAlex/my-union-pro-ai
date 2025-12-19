#!/usr/bin/env node

/**
 * Скрипт для сброса пароля и синхронизации с BestBenefits
 * Работает напрямую с БД на сервере
 * 
 * Usage:
 *   pnpm tsx scripts/reset-and-sync-bb-server.mjs cursedx@ya.ru
 */

import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { createBestBenefitsUser } from '../lib/best-benefits-users.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Загружаем .env.local явно
dotenv.config({ path: join(__dirname, "..", ".env.local") });

// Используем DATABASE_URL из .env.local
const prisma = new PrismaClient({
  datasources: {
    db: {
      url: process.env.DATABASE_URL,
    },
  },
});

function generatePassword(length = 12) {
  const charset = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*";
  let password = "";
  for (let i = 0; i < length; i++) {
    password += charset.charAt(Math.floor(Math.random() * charset.length));
  }
  return password;
}

async function resetAndSync(email) {
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

    // Генерируем новый пароль
    const newPassword = generatePassword(12);
    console.log(`🔑 Генерируем новый пароль...`);

    const hashedPassword = await bcrypt.hash(newPassword, 10);

    // Обновляем пароль
    await prisma.user.update({
      where: { email },
      data: {
        password: hashedPassword,
        resetToken: null,
        resetTokenExpires: null,
      },
    });

    console.log(`✅ Пароль обновлён в БД`);

    // Синхронизируем с BestBenefits
    console.log(`\n🚀 Синхронизация с BestBenefits...`);
    const name = [user.firstName, user.lastName].filter(Boolean).join(" ") || user.email.split("@")[0];

    try {
      const result = await createBestBenefitsUser({
        name,
        email: user.email,
        password: newPassword, // Передаем незашифрованный пароль
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
      console.log(`🔑 Новый пароль: ${newPassword}`);
      console.log(`🆔 BestBenefits User ID: ${bbUserId}`);
      console.log(`📊 Status: ${result.data?.status || result.status || "active"}`);
      console.log(`\n⚠️  ВАЖНО: Сохраните пароль!`);

    } catch (error) {
      console.error(`\n❌ Ошибка синхронизации с BestBenefits:`, error.message);
      console.log(`\n✅ Пароль в БД обновлён, но синхронизация не удалась`);
      console.log(`🔑 Новый пароль: ${newPassword}`);
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
if (!email) {
  console.error('❌ Укажите email: pnpm tsx scripts/reset-and-sync-bb-server.mjs cursedx@ya.ru');
  process.exit(1);
}

resetAndSync(email);

