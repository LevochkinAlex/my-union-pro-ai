#!/usr/bin/env node
/**
 * Test script for BestBenefits API connection
 * Usage: node scripts/test-bb-api.mjs
 */

import { config } from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
config({ path: path.join(root, ".env") });
config({ path: path.join(root, ".env.local"), override: true });

const AUTH_URL = "https://bestbenefits.ru/api/auth";
const PRODUCTS_URL =
  process.env.BEST_BENEFITS_API_URL?.trim() ||
  "https://bestbenefits.ru/api/myunion/products";

const staticToken =
  process.env.BB_PROFSOYUZY_TOKEN?.trim() || process.env.BB_API_TOKEN?.trim();
const BB_LOGIN = process.env.BB_LOGIN;
const BB_PASSWORD = process.env.BB_PASSWORD;

console.log("🧪 Testing BestBenefits API connection...\n");

async function getBearer() {
  if (staticToken) {
    console.log("🔑 Using BB_PROFSOYUZY_TOKEN / BB_API_TOKEN\n");
    return staticToken;
  }
  if (BB_LOGIN && BB_PASSWORD) {
    console.log("🔑 Authenticating (legacy BB_LOGIN/BB_PASSWORD)...\n");
    const authResponse = await fetch(AUTH_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: BB_LOGIN, password: BB_PASSWORD }),
    });
    if (!authResponse.ok) {
      const errorText = await authResponse.text();
      throw new Error(`Authentication failed: ${authResponse.status} - ${errorText}`);
    }
    const authData = await authResponse.json();
    const t = authData.access_token || authData.token;
    console.log(`✅ Token: ${t.substring(0, 20)}...\n`);
    return t;
  }
  console.error(
    "❌ Задайте BB_PROFSOYUZY_TOKEN (или BB_API_TOKEN), либо legacy BB_LOGIN + BB_PASSWORD",
  );
  process.exit(1);
}

try {
  const accessToken = await getBearer();

  console.log("📦 Fetching products...");
  const productsResponse = await fetch(`${PRODUCTS_URL}?per_page=5`, {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json",
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

  console.log(`✅ Products OK`);
  console.log(`📊 Sample count: ${products.length}`);

  if (products.length > 0) {
    console.log(`\n🎁 Sample products:`);
    products.slice(0, 3).forEach((product, index) => {
      console.log(`  ${index + 1}. ${product.name || "Unnamed"}`);
      console.log(`     ID: ${product.id}`);
      console.log(`     Category: ${product.main_category?.name || "N/A"}`);
      console.log(`     Discount: ${product.discount_value || "N/A"}`);
      console.log(
        `     Cities: ${product.cities?.map((c) => c.name).join(", ") || "N/A"}`,
      );
    });
  }

  console.log("\n✅ All tests passed!");
} catch (error) {
  console.error("\n❌ Error:", error.message);
  console.error(error);
  process.exit(1);
}
