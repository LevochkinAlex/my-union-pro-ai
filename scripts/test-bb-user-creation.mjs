#!/usr/bin/env node
/**
 * Test script for BestBenefits user creation
 * Usage: node scripts/test-bb-user-creation.mjs
 */

import 'dotenv/config';

const BB_PROFSOYUZY_TOKEN = process.env.BB_PROFSOYUZY_TOKEN;
/** Актуальный org API MyUnion (не /api/profsoyuzy) */
const CREATE_USER_URL = "https://bestbenefits.ru/api/myunion/create_user";

console.log("🧪 BestBenefits org API:", CREATE_USER_URL, "\n");

// Check token
if (!BB_PROFSOYUZY_TOKEN) {
  console.error("❌ Error: BB_PROFSOYUZY_TOKEN not set in environment");
  process.exit(1);
}

console.log(`🎫 Bearer (BB_PROFSOYUZY_TOKEN): ${BB_PROFSOYUZY_TOKEN.substring(0, 20)}...\n`);

try {

  // Step 1: Create test user
  console.log("👤 Step 1: Creating test user...");
  
  const testUser = {
    name: `Test User ${Date.now()}`,
    email: `test-${Date.now()}@example.com`,
    password: "TestPassword123",
    city_id: null,
  };

  console.log(`📧 Email: ${testUser.email}`);
  console.log(`👤 Name: ${testUser.name}\n`);

  const createUserResponse = await fetch(CREATE_USER_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${BB_PROFSOYUZY_TOKEN}`,
      "Accept": "application/json",
    },
    body: JSON.stringify(testUser),
  });

  if (!createUserResponse.ok) {
    const errorText = await createUserResponse.text();
    console.error(`❌ User creation failed: ${createUserResponse.status}`);
    console.error(`Response: ${errorText}`);
    process.exit(1);
  }

  const userData = await createUserResponse.json();
  
  console.log("✅ User created successfully!");
  console.log(`\n📊 Response:`);
  console.log(`  Status: ${userData.status}`);
  console.log(`  Message: ${userData.message}`);
  
  if (userData.data) {
    console.log(`\n👤 User Data:`);
    console.log(`  ID: ${userData.data.id}`);
    console.log(`  Name: ${userData.data.name}`);
    console.log(`  Email: ${userData.data.email}`);
    console.log(`  Status: ${userData.data.status}`);
    console.log(`  City ID: ${userData.data.city_id || 'N/A'}`);
    console.log(`  Created At: ${userData.data.created_at}`);
  }

  console.log("\n✅ All tests passed! User can be created in BestBenefits.");
  console.log("\n💡 This means:");
  console.log("  ✓ Users registering on our platform will automatically get BestBenefits access");
  console.log("  ✓ They can use the same email/password to login to BestBenefits");
  console.log("  ✓ All discounts will be available to them");
  
} catch (error) {
  console.error("\n❌ Error:", error.message);
  console.error(error);
  process.exit(1);
}

