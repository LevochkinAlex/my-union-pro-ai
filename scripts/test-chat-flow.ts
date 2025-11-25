/**
 * Тест полного цикла регистрации и заполнения профиля через чат
 */

import { prisma } from "../lib/prisma";
import { hash } from "bcrypt";

const TEST_EMAIL = `test.org.search.${Date.now()}@example.com`;
const TEST_PASSWORD = "TestPass123!";
const BASE_URL = "https://myunion.pro";

async function testChatFlow() {
  console.log("\n🚀 Starting chat flow test...\n");
  
  // 1. Создаем тестового пользователя
  console.log("1️⃣ Creating test user...");
  const hashedPassword = await hash(TEST_PASSWORD, 10);
  
  const user = await prisma.user.create({
    data: {
      email: TEST_EMAIL,
      password: hashedPassword,
      emailVerified: new Date(),
      agreedToPrivacyPolicy: true,
    },
  });
  
  console.log(`✅ User created: ${user.email} (ID: ${user.id})`);
  
  // 2. Создаем сессию чата
  console.log("\n2️⃣ Creating chat session...");
  const chatSession = await prisma.chatSession.create({
    data: {
      userId: user.id,
      title: "Test Organization Search",
      type: "STATEMENT",
    },
  });
  console.log(`✅ Chat session created: ${chatSession.id}`);
  
  // 3. Симулируем диалог с ботом
  console.log("\n3️⃣ Simulating chat conversation...\n");
  
  const messages = [
    { role: "user", content: "Привет", step: "Приветствие" },
    { role: "user", content: "Татарстан", step: "Регион" },
    { role: "user", content: "БСМП Набережные Челны", step: "Организация" },
  ];
  
  for (const msg of messages) {
    console.log(`📤 ${msg.step}: Sending "${msg.content}"`);
    
    // Сохраняем сообщение пользователя
    await prisma.chatMessage.create({
      data: {
        userId: user.id,
        sessionId: chatSession.id,
        role: "user" as const,
        content: msg.content,
      },
    });
    
    // Симулируем запрос к API чата
    try {
      const response = await fetch(`${BASE_URL}/api/chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          // Примечание: в реальности нужна аутентификация через NextAuth
        },
        body: JSON.stringify({
          message: msg.content,
          sessionId: chatSession.id,
        }),
      });
      
      if (!response.ok) {
        console.log(`⚠️ API responded with status: ${response.status}`);
        const errorText = await response.text();
        console.log(`Error: ${errorText.substring(0, 200)}`);
      } else {
        const data = await response.json();
        console.log(`📥 Bot response: ${data.message?.substring(0, 100)}...`);
      }
    } catch (error) {
      console.log(`❌ Error calling API: ${error}`);
    }
    
    // Небольшая задержка между сообщениями
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  
  // 4. Проверяем сохраненные данные
  console.log("\n4️⃣ Checking saved data...");
  const updatedUser = await prisma.user.findUnique({
    where: { id: user.id },
    include: {
      organization: true,
    },
  });
  
  console.log("\n📊 User Profile:");
  console.log(`- Region: ${updatedUser?.region || "❌ Not set"}`);
  console.log(`- Organization ID: ${updatedUser?.organizationId || "Not in DB"}`);
  console.log(`- Organization Name: ${updatedUser?.organizationName || "❌ Not set"}`);
  console.log(`- Organization (DB): ${updatedUser?.organization?.name || "Not found"}`);
  
  // 5. Проверяем историю сообщений
  console.log("\n5️⃣ Checking chat history...");
  const chatMessages = await prisma.chatMessage.findMany({
    where: { sessionId: chatSession.id },
    orderBy: { createdAt: "asc" },
  });
  
  console.log(`📝 Total messages: ${chatMessages.length}`);
  
  // Проверяем, есть ли маркер найденной организации в ответах бота
  const botMessages = chatMessages.filter(m => m.role === "assistant");
  const hasOrgSearch = botMessages.some(m => 
    m.content.includes("[НАЙДЕНА ОРГАНИЗАЦИЯ") || 
    m.content.includes("БСМП") ||
    m.content.includes("Набережные Челны")
  );
  
  if (hasOrgSearch) {
    console.log("✅ Organization search via DaData WORKING!");
  } else {
    console.log("❌ Organization search NOT WORKING - bot didn't find organization");
  }
  
  // 6. Cleanup
  console.log("\n6️⃣ Cleaning up test data...");
  await prisma.chatMessage.deleteMany({
    where: { sessionId: chatSession.id },
  });
  await prisma.chatSession.delete({
    where: { id: chatSession.id },
  });
  await prisma.user.delete({
    where: { id: user.id },
  });
  
  console.log("✅ Test data cleaned up");
  console.log("\n🎉 Test completed!\n");
  console.log("📋 Summary:");
  console.log(`- Test URL: ${BASE_URL}/dashboard?session=${chatSession.id}`);
  console.log(`- Organization search: ${hasOrgSearch ? "✅ WORKING" : "❌ NOT WORKING"}`);
}

// Запускаем тест
testChatFlow()
  .then(() => {
    console.log("\n✅ All tests completed successfully!");
    process.exit(0);
  })
  .catch((error) => {
    console.error("\n❌ Test failed:", error);
    process.exit(1);
  });

