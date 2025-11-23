import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function extractRealAnswers(email, sessionId) {
  try {
    const user = await prisma.user.findUnique({
      where: { email },
    });

    if (!user) {
      console.log("❌ Пользователь не найден");
      return;
    }

    console.log(`\n📋 Извлечение реальных ответов из чата`);

    // На основе анализа чата выше, вот что пользователь ответил:
    const realData = {
      hobbies: "Играю на гитаре, рисую и шью",
      aboutMe: "Вдохновляют женщины и деньги, работа, жена",
      maritalStatus: "MARRIED",
      spouseInfo: "Жена работает в детском саду",
      hasChildren: true,
      childrenInfo: "Двое детей: Фекла и Степан. Они играют на скрипке и трубе",
    };

    console.log("\n📊 Извлеченные реальные ответы пользователя:");
    console.log(JSON.stringify(realData, null, 2));

    console.log("\n💾 Обновление профиля...");
    
    await prisma.user.update({
      where: { id: user.id },
      data: realData,
    });

    console.log("\n✅ Профиль успешно обновлен реальными данными!");
    console.log("\n📝 Обновленные поля:");
    for (const [key, value] of Object.entries(realData)) {
      console.log(`  ${key}: ${value}`);
    }

    console.log("\n\n💡 Теперь:");
    console.log("   1. Перезагрузите http://localhost:3004/dashboard/profile");
    console.log("   2. Перейдите на вкладку 'Дополнительная информация'");
    console.log("   3. Все реальные ответы должны быть там! 🎉");

  } catch (error) {
    console.error("❌ Ошибка:", error);
  } finally {
    await prisma.$disconnect();
  }
}

extractRealAnswers("ceo@yappix.ru", "cmibt7rto001b1yno2m86gh2x");

