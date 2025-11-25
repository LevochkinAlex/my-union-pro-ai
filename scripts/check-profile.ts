/**
 * Проверка текущего состояния профиля пользователя
 */

import { prisma } from "../lib/prisma";

const TEST_EMAIL = "ceo@yappix.ru";

async function checkProfile() {
  const user = await prisma.user.findUnique({
    where: { email: TEST_EMAIL },
    include: {
      organization: true,
      children: true,
    },
  });

  if (!user) {
    console.log("❌ User not found");
    return;
  }

  console.log("\n📊 ПРОФИЛЬ ПОЛЬЗОВАТЕЛЯ:");
  console.log("═".repeat(60));
  console.log(`User ID: ${user.id}`);
  console.log(`Email: ${user.email}`);
  console.log("\n🔹 ОСНОВНЫЕ ДАННЫЕ:");
  console.log(`  Регион: ${user.region || "❌ не заполнено"}`);
  console.log(`  Город: ${user.city || "❌ не заполнено"}`);
  console.log(`  Организация ID: ${user.organizationId || "не в БД"}`);
  console.log(`  Организация Name: ${user.organizationName || "❌ не заполнено"}`);
  console.log(`  Организация (DB): ${user.organization?.name || "не найдена"}`);
  
  console.log("\n🔹 ФИО:");
  console.log(`  Фамилия: ${user.lastName || "❌ не заполнено"}`);
  console.log(`  Имя: ${user.firstName || "❌ не заполнено"}`);
  console.log(`  Отчество: ${user.middleName || "❌ не заполнено"}`);
  
  console.log("\n🔹 КОНТАКТЫ:");
  console.log(`  Дата рождения: ${user.dateOfBirth || "❌ не заполнено"}`);
  console.log(`  Телефон: ${user.phone || "❌ не заполнено"}`);
  console.log(`  Адрес: ${user.address || "❌ не заполнено"}`);
  
  console.log("\n🔹 РАБОТА:");
  console.log(`  Должность: ${user.jobTitle || "❌ не заполнено"}`);
  console.log(`  Профессия: ${user.profession || "❌ не заполнено"}`);
  console.log(`  Образование: ${user.education || "❌ не заполнено"}`);
  
  console.log("\n🔹 ДОПОЛНИТЕЛЬНО:");
  console.log(`  Занятость: ${user.employmentStatus || "❌ не заполнено"}`);
  console.log(`  Семейное положение: ${user.maritalStatus || "❌ не заполнено"}`);
  console.log(`  Дети: ${user.children?.length || 0} записей`);
  
  if (user.children && user.children.length > 0) {
    console.log("\n👶 ДЕТИ:");
    user.children.forEach((child, idx) => {
      console.log(`  ${idx + 1}. ${child.name}, ${child.birthDate}, пол: ${child.gender}`);
    });
  }
  
  console.log("\n" + "═".repeat(60));
  
  // Проверяем полноту профиля
  const isComplete = !!(
    user.firstName &&
    user.lastName &&
    user.dateOfBirth &&
    user.phone &&
    user.address &&
    user.jobTitle &&
    user.profession &&
    user.education &&
    (user.organizationId || user.organizationName)
  );
  
  console.log(`\n✅ Профиль заполнен: ${isComplete ? "ДА" : "НЕТ"}`);
}

checkProfile()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Error:", error);
    process.exit(1);
  });

