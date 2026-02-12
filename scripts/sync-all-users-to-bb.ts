/**
 * Скрипт для массовой синхронизации всех пользователей с BestBenefits
 * 
 * Находит всех пользователей, у которых:
 * - Есть подтвержденный email (emailVerified)
 * - Есть firstName и lastName
 * - Нет bestBenefitsUserId (еще не синхронизированы)
 * 
 * И создает для них аккаунты в BestBenefits
 */

import { PrismaClient } from "@prisma/client";
import { syncUserToBestBenefits } from "../lib/best-benefits-users";
import { encryptPassword } from "../lib/best-benefits-password";
import crypto from "crypto";

const prisma = new PrismaClient();

interface SyncResult {
  success: number;
  failed: number;
  skipped: number;
  errors: Array<{ email: string; error: string }>;
}

async function syncAllUsers() {
  const result: SyncResult = {
    success: 0,
    failed: 0,
    skipped: 0,
    errors: [],
  };

  try {
    console.log("🔄 Поиск пользователей для синхронизации с BestBenefits...\n");

    // Находим всех пользователей, которые должны быть синхронизированы
    const usersToSync = await prisma.user.findMany({
      where: {
        email: { not: null },
        emailVerified: { not: null },
        firstName: { not: null },
        lastName: { not: null },
        bestBenefitsUserId: null, // Еще не синхронизированы
      },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        bestBenefitsPassword: true,
      },
      orderBy: {
        createdAt: "asc",
      },
    });

    console.log(`📋 Найдено пользователей для синхронизации: ${usersToSync.length}\n`);

    if (usersToSync.length === 0) {
      console.log("✅ Все пользователи уже синхронизированы или не соответствуют критериям.");
      return;
    }

    // Проверяем переменную окружения
    if (process.env.USE_REAL_BB_API !== "true") {
      console.warn(
        `⚠️  USE_REAL_BB_API не установлен в "true". Установите его для реального создания аккаунтов.`
      );
      console.log(`   Для тестирования можно продолжить, но аккаунты не будут созданы в BestBenefits.\n`);
    }

    // Синхронизируем каждого пользователя
    for (let i = 0; i < usersToSync.length; i++) {
      const user = usersToSync[i];
      const progress = `[${i + 1}/${usersToSync.length}]`;

      console.log(`${progress} Синхронизация: ${user.email} (${user.firstName} ${user.lastName})`);

      try {
        // Генерируем или используем сохраненный пароль
        let bbPassword: string;
        let needToSavePassword = false;

        if (user.bestBenefitsPassword) {
          try {
            const { decryptPassword } = await import("../lib/best-benefits-password");
            bbPassword = decryptPassword(user.bestBenefitsPassword);
            console.log(`   ${progress} Используется сохраненный пароль`);
          } catch (error) {
            console.log(`   ${progress} Ошибка расшифровки пароля, генерируем новый`);
            bbPassword = crypto.randomBytes(12).toString("base64").slice(0, 12);
            needToSavePassword = true;
          }
        } else {
          console.log(`   ${progress} Генерация нового пароля`);
          bbPassword = crypto.randomBytes(12).toString("base64").slice(0, 12);
          needToSavePassword = true;
        }

        // Создаем аккаунт в BestBenefits
        let bbData;
        try {
          bbData = await syncUserToBestBenefits({
            id: user.id,
            email: user.email!,
            firstName: user.firstName!,
            lastName: user.lastName!,
            password: bbPassword,
            city_id: null,
          });

          console.log(`   ${progress} ✅ Аккаунт создан в BestBenefits: ${bbData.bestBenefitsUserId}`);
        } catch (error: any) {
          // Если пользователь уже существует в BestBenefits, используем email как ID
          const errorMessage = error?.message || String(error);
          const errorData = error?.response?.data || error?.data;
          
          if (
            errorMessage.includes("уже существует") ||
            errorMessage.includes("already exists") ||
            errorMessage.includes("Ошибка проверки") ||
            (errorData?.errors?.email && 
             (errorData.errors.email.some((e: string) => e.includes("уже существует")) ||
              errorData.errors.email.some((e: string) => e.includes("already exists"))))
          ) {
            console.log(`   ${progress} ⚠️  Пользователь уже существует в BestBenefits, используем email как ID`);
            bbData = {
              bestBenefitsUserId: user.email!,
              status: "active",
            };
          } else {
            throw error;
          }
        }

        // Шифруем пароль, если нужно
        let encryptedBbPassword = user.bestBenefitsPassword;
        if (needToSavePassword) {
          encryptedBbPassword = encryptPassword(bbPassword);
        }

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

        console.log(`   ${progress} 💾 Данные сохранены в БД\n`);
        result.success++;
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.error(`   ${progress} ❌ Ошибка: ${errorMessage}\n`);
        result.failed++;
        result.errors.push({
          email: user.email || "unknown",
          error: errorMessage,
        });
      }

      // Небольшая задержка между запросами, чтобы не перегружать API
      if (i < usersToSync.length - 1) {
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
    }

    // Выводим итоговую статистику
    console.log("\n" + "=".repeat(60));
    console.log("📊 ИТОГОВАЯ СТАТИСТИКА");
    console.log("=".repeat(60));
    console.log(`✅ Успешно синхронизировано: ${result.success}`);
    console.log(`❌ Ошибок: ${result.failed}`);
    console.log(`⏭️  Пропущено: ${result.skipped}`);
    console.log(`📋 Всего обработано: ${usersToSync.length}`);

    if (result.errors.length > 0) {
      console.log("\n❌ ОШИБКИ:");
      result.errors.forEach((err, index) => {
        console.log(`   ${index + 1}. ${err.email}: ${err.error}`);
      });
    }

    console.log("\n" + "=".repeat(60));
  } catch (error) {
    console.error("❌ Критическая ошибка:", error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

// Запускаем скрипт
syncAllUsers();

