#!/usr/bin/env node

/**
 * Скрипт для проверки и исправления активации скидки для пользователя
 * 
 * Usage:
 *   pnpm dotenv -e .env.local -- tsx scripts/check-and-fix-discount-activation.ts EMAIL DISCOUNT_ID
 */

import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { decryptPassword } from '../lib/best-benefits-password';
import { getUserActivatedDiscounts } from '../lib/best-benefits-activation';
import { safeActivateDiscount } from '../lib/best-benefits-activation';
import { saveDiscountActivation } from '../lib/discount-activation';

const prisma = new PrismaClient();

async function checkAndFixActivation(email: string, discountId: number) {
  console.log(`\n🔍 Проверка активации скидки ${discountId} для пользователя ${email}...\n`);

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
        console.log(`✅ Пароль Best Benefits расшифрован`);
      } catch (error) {
        console.error(`❌ Ошибка расшифровки пароля:`, error);
        process.exit(1);
      }
    } else {
      console.error(`❌ Пароль Best Benefits не установлен`);
      process.exit(1);
    }

    // Проверяем активацию в нашей БД
    console.log(`\n📊 Проверка активации в базе данных...`);
    const dbActivation = await prisma.discountActivation.findUnique({
      where: {
        userId_discountId: {
          userId: user.id,
          discountId: discountId,
        },
      },
    });

    if (dbActivation) {
      console.log(`✅ Активация найдена в БД:`);
      console.log(`   Промокод: ${dbActivation.promoCode || 'НЕТ'}`);
      console.log(`   Активирована: ${dbActivation.activatedAt}`);
      console.log(`   Действует до: ${dbActivation.validUntil || 'НЕ УКАЗАНО'}`);
      console.log(`   Синхронизировано из BB: ${dbActivation.syncedFromBB ? 'ДА' : 'НЕТ'}`);
    } else {
      console.log(`⚠️  Активация НЕ найдена в БД`);
    }

    // Проверяем активацию в Best Benefits
    console.log(`\n🔄 Проверка активации в Best Benefits...`);
    try {
      const bbActivated = await getUserActivatedDiscounts(
        user.bestBenefitsUserId,
        password,
        {
          timeout: 20000,
          retries: 3,
        }
      );

      const bbItem = bbActivated.find((item: any) => item.id === discountId);
      const isActivatedInBB = !!bbItem;
      
      if (isActivatedInBB) {
        console.log(`✅ Скидка активирована в Best Benefits:`);
        console.log(`   ID: ${bbItem.id}`);
        console.log(`   Название: ${bbItem.name || 'N/A'}`);
        console.log(`   Промокоды: ${bbItem.codes?.length || 0}`);
        if (bbItem.codes && bbItem.codes.length > 0) {
          bbItem.codes.forEach((code: any, index: number) => {
            console.log(`     ${index + 1}. ${code.code} (до ${code.end_date || 'N/A'})`);
          });
        }
      } else {
        console.log(`❌ Скидка НЕ активирована в Best Benefits`);
      }

      // Проверяем, есть ли активные промокоды
      const hasActivePromoCode = bbItem && bbItem.codes?.some((c: any) => 
        c.code && c.code !== 'Промокод деактивирован' && c.code.trim() !== ''
      );

      // Если активирована в BB, но не в БД, или наоборот - синхронизируем
      if (isActivatedInBB && !dbActivation) {
        console.log(`\n🔧 Исправление: активация есть в BB, но нет в БД. Синхронизируем...`);
        const activeCode = bbItem.codes?.find((c: any) => 
          c.code && c.code !== 'Промокод деактивирован' && c.code.trim() !== ''
        );
        const promoCode = activeCode?.code || null;
        const validUntil = activeCode?.end_date ? new Date(activeCode.end_date) : null;

        await saveDiscountActivation(user.id, {
          discountId: discountId,
          promoCode: promoCode,
          validUntil: validUntil,
        });

        console.log(`✅ Активация сохранена в БД`);
      } else if (!isActivatedInBB && dbActivation) {
        console.log(`\n⚠️  Активация есть в БД, но нет в Best Benefits.`);
        console.log(`   Это может означать, что скидка была отменена в Best Benefits.`);
      } else if (!isActivatedInBB && !dbActivation) {
        console.log(`\n🔧 Исправление: скидка не активирована нигде. Активируем...`);
        
        const activationResult = await safeActivateDiscount({
          userId: user.id,
          bestBenefitsUserId: user.bestBenefitsUserId,
          discountId: discountId,
          email: user.email,
          password: password,
        });

        if (activationResult.success) {
          console.log(`✅ Скидка успешно активирована в Best Benefits`);
          console.log(`   Промокод: ${activationResult.promoCode || 'НЕТ'}`);
          
          // Сохраняем в БД
          if (activationResult.promoCode) {
            await saveDiscountActivation(user.id, {
              discountId: discountId,
              promoCode: activationResult.promoCode,
              validUntil: null, // Будет обновлено при следующей синхронизации
            });
            console.log(`✅ Активация сохранена в БД`);
          }
        } else {
          console.error(`❌ Ошибка активации: ${activationResult.error || 'Неизвестная ошибка'}`);
        }
      } else if (isActivatedInBB && !hasActivePromoCode) {
        // Скидка активирована, но все промокоды деактивированы - переактивируем
        console.log(`\n🔧 Исправление: скидка активирована, но все промокоды деактивированы. Переактивируем...`);
        
        const activationResult = await safeActivateDiscount({
          userId: user.id,
          bestBenefitsUserId: user.bestBenefitsUserId,
          discountId: discountId,
          email: user.email,
          password: password,
        });

        if (activationResult.success) {
          console.log(`✅ Скидка успешно переактивирована в Best Benefits`);
          console.log(`   Новый промокод: ${activationResult.promoCode || 'НЕТ'}`);
          
          // Обновляем в БД
          if (activationResult.promoCode) {
            await saveDiscountActivation(user.id, {
              discountId: discountId,
              promoCode: activationResult.promoCode,
              validUntil: null, // Будет обновлено при следующей синхронизации
            });
            console.log(`✅ Активация обновлена в БД с новым промокодом`);
          }
        } else {
          console.error(`❌ Ошибка переактивации: ${activationResult.error || 'Неизвестная ошибка'}`);
        }
      } else {
        console.log(`\n✅ Активация синхронизирована между БД и Best Benefits`);
      }

    } catch (error: any) {
      console.error(`❌ Ошибка при проверке Best Benefits:`, error.message);
    }

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
const discountId = parseInt(process.argv[3]);

if (!email) {
  console.error('❌ Укажите email пользователя:');
  console.error('   pnpm dotenv -e .env.local -- tsx scripts/check-and-fix-discount-activation.ts EMAIL DISCOUNT_ID');
  process.exit(1);
}

if (!discountId || isNaN(discountId)) {
  console.error('❌ Укажите ID скидки:');
  console.error('   pnpm dotenv -e .env.local -- tsx scripts/check-and-fix-discount-activation.ts EMAIL DISCOUNT_ID');
  process.exit(1);
}

checkAndFixActivation(email, discountId);

