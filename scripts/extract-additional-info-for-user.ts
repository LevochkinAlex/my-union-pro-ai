import { PrismaClient } from "@prisma/client";
import { extractProfileDataFromMessages } from "@/lib/profile-extraction";

const prisma = new PrismaClient();

async function extractAdditionalInfo(email: string) {
  try {
    const user = await prisma.user.findUnique({
      where: { email },
      include: {
        chatMessages: {
          orderBy: { createdAt: 'asc' },
          select: { role: true, content: true },
        },
      },
    });

    if (!user) {
      console.log("❌ Пользователь не найден");
      return;
    }

    console.log(`\n📋 Извлечение дополнительной информации для: ${user.firstName} ${user.lastName}`);
    console.log(`Всего сообщений в чате: ${user.chatMessages.length}`);

    // Извлекаем данные из чата
    const extractedData = await extractProfileDataFromMessages(
      user.chatMessages.map(msg => ({
        role: msg.role,
        content: msg.content,
      }))
    );

    console.log("\n📊 Извлеченные данные:");
    console.log(JSON.stringify(extractedData, null, 2));

    // Фильтруем только дополнительные поля
    const additionalFields = {
      occupation: extractedData.occupation,
      aboutMe: extractedData.aboutMe,
      hobbies: extractedData.hobbies,
      maritalStatus: extractedData.maritalStatus,
      spouseInfo: extractedData.spouseInfo,
      hasChildren: extractedData.hasChildren,
      childrenInfo: extractedData.childrenInfo,
      additionalInfo: extractedData.additionalInfo,
    };

    // Убираем пустые значения
    const cleanData = Object.fromEntries(
      Object.entries(additionalFields).filter(
        ([, value]) => value !== undefined && value !== null && value !== ""
      )
    );

    if (Object.keys(cleanData).length > 0) {
      console.log("\n💾 Обновление профиля...");
      console.log("Данные для обновления:", cleanData);

      await prisma.user.update({
        where: { id: user.id },
        data: cleanData,
      });

      console.log("\n✅ Профиль обновлен успешно!");
      
      // Показываем что было обновлено
      console.log("\n📝 Обновленные поля:");
      for (const [key, value] of Object.entries(cleanData)) {
        console.log(`  ${key}: ${value}`);
      }
    } else {
      console.log("\n⚠️  Дополнительная информация не найдена в чате");
      console.log("Возможно, пользователь еще не ответил на вопросы о себе");
    }

  } catch (error) {
    console.error("❌ Ошибка:", error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

extractAdditionalInfo("ceo@yappix.ru");

