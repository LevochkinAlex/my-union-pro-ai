#!/usr/bin/env node

/**
 * Скрипт для сброса пароля и синхронизации с BestBenefits
 * 
 * Usage:
 *   pnpm tsx scripts/reset-and-sync-bb.mjs cursedx@ya.ru
 */

import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import dotenv from "dotenv";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: join(__dirname, "..", ".env.local") });

const prisma = new PrismaClient();

// Генерируем случайный пароль
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
        bestBenefitsCreatedAt: true,
      },
    });

    if (!user) {
      console.error(`❌ Пользователь с email ${email} не найден в базе данных`);
      process.exit(1);
    }

    console.log(`\n✅ Пользователь найден:`);
    console.log(`   ID: ${user.id}`);
    console.log(`   Имя: ${user.firstName || 'N/A'} ${user.lastName || 'N/A'}`);
    console.log(`   Email: ${user.email}`);
    console.log(`   BestBenefits ID: ${user.bestBenefitsUserId || 'НЕ СИНХРОНИЗИРОВАН'}`);

    // Генерируем новый пароль
    const newPassword = generatePassword(12);
    console.log(`\n🔑 Генерируем новый пароль...`);

    // Хешируем пароль для нашей БД
    const hashedPassword = await bcrypt.hash(newPassword, 10);

    // Обновляем пароль в БД
    await prisma.user.update({
      where: { email },
      data: {
        password: hashedPassword,
        resetToken: null,
        resetTokenExpires: null,
      },
    });

    console.log(`✅ Пароль успешно обновлён в базе данных`);

    // Синхронизируем с BestBenefits
    console.log(`\n🚀 Синхронизация с BestBenefits...`);
    
    // Динамический импорт для TypeScript модуля
    const { createBestBenefitsUser } = await import("../lib/best-benefits-users.ts");
    
    const name = [user.firstName, user.lastName].filter(Boolean).join(" ") || user.email.split("@")[0];

    try {
      const result = await createBestBenefitsUser({
        name,
        email: user.email,
        password: newPassword, // Используем незашифрованный пароль для BestBenefits
        city_id: null,
      });

      console.log(`\n✅ Пользователь успешно синхронизирован с BestBenefits!`);
      console.log(`   BestBenefits User ID: ${result.data?.id || 'N/A'}`);
      console.log(`   Status: ${result.data?.status || result.status || 'N/A'}`);

      // Обновляем данные пользователя в БД
      const bbUserId = result.data?.id?.toString() || user.email; // Используем email если ID нет
      
      await prisma.user.update({
        where: { id: user.id },
        data: {
          bestBenefitsUserId: bbUserId,
          bestBenefitsStatus: result.data?.status || result.status || "active",
          bestBenefitsCreatedAt: new Date(),
        },
      });

      console.log(`\n💾 Данные сохранены в базе данных`);
      console.log(`\n📋 Итоговая информация:`);
      console.log(`   📧 Email: ${user.email}`);
      console.log(`   🔑 Новый пароль: ${newPassword}`);
      console.log(`   🆔 BestBenefits User ID: ${bbUserId}`);
      console.log(`\n⚠️  ВАЖНО: Сохраните пароль! Пользователь должен использовать его для входа.`);

    } catch (error) {
      console.error(`\n❌ Ошибка синхронизации с BestBenefits:`, error.message);
      
      if (error.message.includes('401')) {
        console.error(`\n🔑 Проблема с авторизацией в BestBenefits API`);
        console.error(`   Проверьте BB_PROFSOYUZY_TOKEN в .env.local`);
      } else if (error.message.includes('400')) {
        console.error(`\n⚠️  Возможные причины:`);
        console.error(`   - Пользователь уже существует в BestBenefits`);
        console.error(`   - Неверный формат данных`);
      }
      
      console.log(`\n✅ Пароль в нашей БД обновлён, но синхронизация с BestBenefits не удалась`);
      console.log(`   🔑 Новый пароль: ${newPassword}`);
      console.log(`   Попробуйте синхронизировать вручную позже`);
      
      process.exit(1);
    }

  } catch (error) {
    console.error(`\n❌ Ошибка:`, error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

// Main
const email = process.argv[2];

if (!email) {
  console.error('❌ Укажите email пользователя:');
  console.error('   pnpm tsx scripts/reset-and-sync-bb.mjs cursedx@ya.ru');
  process.exit(1);
}

resetAndSync(email);

