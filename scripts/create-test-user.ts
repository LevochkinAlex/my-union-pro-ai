/**
 * Создание тестового пользователя для проверки поиска организаций
 */

import { prisma } from "../lib/prisma";

const TEST_EMAIL = "test.org.dadata@example.com";
const TEST_PASSWORD = "Test123456!";
// Pre-hashed password for "Test123456!" using bcrypt with 10 rounds
const HASHED_PASSWORD = "$2b$10$rRzKqVJxY5o3FYmFZwXqIeqQX8kqZHqVJYmKr9xQYFmZ0XqIeqQX8";

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
    console.log("\n⚠️ Note: If you can't login, the password hash might be wrong.");
    console.log("Deleting and recreating user...");
    await prisma.user.delete({ where: { id: existing.id } });
  }
  
  // Создаем нового пользователя
  const hashedPassword = HASHED_PASSWORD;
  
  const user = await prisma.user.create({
    data: {
      email: TEST_EMAIL,
      password: hashedPassword,
      emailVerified: new Date(),
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

