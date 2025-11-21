#!/usr/bin/env node
/**
 * Test script for BestBenefits API connection
 * Usage: node scripts/test-bb-api.mjs
 */

import 'dotenv/config';

const BB_LOGIN = process.env.BB_LOGIN;
const BB_PASSWORD = process.env.BB_PASSWORD;
const AUTH_URL = "https://bestbenefits.ru/api/auth";
const PRODUCTS_URL = "https://bestbenefits.ru/api/products";

console.log("🧪 Testing BestBenefits API connection...\n");

// Check credentials
if (!BB_LOGIN || !BB_PASSWORD) {
  console.error("❌ Error: BB_LOGIN and BB_PASSWORD not set in environment");
  process.exit(1);
}

console.log(`📧 Login: ${BB_LOGIN}`);
console.log(`🔐 Password: ${"*".repeat(BB_PASSWORD.length)}\n`);

try {
  // Step 1: Authenticate
  console.log("🔑 Step 1: Authenticating...");
  const authResponse = await fetch(AUTH_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      email: BB_LOGIN,
      password: BB_PASSWORD,
    }),
  });

  if (!authResponse.ok) {
    const errorText = await authResponse.text();
    console.error(`❌ Authentication failed: ${authResponse.status}`);
    console.error(`Response: ${errorText}`);
    process.exit(1);
  }

  const authData = await authResponse.json();
  console.log("✅ Authentication successful!");
  console.log(`🎫 Token type: ${authData.token_type}`);
  console.log(`⏰ Expires in: ${authData.expires_in || "N/A"} seconds`);
  console.log(`🔑 Token: ${authData.access_token.substring(0, 20)}...\n`);

  // Step 2: Fetch products
  console.log("📦 Step 2: Fetching products...");
  const productsResponse = await fetch(`${PRODUCTS_URL}?per_page=5`, {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${authData.access_token}`,
      "Accept": "application/json",
    },
  });

  if (!productsResponse.ok) {
    const errorText = await productsResponse.text();
    console.error(`❌ Products fetch failed: ${productsResponse.status}`);
    console.error(`Response: ${errorText}`);
    process.exit(1);
  }

  const productsData = await productsResponse.json();
  const products = productsData.data || [];
  
  console.log(`✅ Products fetch successful!`);
  console.log(`📊 Total products: ${products.length}`);
  
  if (products.length > 0) {
    console.log(`\n🎁 Sample products:`);
    products.slice(0, 3).forEach((product, index) => {
      console.log(`  ${index + 1}. ${product.name || "Unnamed"}`);
      console.log(`     ID: ${product.id}`);
      console.log(`     Category: ${product.main_category?.name || "N/A"}`);
      console.log(`     Discount: ${product.discount_value || "N/A"}`);
      console.log(`     Cities: ${product.cities?.map(c => c.name).join(", ") || "N/A"}`);
    });
  }

  console.log("\n✅ All tests passed! BestBenefits API is working correctly.");
  
} catch (error) {
  console.error("\n❌ Error:", error.message);
  console.error(error);
  process.exit(1);
}

