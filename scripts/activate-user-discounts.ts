#!/usr/bin/env node

/**
 * Скрипт для активации скидок пользователя в BestBenefits
 * Активирует скидки и получает новые промокоды
 * 
 * Usage:
 *   pnpm dotenv -e .env.local -- tsx scripts/activate-user-discounts.ts talik.e@mail.ru
 */

import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { decryptPassword } from '../lib/best-benefits-password';
import { safeActivateDiscount } from '../lib/best-benefits-activation';
import { encryptPassword } from '../lib/best-benefits-password';

const prisma = new PrismaClient();

async function activateUserDiscounts(email: string) {
  console.log(`\n🔄 Активация скидок для пользователя: ${email}\n`);

  try {
    const user = await prisma.user.findUnique({
      where: { email },
      select: {
        id: true,
        email: true,
        bestBenefitsUserId: true,
        bestBenefitsPassword: true,
      },
    });

    if (!user) {
      console.error(`❌ Пользователь не найден`);
      process.exit(1);
    }

    console.log(`✅ Пользователь найден:`);
    console.log(`   Email: ${user.email}`);
    console.log(`   BestBenefits ID: ${user.bestBenefitsUserId || 'НЕ УСТАНОВЛЕН'}\n`);

    if (!user.bestBenefitsUserId || !user.bestBenefitsPassword) {
      console.error(`❌ Пользователь не синхронизирован с BestBenefits`);
      process.exit(1);
    }

    // Расшифровываем пароль
    let password: string;
    try {
      password = decryptPassword(user.bestBenefitsPassword);
      console.log(`🔑 Пароль расшифрован\n`);
    } catch (error) {
      console.error(`❌ Ошибка расшифровки пароля:`, error);
      process.exit(1);
    }

    // Получаем preferences с claimed скидками
    const preference = await prisma.discountPreference.findUnique({
      where: { userId: user.id },
    });

    if (!preference) {
      console.error(`❌ Preferences не найдены`);
      process.exit(1);
    }

    const filters = preference.filters || {};
    const claimed = filters.claimed || [];
    
    console.log(`📋 Найдено ${claimed.length} активированных скидок в локальной БД:\n`);

    // Активируем каждую скидку в BestBenefits
    const results: Array<{ id: number; success: boolean; promoCode?: string; error?: string }> = [];

    for (const item of claimed) {
      const discountId = typeof item === 'object' ? item.id : item;
      
      console.log(`🔄 Активация скидки ID: ${discountId}...`);
      
      try {
        const result = await safeActivateDiscount({
          userId: user.id,
          bestBenefitsUserId: user.bestBenefitsUserId,
          discountId,
          email: user.email,
          password,
        });

        if (result.success && result.promoCode) {
          console.log(`   ✅ Успешно! Промокод: ${result.promoCode}\n`);
          results.push({ id: discountId, success: true, promoCode: result.promoCode });
        } else {
          console.log(`   ⚠️  Активация не удалась или промокод не получен\n`);
          results.push({ id: discountId, success: false, error: 'No promo code' });
        }
      } catch (error: any) {
        console.log(`   ❌ Ошибка: ${error.message}\n`);
        results.push({ id: discountId, success: false, error: error.message });
      }

      // Задержка между запросами (rate limit: 1 запрос в секунду)
      // Если получили 429, ждем дольше
      if (results.length > 0 && !results[results.length - 1].success && results[results.length - 1].error?.includes('429')) {
        console.log(`   ⏳ Ожидание 4 секунды из-за rate limit...\n`);
        await new Promise(resolve => setTimeout(resolve, 4000));
      } else {
        await new Promise(resolve => setTimeout(resolve, 1200)); // 1.2 секунды между запросами
      }
    }

    // Обновляем preferences с новыми промокодами
    console.log(`\n💾 Обновление preferences с новыми промокодами...\n`);
    
    const updatedClaimed = claimed.map((item: any) => {
      const itemId = typeof item === 'object' ? item.id : item;
      const result = results.find(r => r.id === itemId);
      
      if (result && result.success && result.promoCode) {
        return { id: itemId, promoCode: result.promoCode };
      }
      
      // Сохраняем существующий промокод, если новый не получен
      return typeof item === 'object' ? item : { id: itemId, promoCode: null };
    });

    await prisma.discountPreference.update({
      where: { userId: user.id },
      data: {
        filters: {
          ...filters,
          claimed: updatedClaimed,
        } as any,
      },
    });

    console.log(`✅ Preferences обновлены!\n`);

    // Показываем итоги
    console.log(`📊 Итоги активации:\n`);
    const successful = results.filter(r => r.success);
    const failed = results.filter(r => !r.success);
    
    console.log(`   ✅ Успешно активировано: ${successful.length}`);
    successful.forEach(r => {
      console.log(`      - ID ${r.id}: ${r.promoCode}`);
    });
    
    if (failed.length > 0) {
      console.log(`\n   ❌ Не удалось активировать: ${failed.length}`);
      failed.forEach(r => {
        console.log(`      - ID ${r.id}: ${r.error || 'Unknown error'}`);
      });
    }

    console.log(`\n💡 Теперь промокоды должны отображаться в карточках скидок!\n`);

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

const email = process.argv[2] || "talik.e@mail.ru";
activateUserDiscounts(email);

