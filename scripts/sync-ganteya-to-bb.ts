/**
 * Скрипт для синхронизации пользователя ganteya@gmail.com с BestBenefits
 */

import { PrismaClient } from "@prisma/client";
import { syncUserToBestBenefits } from "../lib/best-benefits-users";
import { encryptPassword } from "../lib/best-benefits-password";
import crypto from "crypto";

const prisma = new PrismaClient();

async function syncGanteya() {
  try {
    const email = "ganteya@gmail.com";
    
    console.log(`🔄 Синхронизация пользователя ${email} с BestBenefits...\n`);

    // Находим пользователя
    const user = await prisma.user.findUnique({
      where: { email },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        emailVerified: true,
        bestBenefitsUserId: true,
        bestBenefitsPassword: true,
      },
    });

    if (!user) {
      console.error(`❌ Пользователь с email ${email} не найден`);
      process.exit(1);
    }

    console.log(`📋 Информация о пользователе:`);
    console.log(`   ID: ${user.id}`);
    console.log(`   Email: ${user.email}`);
    console.log(`   ФИО: ${user.lastName} ${user.firstName}`);
    console.log(`   Email подтвержден: ${user.emailVerified ? "✅" : "❌"}`);
    console.log(`   BestBenefits ID: ${user.bestBenefitsUserId || "НЕТ"}`);
    console.log(`   BestBenefits Password: ${user.bestBenefitsPassword ? "✅ ЕСТЬ" : "❌ НЕТ"}\n`);

    // Проверяем, что email подтвержден
    if (!user.emailVerified) {
      console.error(`❌ Email пользователя не подтвержден. Необходимо подтвердить email перед созданием аккаунта BestBenefits.`);
      process.exit(1);
    }

    // Проверяем, что есть ФИО
    if (!user.firstName || !user.lastName) {
      console.error(`❌ У пользователя не заполнены ФИО. Необходимо заполнить firstName и lastName перед созданием аккаунта BestBenefits.`);
      process.exit(1);
    }

    // Проверяем, не создан ли уже аккаунт
    if (user.bestBenefitsUserId) {
      console.log(`⚠️  Аккаунт BestBenefits уже создан: ${user.bestBenefitsUserId}`);
      console.log(`   Если нужно пересоздать, сначала удалите bestBenefitsUserId из БД.`);
      process.exit(0);
    }

    // Генерируем пароль для BestBenefits
    const bbPassword = crypto.randomBytes(12).toString("base64").slice(0, 12);
    console.log(`🔑 Сгенерирован пароль для BestBenefits: ${bbPassword}\n`);

    // Проверяем переменную окружения
    if (process.env.USE_REAL_BB_API !== "true") {
      console.warn(`⚠️  USE_REAL_BB_API не установлен в "true". Установите его для реального создания аккаунта.`);
      console.log(`   Для тестирования можно продолжить, но аккаунт не будет создан в BestBenefits.\n`);
    }

    // Создаем аккаунт в BestBenefits
    console.log(`🚀 Создание аккаунта в BestBenefits...`);
    try {
      const bbData = await syncUserToBestBenefits({
        id: user.id,
        email: user.email!,
        firstName: user.firstName!,
        lastName: user.lastName!,
        password: bbPassword,
        city_id: null,
      });

      console.log(`✅ Аккаунт успешно создан в BestBenefits!`);
      console.log(`   BestBenefits User ID: ${bbData.bestBenefitsUserId}`);
      console.log(`   Status: ${bbData.status}\n`);

      // Шифруем пароль
      const encryptedBbPassword = encryptPassword(bbPassword);

      // Сохраняем данные в БД
      await prisma.user.update({
        where: { id: user.id },
        data: {
          bestBenefitsUserId: bbData.bestBenefitsUserId,
          bestBenefitsStatus: bbData.status,
          bestBenefitsCreatedAt: new Date(),
          bestBenefitsPassword: encryptedBbPassword,
        },
      });

      console.log(`💾 Данные сохранены в БД:`);
      console.log(`   bestBenefitsUserId: ${bbData.bestBenefitsUserId}`);
      console.log(`   bestBenefitsStatus: ${bbData.status}`);
      console.log(`   bestBenefitsPassword: зашифрован и сохранен`);
      console.log(`   bestBenefitsCreatedAt: ${new Date().toISOString()}\n`);

      console.log(`✅✅✅ Синхронизация завершена успешно!`);
    } catch (error) {
      console.error(`❌ Ошибка при создании аккаунта в BestBenefits:`, error);
      if (error instanceof Error) {
        console.error(`   Сообщение: ${error.message}`);
      }
      process.exit(1);
    }
  } catch (error) {
    console.error(`❌ Критическая ошибка:`, error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

// Запускаем скрипт
syncGanteya();

