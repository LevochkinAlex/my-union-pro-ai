import { PrismaClient } from "@prisma/client";
import { declineNameToGenitive } from "../lib/dadata.js";

const prisma = new PrismaClient();

async function testDeclension(email) {
  try {
    const user = await prisma.user.findUnique({
      where: { email },
    });

    if (!user) {
      console.log("❌ Пользователь не найден");
      return;
    }

    console.log("\n📋 Исходные данные:");
    console.log(`  Фамилия: ${user.lastName}`);
    console.log(`  Имя: ${user.firstName}`);
    console.log(`  Отчество: ${user.middleName}`);

    console.log("\n🔄 Склоняю ФИО в родительный падеж через DaData...");
    
    const genitive = await declineNameToGenitive(
      user.lastName,
      user.firstName,
      user.middleName
    );

    console.log("\n✅ Результат:");
    console.log(`  от ${genitive}`);
    
    console.log("\n📄 Как будет в заявлении:");
    console.log(`  от ${genitive}.`);
    console.log(`  ${user.jobTitle ? `работающего(ей) ${user.jobTitle}` : ''}`);

  } catch (error) {
    console.error("❌ Ошибка:", error);
  } finally {
    await prisma.$disconnect();
  }
}

testDeclension("ceo@yappix.ru");

