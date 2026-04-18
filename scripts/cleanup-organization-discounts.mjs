#!/usr/bin/env node

/**
 * Очистка скидок, которые были подтянуты от организации (p-crusader@yandex.ru)
 * Удаляет все скидки, которых нет в BestBenefits для конкретного пользователя
 * 
 * Usage:
 *   pnpm tsx scripts/cleanup-organization-discounts.mjs
 */

import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { PrismaClient } from '@prisma/client';
import { getUserActivatedDiscounts } from '../lib/best-benefits-activation.ts';
import { decryptPassword } from '../lib/best-benefits-password.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Загружаем .env.local
dotenv.config({ path: join(__dirname, "..", ".env.local") });

const prisma = new PrismaClient({
  datasources: {
    db: {
      url: process.env.DATABASE_URL?.replace('79.143.29.66', 'localhost') || process.env.DATABASE_URL,
    },
  },
});

async function cleanupOrganizationDiscounts() {
  console.log(`\n🔍 Очистка скидок от организации...`);

  try {
    // Получаем всех пользователей с активированными скидками
    const usersWithDiscounts = await prisma.discountActivation.findMany({
      select: {
        userId: true,
      },
      distinct: ['userId'],
    });

    console.log(`\n📊 Найдено ${usersWithDiscounts.length} пользователей с активированными скидками`);

    let totalRemoved = 0;
    let totalChecked = 0;

    for (const { userId } of usersWithDiscounts) {
      try {
        const user = await prisma.user.findUnique({
          where: { id: userId },
          select: {
            id: true,
            email: true,
            bestBenefitsUserId: true,
            bestBenefitsPassword: true,
          },
        });

        if (!user || !user.bestBenefitsUserId) {
          console.log(`\n⚠️  Пользователь ${user?.email || userId} не синхронизирован с BestBenefits - пропускаем`);
          continue;
        }

        console.log(`\n👤 Проверяем пользователя: ${user.email || user.id}`);

        // Получаем активированные скидки из нашей БД
        const dbActivations = await prisma.discountActivation.findMany({
          where: { userId: user.id },
          select: {
            discountId: true,
            promoCode: true,
          },
        });

        console.log(`   Скидок в нашей БД: ${dbActivations.length}`);

        // Получаем активированные скидки из BestBenefits
        let bbActivated = [];
        try {
          let userPassword = undefined;
          if (user.bestBenefitsPassword) {
            try {
              userPassword = decryptPassword(user.bestBenefitsPassword);
            } catch (error) {
              console.warn(`   ⚠️  Не удалось расшифровать пароль: ${error.message}`);
            }
          }

          if (userPassword) {
            bbActivated = await getUserActivatedDiscounts(
              user.bestBenefitsUserId,
              userPassword,
              {
                timeout: 20000,
                retries: 3,
              }
            );
            console.log(`   Скидок в BestBenefits: ${bbActivated.length}`);
          } else {
            console.log(`   ⚠️  Пароль не сохранен - удаляем все скидки (они могли быть от организации)`);
            // Удаляем все скидки, если нет пароля
            const deleteResult = await prisma.discountActivation.deleteMany({
              where: { userId: user.id },
            });
            totalRemoved += deleteResult.count;
            console.log(`   ✅ Удалено ${deleteResult.count} скидок (нет пароля для проверки)`);
            continue;
          }
        } catch (error) {
          console.error(`   ❌ Ошибка при получении скидок из BestBenefits: ${error.message}`);
          continue;
        }

        // Создаем Set ID скидок из BestBenefits
        const bbIdsSet = new Set(bbActivated.map(d => d.id));

        // Находим скидки, которых нет в BestBenefits
        const toRemove = dbActivations.filter(activation => !bbIdsSet.has(activation.discountId));

        if (toRemove.length > 0) {
          console.log(`   ❌ Найдено ${toRemove.length} лишних скидок (не в BestBenefits):`);
          toRemove.forEach(activation => {
            console.log(`      - ID: ${activation.discountId}, Промокод: ${activation.promoCode || 'нет'}`);
          });

          // Удаляем лишние скидки
          const discountIds = toRemove.map(a => a.discountId);
          const deleteResult = await prisma.discountActivation.deleteMany({
            where: {
              userId: user.id,
              discountId: {
                in: discountIds,
              },
            },
          });

          totalRemoved += deleteResult.count;
          console.log(`   ✅ Удалено ${deleteResult.count} лишних скидок`);
        } else {
          console.log(`   ✅ Все скидки корректны`);
        }

        totalChecked++;

      } catch (error) {
        console.error(`\n❌ Ошибка при обработке пользователя:`, error.message);
      }
    }

    console.log(`\n✅ Очистка завершена!`);
    console.log(`   Проверено пользователей: ${totalChecked}`);
    console.log(`   Удалено лишних скидок: ${totalRemoved}`);

  } catch (error) {
    console.error(`\n❌ Критическая ошибка:`, error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

cleanupOrganizationDiscounts();

