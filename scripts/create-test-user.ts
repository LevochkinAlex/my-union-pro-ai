/**
 * Создание тестового пользователя для проверки поиска организаций
 */

import { prisma } from "../lib/prisma";
import { hash } from "bcrypt";

const TEST_EMAIL = "test.org.dadata@example.com";
const TEST_PASSWORD = "Test123456!";

async function createTestUser() {
  console.log("Creating test user...");
  
  // Проверяем, существует ли уже такой пользователь
  const existing = await prisma.user.findUnique({
    where: { email: TEST_EMAIL },
  });
  
  if (existing) {
    console.log(`❌ User already exists: ${TEST_EMAIL}`);
    console.log(`User ID: ${existing.id}`);
    console.log("\nYou can login with:");
    console.log(`Email: ${TEST_EMAIL}`);
    console.log(`Password: ${TEST_PASSWORD}`);
    return;
  }
  
  // Создаем нового пользователя
  const hashedPassword = await hash(TEST_PASSWORD, 10);
  
  const user = await prisma.user.create({
    data: {
      email: TEST_EMAIL,
      password: hashedPassword,
      emailVerified: new Date(),
      agreedToPrivacyPolicy: true,
    },
  });
  
  console.log(`✅ Test user created successfully!`);
  console.log(`\nUser ID: ${user.id}`);
  console.log(`Email: ${TEST_EMAIL}`);
  console.log(`Password: ${TEST_PASSWORD}`);
  console.log(`\n🔗 Login URL: https://myunion.pro/login`);
  console.log(`\nAfter login, go to dashboard and start chatting to test organization search!`);
}

createTestUser()
  .then(() => {
    console.log("\n✅ Done!");
    process.exit(0);
  })
  .catch((error) => {
    console.error("\n❌ Error:", error);
    process.exit(1);
  });

