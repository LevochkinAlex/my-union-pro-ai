#!/usr/bin/env tsx
/**
 * Тестирование активации конкретной скидки 3764 через BestBenefits API
 */

import { activateBestBenefitsDiscount } from "../lib/best-benefits-activation";

async function testActivation() {
  try {
    console.log("🔄 Testing activation of discount 3764...\n");

    const result = await activateBestBenefitsDiscount({
      userId: "cmhz9coo7001bp1tgwvpv9rmd",
      bestBenefitsUserId: "ceo@yappix.ru",
      discountId: 3764,
      email: "ceo@yappix.ru",
    });

    console.log("\n📊 Activation Result:");
    console.log(JSON.stringify(result, null, 2));

    if (result.success) {
      console.log("\n✅ SUCCESS!");
      console.log(`Promo Code: ${result.promoCode}`);
    } else {
      console.log("\n❌ FAILED!");
      console.log(`Message: ${result.message}`);
    }
  } catch (error) {
    console.error("❌ Error:", error);
  }
}

testActivation();

