import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function fillTestInfo(email) {
  try {
    const user = await prisma.user.findUnique({
      where: { email },
    });

    if (!user) {
      console.log("❌ Пользователь не найден");
      return;
    }

    console.log(`\n📝 Заполнение тестовых данных для: ${user.firstName} ${user.lastName}`);

    const testData = {
      occupation: "Заместитель председателя профсоюза",
      aboutMe: "Ответственный и целеустремленный человек. Люблю помогать людям решать их проблемы. В работе ценю справедливость и прозрачность.",
      hobbies: "Чтение, спорт (бег по утрам), игра на гитаре",
      maritalStatus: "MARRIED",
      spouseInfo: "Елена, преподаватель математики в школе",
      hasChildren: true,
      childrenInfo: "Двое детей: Максим (15 лет) и Анна (12 лет)",
      additionalInfo: "Активно участвую в жизни профсоюза, организую мероприятия для сотрудников",
    };

    await prisma.user.update({
      where: { id: user.id },
      data: testData,
    });

    console.log("\n✅ Тестовые данные добавлены успешно!");
    console.log("\n📋 Добавленная информация:");
    for (const [key, value] of Object.entries(testData)) {
      console.log(`  ${key}: ${value}`);
    }

    console.log("\n💡 Теперь зайдите в Профиль → Дополнительная информация");
    console.log("   Все поля должны быть заполнены!");

  } catch (error) {
    console.error("❌ Ошибка:", error);
  } finally {
    await prisma.$disconnect();
  }
}

fillTestInfo("ceo@yappix.ru");

