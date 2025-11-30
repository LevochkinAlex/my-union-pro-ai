import { prisma } from "../lib/prisma";

async function resetAllUsersData() {
  try {
    console.log("\n🧹 Начинаем очистку всех данных пользователей...\n");

    // Получаем всех пользователей
    const users = await prisma.user.findMany({
      select: { id: true, email: true, phone: true },
    });

    console.log(`📊 Найдено пользователей: ${users.length}\n`);

    let deletedCount = {
      chatSessions: 0,
      chatMessages: 0,
      documents: 0,
      phoneHistory: 0,
      smsPins: 0,
      loginTokens: 0,
      emailPins: 0,
    };

    // Удаляем все сессии чата
    console.log("🗑️  Удаляем все сессии чата...");
    const deletedSessions = await prisma.chatSession.deleteMany({});
    deletedCount.chatSessions = deletedSessions.count;
    console.log(`   ✅ Удалено сессий: ${deletedCount.chatSessions}`);

    // Удаляем все сообщения чата
    console.log("🗑️  Удаляем все сообщения чата...");
    const deletedMessages = await prisma.chatMessage.deleteMany({});
    deletedCount.chatMessages = deletedMessages.count;
    console.log(`   ✅ Удалено сообщений: ${deletedCount.chatMessages}`);

    // Удаляем все документы
    console.log("🗑️  Удаляем все документы...");
    const deletedDocuments = await prisma.document.deleteMany({});
    deletedCount.documents = deletedDocuments.count;
    console.log(`   ✅ Удалено документов: ${deletedCount.documents}`);

    // Удаляем историю телефонов
    console.log("🗑️  Удаляем историю телефонов...");
    const deletedPhoneHistory = await prisma.phoneHistory.deleteMany({});
    deletedCount.phoneHistory = deletedPhoneHistory.count;
    console.log(`   ✅ Удалено записей истории телефонов: ${deletedCount.phoneHistory}`);

    // Удаляем SMS PIN коды
    console.log("🗑️  Удаляем SMS PIN коды...");
    const deletedSmsPins = await prisma.sMSPinCode.deleteMany({});
    deletedCount.smsPins = deletedSmsPins.count;
    console.log(`   ✅ Удалено SMS PIN кодов: ${deletedCount.smsPins}`);

    // Удаляем токены входа
    console.log("🗑️  Удаляем токены входа...");
    const deletedLoginTokens = await prisma.loginToken.deleteMany({});
    deletedCount.loginTokens = deletedLoginTokens.count;
    console.log(`   ✅ Удалено токенов входа: ${deletedCount.loginTokens}`);

    // Удаляем email PIN коды
    console.log("🗑️  Удаляем email PIN коды...");
    const deletedEmailPins = await prisma.emailPinCode.deleteMany({});
    deletedCount.emailPins = deletedEmailPins.count;
    console.log(`   ✅ Удалено email PIN кодов: ${deletedCount.emailPins}`);

    // Сбрасываем поля пользователей, связанные с заполненностью профиля
    console.log("\n🔄 Сбрасываем поля пользователей...");
    
    // Обновляем каждого пользователя отдельно, чтобы использовать disconnect для organizationId
    for (const user of users) {
      await prisma.user.update({
        where: { id: user.id },
        data: {
          // Профиль
          firstName: null,
          lastName: null,
          middleName: null,
          dateOfBirth: null,
          address: null,
          jobTitle: null,
          profession: null,
          education: null,
          organization: { disconnect: true },
          organizationName: null,
          preferredDiscountCity: null,
          
          // Дополнительная информация
          employmentStatus: null,
          maritalStatus: null,
          hasChildren: null,
          childrenBirthDates: null,
          hobbies: null,
          aboutMe: null,
          additionalInfo: null,
          spouseInfo: null,
          
          // Статусы
          profileChangedAfterDocuments: false,
          profileLastModified: null,
          
          // Email (оставляем, но сбрасываем верификацию)
          emailVerified: null,
          verificationToken: null,
          verificationExpires: null,
        },
      });
    }
    
    console.log(`   ✅ Обновлено пользователей: ${users.length}`);

    console.log("\n📊 Итоговая статистика:");
    console.log(`   Сессии чата: ${deletedCount.chatSessions}`);
    console.log(`   Сообщения: ${deletedCount.chatMessages}`);
    console.log(`   Документы: ${deletedCount.documents}`);
    console.log(`   История телефонов: ${deletedCount.phoneHistory}`);
    console.log(`   SMS PIN коды: ${deletedCount.smsPins}`);
    console.log(`   Токены входа: ${deletedCount.loginTokens}`);
    console.log(`   Email PIN коды: ${deletedCount.emailPins}`);
    console.log(`   Пользователи обновлены: ${users.length}`);

    console.log("\n✅ Готово! Все данные очищены, пользователи готовы к тестированию.\n");
  } catch (error) {
    console.error("❌ Ошибка:", error);
    if (error instanceof Error) {
      console.error("   Сообщение:", error.message);
      console.error("   Stack:", error.stack);
    }
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

resetAllUsersData();

