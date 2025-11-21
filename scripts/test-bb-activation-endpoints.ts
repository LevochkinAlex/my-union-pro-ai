/**
 * Тестовый скрипт для проверки всех возможных endpoints активации BestBenefits
 * 
 * Запуск: pnpm dotenv -e .env.local -- tsx scripts/test-bb-activation-endpoints.ts <email> <product_id>
 * Пример: pnpm dotenv -e .env.local -- tsx scripts/test-bb-activation-endpoints.ts ceo@yappix.ru 4745
 */

import { getBestBenefitsToken } from "../lib/best-benefits-auth";

const ACTIVATION_API_BASE = "https://bestbenefits.ru/api";

interface TestResult {
  endpoint: string;
  method: string;
  status: number;
  statusText: string;
  body: any;
  success: boolean;
}

async function testEndpoint(
  endpoint: string,
  method: string,
  payload: any,
  token: string
): Promise<TestResult> {
  try {
    const url = `${ACTIVATION_API_BASE}${endpoint}`;
    console.log(`\n🧪 Testing: ${method} ${url}`);
    console.log(`📦 Payload:`, JSON.stringify(payload, null, 2));

    const response = await fetch(url, {
      method,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
      },
      body: method !== "GET" ? JSON.stringify(payload) : undefined,
    });

    const responseText = await response.text();
    let body;
    try {
      body = JSON.parse(responseText);
    } catch {
      body = responseText;
    }

    const result: TestResult = {
      endpoint,
      method,
      status: response.status,
      statusText: response.statusText,
      body,
      success: response.ok,
    };

    console.log(`📊 Status: ${result.status} ${result.statusText}`);
    console.log(`📄 Response:`, JSON.stringify(body, null, 2));

    return result;
  } catch (error) {
    console.error(`❌ Error:`, error);
    return {
      endpoint,
      method,
      status: 0,
      statusText: "ERROR",
      body: error instanceof Error ? error.message : String(error),
      success: false,
    };
  }
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length < 2) {
    console.error("Usage: tsx test-bb-activation-endpoints.ts <email> <product_id>");
    console.error("Example: tsx test-bb-activation-endpoints.ts ceo@yappix.ru 4745");
    process.exit(1);
  }

  const [email, productIdStr] = args;
  const productId = parseInt(productIdStr);

  if (isNaN(productId)) {
    console.error("Product ID must be a number");
    process.exit(1);
  }

  console.log("🔐 Getting BestBenefits token...");
  const token = await getBestBenefitsToken();
  console.log("✅ Token obtained");

  const payload = {
    user_id: email,
    product_id: productId,
    email: email,
  };

  const endpointsToTest = [
    // Вариант 1: POST /user/products (RESTful)
    { endpoint: "/user/products", method: "POST" },
    
    // Вариант 2: POST /user/activate_product (старый)
    { endpoint: "/user/activate_product", method: "POST" },
    
    // Вариант 3: POST /products/activate
    { endpoint: "/products/activate", method: "POST" },
    
    // Вариант 4: POST /products/{id}/activate
    { endpoint: `/products/${productId}/activate`, method: "POST" },
    
    // Вариант 5: PUT /user/products
    { endpoint: "/user/products", method: "PUT" },
    
    // Вариант 6: POST /user/claim_product
    { endpoint: "/user/claim_product", method: "POST" },
    
    // Вариант 7: POST /activate
    { endpoint: "/activate", method: "POST" },
    
    // Вариант 8: POST /user/products/activate
    { endpoint: "/user/products/activate", method: "POST" },
    
    // Вариант 9: PATCH /user/products
    { endpoint: "/user/products", method: "PATCH" },
  ];

  console.log("\n" + "=".repeat(80));
  console.log("🚀 Starting BestBenefits Activation Endpoint Tests");
  console.log("=".repeat(80));
  console.log(`📧 User: ${email}`);
  console.log(`🎁 Product ID: ${productId}`);
  console.log(`🔍 Testing ${endpointsToTest.length} endpoints...\n`);

  const results: TestResult[] = [];

  for (const { endpoint, method } of endpointsToTest) {
    const result = await testEndpoint(endpoint, method, payload, token);
    results.push(result);
    
    // Небольшая пауза между запросами
    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  console.log("\n" + "=".repeat(80));
  console.log("📊 SUMMARY OF RESULTS");
  console.log("=".repeat(80));

  const successful = results.filter((r) => r.success);
  const failed = results.filter((r) => !r.success);

  console.log(`\n✅ Successful (${successful.length}):`);
  successful.forEach((r) => {
    console.log(`   ${r.method} ${r.endpoint} → ${r.status} ${r.statusText}`);
  });

  console.log(`\n❌ Failed (${failed.length}):`);
  failed.forEach((r) => {
    console.log(`   ${r.method} ${r.endpoint} → ${r.status} ${r.statusText}`);
  });

  if (successful.length > 0) {
    console.log("\n🎉 WORKING ENDPOINT FOUND!");
    console.log("\nUpdate lib/best-benefits-activation.ts:");
    const winner = successful[0];
    console.log(`\nconst url = \`\${ACTIVATION_API_BASE}${winner.endpoint}\`;`);
    console.log(`method: "${winner.method}"`);
    console.log(`\nResponse format:`);
    console.log(JSON.stringify(winner.body, null, 2));
  } else {
    console.log("\n😞 No working endpoint found.");
    console.log("\nPossible reasons:");
    console.log("1. BestBenefits API doesn't support activation via API");
    console.log("2. Need to contact BestBenefits for correct endpoint");
    console.log("3. Different payload format required");
    console.log("4. User needs to activate manually on bestbenefits.ru");
  }

  console.log("\n" + "=".repeat(80));
}

main().catch(console.error);

