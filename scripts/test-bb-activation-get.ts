/**
 * Тестовый скрипт для проверки активации через GET запросы
 */

import { getBestBenefitsToken } from "../lib/best-benefits-auth";

const ACTIVATION_API_BASE = "https://bestbenefits.ru/api";

async function main() {
  const args = process.argv.slice(2);
  if (args.length < 2) {
    console.error("Usage: tsx test-bb-activation-get.ts <email> <product_id>");
    process.exit(1);
  }

  const [email, productIdStr] = args;
  const productId = parseInt(productIdStr);

  console.log("🔐 Getting BestBenefits token...");
  const token = await getBestBenefitsToken();
  console.log("✅ Token obtained\n");

  // Попробуем GET запросы с параметрами активации
  const endpointsToTest = [
    // GET с query параметрами для активации
    `/user/products?user_id=${email}&product_id=${productId}&activate=true`,
    `/user/products?user_id=${email}&activate=${productId}`,
    `/user/activate?user_id=${email}&product_id=${productId}`,
    `/products/${productId}/activate?user_id=${email}`,
    `/activate?user_id=${email}&product_id=${productId}`,
  ];

  console.log("🧪 Testing GET endpoints with activation parameters:\n");

  for (const endpoint of endpointsToTest) {
    try {
      const url = `${ACTIVATION_API_BASE}${endpoint}`;
      console.log(`\n🔍 Testing: GET ${url}`);

      const response = await fetch(url, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/json",
        },
      });

      const responseText = await response.text();
      let body;
      try {
        body = JSON.parse(responseText);
      } catch {
        body = responseText;
      }

      console.log(`📊 Status: ${response.status} ${response.statusText}`);
      console.log(`📄 Response:`, JSON.stringify(body, null, 2));

      if (response.ok) {
        console.log(`✅ SUCCESS! This might be the activation endpoint!`);
      }
    } catch (error) {
      console.error(`❌ Error:`, error);
    }

    await new Promise((resolve) => setTimeout(resolve, 500));
  }
}

main().catch(console.error);

