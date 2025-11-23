#!/usr/bin/env node

/**
 * Восстанавливает связь пользователя с BestBenefits
 * Usage: node scripts/restore-bb-connection.mjs <email> <bb_email> <bb_password>
 */

import { config } from 'dotenv';
import { PrismaClient } from '@prisma/client';
import crypto from 'crypto';

config({ path: '.env.local' });

const prisma = new PrismaClient();

// Константы (такие же как в lib/best-benefits-password.ts)
const ENCRYPTION_KEY = process.env.BB_PASSWORD_ENCRYPTION_KEY || process.env.ENCRYPTION_KEY || "default-key-change-in-production-32-chars!!";
const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 16;
const SALT_LENGTH = 64;

// Функция получения ключа (такая же как в системе)
function getKey() {
  return crypto.scryptSync(ENCRYPTION_KEY, "salt", 32);
}

// Функция шифрования пароля (такая же как в системе)
function encryptPassword(password) {
  if (!password) {
    throw new Error('Password cannot be empty');
  }

  const key = getKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const salt = crypto.randomBytes(SALT_LENGTH);

  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  cipher.setAAD(salt);

  let encrypted = cipher.update(password, "utf8", "hex");
  encrypted += cipher.final("hex");

  const tag = cipher.getAuthTag();

  // Сохраняем: salt + iv + tag + encrypted
  return salt.toString("hex") + iv.toString("hex") + tag.toString("hex") + encrypted;
}

async function restoreBBConnection(userEmail, bbEmail, bbPassword) {
  try {
    console.log(`🔄 Восстановление связи с BestBenefits...`);
    console.log(`   Пользователь: ${userEmail}`);
    console.log(`   BB Email: ${bbEmail}`);
    console.log();

    // Находим пользователя
    const user = await prisma.user.findUnique({
      where: { email: userEmail }
    });

    if (!user) {
      console.error(`❌ Пользователь с email ${userEmail} не найден`);
      process.exit(1);
    }

    // Шифруем пароль BB
    console.log(`🔐 Шифрую пароль BB...`);
    const encryptedPassword = encryptPassword(bbPassword);
    console.log(`✅ Пароль зашифрован`);
    console.log();

    // Обновляем данные пользователя
    console.log(`💾 Обновляю данные пользователя...`);
    await prisma.user.update({
      where: { id: user.id },
      data: {
        bestBenefitsUserId: bbEmail, // В BB используется email как ID
        bestBenefitsPassword: encryptedPassword,
        bestBenefitsStatus: 'active',
        bestBenefitsCreatedAt: new Date(),
      }
    });
    console.log(`✅ Данные обновлены`);
    console.log();

    // Создаем запись discountPreference если её нет
    const existingPref = await prisma.discountPreference.findUnique({
      where: { userId: user.id }
    });

    if (!existingPref) {
      console.log(`📝 Создаю запись предпочтений скидок...`);
      await prisma.discountPreference.create({
        data: {
          userId: user.id,
          filters: {
            claimed: [],
            favorites: [],
            viewed: []
          }
        }
      });
      console.log(`✅ Запись создана`);
    } else {
      console.log(`✅ Запись предпочтений уже существует`);
    }
    console.log();

    console.log(`🎉 ГОТОВО! Связь с BestBenefits восстановлена`);
    console.log();
    console.log(`📊 Теперь доступно:`);
    console.log(`   ✅ Просмотр всех скидок BestBenefits`);
    console.log(`   ✅ Активация скидок`);
    console.log(`   ✅ Синхронизация полученных скидок`);
    console.log();
    console.log(`💡 Следующий шаг:`);
    console.log(`   Откройте https://myunion.pro/dashboard/discounts`);
    console.log(`   Скидки должны загрузиться автоматически`);

  } catch (error) {
    console.error('❌ Ошибка:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

const userEmail = process.argv[2];
const bbEmail = process.argv[3];
const bbPassword = process.argv[4];

if (!userEmail || !bbEmail || !bbPassword) {
  console.error('❌ Недостаточно аргументов');
  console.log('Usage: node scripts/restore-bb-connection.mjs <user_email> <bb_email> <bb_password>');
  console.log('Example: node scripts/restore-bb-connection.mjs ceo@yappix.ru ceo@yappix.ru "password123"');
  process.exit(1);
}

restoreBBConnection(userEmail, bbEmail, bbPassword);

