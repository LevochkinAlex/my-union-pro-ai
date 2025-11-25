/**
 * Проверка новой тестовой сессии
 */

import { prisma } from "../lib/prisma";
import { extractProfileDataFromMessages, isProfileComplete } from "../lib/profile-extraction";

const TEST_EMAIL = "ceo@yappix.ru";
const NEW_SESSION_ID = "cmienfsji000wpt5vs8kly5z6";

async function checkNewSession() {
  console.log("\n📊 АНАЛИЗ НОВОЙ ТЕСТОВОЙ СЕССИИ\n");
  console.log("═".repeat(70));
  
  const user = await prisma.user.findUnique({
    where: { email: TEST_EMAIL },
    include: { organization: true },
  });

  if (!user) {
    console.log("❌ Пользователь не найден");
    return;
  }

  console.log(`👤 User: ${user.email} (ID: ${user.id})\n`);

  // Получаем сообщения
  const messages = await prisma.chatMessage.findMany({
    where: { sessionId: NEW_SESSION_ID },
    orderBy: { createdAt: "asc" },
  });

  console.log(`💬 Всего сообщений: ${messages.length}\n`);

  // Последние 15 сообщений
  console.log("📝 ПОСЛЕДНИЕ СООБЩЕНИЯ:");
  console.log("─".repeat(70));
  messages.slice(-15).forEach((msg, idx) => {
    const role = msg.role === "user" ? "👤" : "🤖";
    const content = msg.content.substring(0, 60).replace(/\n/g, " ");
    console.log(`${messages.length - 15 + idx + 1}. ${role} ${content}...`);
  });

  // Извлекаем данные
  console.log(`\n\n🔍 ИЗВЛЕЧЕНИЕ ДАННЫХ ИЗ ИСТОРИИ...\n`);
  const extracted = await extractProfileDataFromMessages(
    messages.map(m => ({ role: m.role, content: m.content }))
  );

  console.log("📤 ИЗВЛЕЧЕННЫЕ ДАННЫЕ:");
  console.log("─".repeat(70));
  console.log(`  region: ${extracted.region || "❌"}`);
  console.log(`  organizationName: ${extracted.organizationName || "❌"}`);
  console.log(`  firstName: ${extracted.firstName || "❌"}`);
  console.log(`  lastName: ${extracted.lastName || "❌"}`);
  console.log(`  middleName: ${extracted.middleName || "❌"}`);
  console.log(`  dateOfBirth: ${extracted.dateOfBirth || "❌"}`);
  console.log(`  address: ${extracted.address || "❌"}`);
  console.log(`  phone: ${extracted.phone || "❌"}`);
  console.log(`  jobTitle: ${extracted.jobTitle || "❌"}`);
  console.log(`  profession: ${extracted.profession || "❌"}`);
  console.log(`  education: ${extracted.education || "❌"}`);

  // Проверяем БД
  console.log(`\n\n💾 ДАННЫЕ В БД:`);
  console.log("─".repeat(70));
  console.log(`  region: ${user.region || "❌"}`);
  console.log(`  organizationName: ${user.organizationName || "❌"}`);
  console.log(`  firstName: ${user.firstName || "❌"}`);
  console.log(`  lastName: ${user.lastName || "❌"}`);
  console.log(`  middleName: ${user.middleName || "❌"}`);
  console.log(`  dateOfBirth: ${user.dateOfBirth || "❌"}`);
  console.log(`  address: ${user.address || "❌"}`);
  console.log(`  phone: ${user.phone || "❌"}`);
  console.log(`  jobTitle: ${user.jobTitle || "❌"}`);
  console.log(`  profession: ${user.profession || "❌"}`);
  console.log(`  education: ${user.education || "❌"}`);

  const complete = isProfileComplete(user);
  console.log(`\n✅ Профиль полный: ${complete ? "ДА" : "НЕТ"}`);

  console.log("\n" + "═".repeat(70));
}

checkNewSession()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Error:", error);
    process.exit(1);
  });

