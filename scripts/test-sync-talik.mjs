/**
 * Тестовый скрипт для проверки синхронизации скидок и промокодов для пользователя talik.e
 */

import 'dotenv/config';
import { PrismaClient } from "@prisma/client";
import { getUserActivatedDiscounts } from "../lib/best-benefits-activation.ts";
import * as passwordLib from "../lib/best-benefits-password.ts";

const prisma = new PrismaClient();

async function testSyncTalik() {
  try {
    console.log("🔍 Поиск пользователя talik.e...");
    
    // Находим пользователя по email
    const user = await prisma.user.findUnique({
      where: { email: "talik.e" },
      select: {
        id: true,
        email: true,
        bestBenefitsUserId: true,
        bestBenefitsPassword: true,
      },
    });

    if (!user) {
      console.error("❌ Пользователь talik.e не найден");
      return;
    }

    console.log("✅ Пользователь найден:", {
      id: user.id,
      email: user.email,
      bestBenefitsUserId: user.bestBenefitsUserId,
      hasPassword: !!user.bestBenefitsPassword,
    });

    if (!user.bestBenefitsUserId) {
      console.error("❌ У пользователя нет bestBenefitsUserId");
      return;
    }

    // Расшифровываем пароль
    let userPassword;
    if (user.bestBenefitsPassword) {
      try {
        userPassword = passwordLib.decryptPassword(user.bestBenefitsPassword);
        console.log("✅ Пароль расшифрован");
      } catch (error) {
        console.error("❌ Ошибка расшифровки пароля:", error);
        return;
      }
    } else {
      console.warn("⚠️ У пользователя нет пароля BestBenefits");
    }

    // Получаем активированные скидки из BestBenefits
    console.log("\n🔄 Получение активированных скидок из BestBenefits...");
    const bbActivated = await getUserActivatedDiscounts(
      user.bestBenefitsUserId,
      userPassword
    );

    console.log("\n📊 Результаты из BestBenefits:");
    console.log(`Найдено скидок: ${bbActivated.length}`);
    bbActivated.forEach((item, index) => {
      console.log(`  ${index + 1}. ID: ${item.id}, Промокод: ${item.promoCode || "нет"}`);
    });

    // Проверяем текущие preferences
    console.log("\n📋 Проверка текущих preferences...");
    const existingPrefs = await prisma.discountPreference.findUnique({
      where: { userId: user.id },
    });

    if (existingPrefs) {
      const filters = existingPrefs.filters || {};
      const claimed = Array.isArray(filters.claimed) ? filters.claimed : [];
      console.log(`Текущих claimed: ${claimed.length}`);
      claimed.forEach((item, index) => {
        const id = typeof item === 'object' ? item.id : item;
        const promoCode = typeof item === 'object' ? item.promoCode : null;
        console.log(`  ${index + 1}. ID: ${id}, Промокод: ${promoCode || "нет"}`);
      });
    } else {
      console.log("❌ Preferences не найдены");
    }

    // Синхронизируем
    console.log("\n🔄 Синхронизация preferences...");
    const existingFilters = existingPrefs?.filters || {};
    const existingFavorites = Array.isArray(existingFilters.favorites)
      ? existingFilters.favorites
      : [];

    const updatedClaimed = bbActivated.map((bbItem) => ({
      id: bbItem.id,
      promoCode: bbItem.promoCode,
    }));

    await prisma.discountPreference.upsert({
      where: { userId: user.id },
      create: {
        userId: user.id,
        pushEnabled: false,
        filters: {
          claimed: updatedClaimed,
          favorites: existingFavorites,
        },
      },
      update: {
        filters: {
          claimed: updatedClaimed,
          favorites: existingFavorites,
        },
      },
    });

    console.log("\n✅ Синхронизация завершена!");
    console.log(`Обновлено claimed: ${updatedClaimed.length}`);
    updatedClaimed.forEach((item, index) => {
      console.log(`  ${index + 1}. ID: ${item.id}, Промокод: ${item.promoCode || "нет"}`);
    });

    // Проверяем результат
    console.log("\n🔍 Проверка результата...");
    const updatedPrefs = await prisma.discountPreference.findUnique({
      where: { userId: user.id },
    });

    if (updatedPrefs) {
      const filters = updatedPrefs.filters || {};
      const claimed = Array.isArray(filters.claimed) ? filters.claimed : [];
      console.log(`✅ В preferences сохранено: ${claimed.length} скидок`);
      claimed.forEach((item, index) => {
        const id = typeof item === 'object' ? item.id : item;
        const promoCode = typeof item === 'object' ? item.promoCode : null;
        console.log(`  ${index + 1}. ID: ${id}, Промокод: ${promoCode || "нет"}`);
      });
    }
  } catch (error) {
    console.error("❌ Ошибка:", error);
  } finally {
    await prisma.$disconnect();
  }
}

testSyncTalik();

