#!/usr/bin/env node

/**
 * Скрипт для проверки и исправления всех активированных скидок пользователя
 * 
 * Usage:
 *   pnpm dotenv -e .env.local -- tsx scripts/fix-all-user-discounts.ts EMAIL
 */

import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { decryptPassword } from '../lib/best-benefits-password';
import { getUserActivatedDiscounts } from '../lib/best-benefits-activation';
import { safeActivateDiscount } from '../lib/best-benefits-activation';
import { saveDiscountActivation } from '../lib/discount-activation';

const prisma = new PrismaClient();

async function fixAllUserDiscounts(email: string) {
  console.log(`\n🔍 Проверка и исправление всех активаций для пользователя ${email}...\n`);

  try {
    // Находим пользователя
    const user = await prisma.user.findUnique({
      where: { email },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        bestBenefitsUserId: true,
        bestBenefitsPassword: true,
      },
    });

    if (!user) {
      console.error(`❌ Пользователь ${email} не найден`);
      process.exit(1);
    }

    console.log(`✅ Пользователь найден:`);
    console.log(`   ID: ${user.id}`);
    console.log(`   Имя: ${user.firstName || 'N/A'} ${user.lastName || 'N/A'}`);
    console.log(`   BestBenefits User ID: ${user.bestBenefitsUserId || 'НЕ СИНХРОНИЗИРОВАН'}`);

    if (!user.bestBenefitsUserId) {
      console.error(`❌ Пользователь не синхронизирован с Best Benefits`);
      process.exit(1);
    }

    // Расшифровываем пароль
    let password: string | undefined;
    if (user.bestBenefitsPassword) {
      try {
        password = decryptPassword(user.bestBenefitsPassword);
        console.log(`✅ Пароль Best Benefits расшифрован\n`);
      } catch (error) {
        console.error(`❌ Ошибка расшифровки пароля:`, error);
        process.exit(1);
      }
    } else {
      console.error(`❌ Пароль Best Benefits не установлен`);
      process.exit(1);
    }

    // Получаем все активированные скидки из Best Benefits
    console.log(`🔄 Получение списка активированных скидок из Best Benefits...`);
    const bbActivated = await getUserActivatedDiscounts(
      user.bestBenefitsUserId,
      password,
      {
        timeout: 20000,
        retries: 3,
      }
    );

    console.log(`✅ Найдено ${bbActivated.length} активированных скидок\n`);

    if (bbActivated.length === 0) {
      console.log(`⚠️  Нет активированных скидок для исправления`);
      await prisma.$disconnect();
      process.exit(0);
    }

    // Проверяем каждую скидку
    const discountsToFix: number[] = [];
    
    for (const discount of bbActivated) {
      // Проверяем, есть ли активные промокоды
      const hasActivePromoCode = discount.codes?.some((c: any) => 
        c.code && 
        c.code !== 'Промокод деактивирован' && 
        c.code.trim() !== '' &&
        (!c.end_date || new Date(c.end_date) > new Date())
      );

      if (!hasActivePromoCode) {
        discountsToFix.push(discount.id);
        console.log(`⚠️  Скидка ${discount.id} (${discount.name || 'N/A'}): все промокоды деактивированы`);
      }
    }

    if (discountsToFix.length === 0) {
      console.log(`\n✅ Все скидки имеют активные промокоды. Исправления не требуются.`);
      await prisma.$disconnect();
      process.exit(0);
    }

    console.log(`\n🔧 Найдено ${discountsToFix.length} скидок для исправления\n`);

    // Исправляем каждую скидку
    let fixedCount = 0;
    let errorCount = 0;

    for (const discountId of discountsToFix) {
      try {
        console.log(`\n🔄 Исправление скидки ${discountId}...`);
        
        const activationResult = await safeActivateDiscount({
          userId: user.id,
          bestBenefitsUserId: user.bestBenefitsUserId,
          discountId: discountId,
          email: user.email,
          password: password!,
        });

        if (activationResult.success) {
          console.log(`✅ Скидка ${discountId} успешно переактивирована`);
          console.log(`   Новый промокод: ${activationResult.promoCode || 'НЕТ'}`);
          
          // Обновляем в БД
          if (activationResult.promoCode) {
            await saveDiscountActivation(user.id, {
              discountId: discountId,
              promoCode: activationResult.promoCode,
              validUntil: null, // Будет обновлено при следующей синхронизации
            });
            console.log(`✅ Активация обновлена в БД`);
          }
          
          fixedCount++;
        } else {
          console.error(`❌ Ошибка переактивации скидки ${discountId}: ${activationResult.error || 'Неизвестная ошибка'}`);
          errorCount++;
        }

        // Небольшая задержка между запросами, чтобы не перегружать API
        await new Promise(resolve => setTimeout(resolve, 1000));
      } catch (error: any) {
        console.error(`❌ Ошибка при исправлении скидки ${discountId}: ${error.message}`);
        errorCount++;
      }
    }

    console.log(`\n📊 Итоги:`);
    console.log(`   Всего скидок для исправления: ${discountsToFix.length}`);
    console.log(`   Успешно исправлено: ${fixedCount}`);
    console.log(`   Ошибок: ${errorCount}`);

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

if (!email) {
  console.error('❌ Укажите email пользователя:');
  console.error('   pnpm dotenv -e .env.local -- tsx scripts/fix-all-user-discounts.ts EMAIL');
  process.exit(1);
}

fixAllUserDiscounts(email);

