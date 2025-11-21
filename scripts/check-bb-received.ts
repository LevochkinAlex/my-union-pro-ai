#!/usr/bin/env tsx
/**
 * Проверяет полученные промокоды в BestBenefits с детальной информацией
 */

import { getUserActivatedDiscounts } from "../lib/best-benefits-activation";

async function checkReceived() {
  try {
    console.log("🔍 Checking received discounts in BestBenefits for: ceo@yappix.ru\n");

    const discounts = await getUserActivatedDiscounts("ceo@yappix.ru");

    console.log(`\n📊 Total discounts from API: ${discounts.length}\n`);

    const activeDiscounts = discounts.filter(d => d.promoCode);
    const expiredDiscounts = discounts.filter(d => !d.promoCode);

    console.log(`✅ Active discounts (${activeDiscounts.length}):`);
    activeDiscounts.forEach(d => {
      console.log(`  - ID: ${d.id}, PromoCode: ${d.promoCode}`);
    });

    console.log(`\n⚠️  Expired discounts (${expiredDiscounts.length}):`);
    expiredDiscounts.forEach(d => {
      console.log(`  - ID: ${d.id} (промокод истёк)`);
    });

    console.log(`\n💡 Веб-интерфейс BestBenefits показывает только активные промокоды.`);
    console.log(`   Истекшие промокоды не отображаются на странице /profile/received\n`);

    if (activeDiscounts.length === 0) {
      console.log(`❌ Нет активных промокодов для отображения в веб-интерфейсе.`);
      console.log(`   Активируйте новую скидку через приложение, чтобы она появилась.\n`);
    } else {
      console.log(`✅ Активные промокоды должны отображаться на https://bestbenefits.ru/profile/received`);
      console.log(`   Попробуйте обновить страницу или очистить кэш браузера.\n`);
    }
  } catch (error) {
    console.error("❌ Error:", error);
  }
}

checkReceived();

