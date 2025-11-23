import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function extractFromSession(email, sessionId) {
  try {
    const user = await prisma.user.findUnique({
      where: { email },
    });

    if (!user) {
      console.log("❌ Пользователь не найден");
      return;
    }

    console.log(`\n📋 Извлечение данных из сессии: ${sessionId}`);

    // Получаем сообщения из конкретной сессии
    const messages = await prisma.chatMessage.findMany({
      where: {
        userId: user.id,
        sessionId: sessionId,
      },
      orderBy: { createdAt: 'asc' },
      select: { role: true, content: true, createdAt: true },
    });

    console.log(`\nВсего сообщений в сессии: ${messages.length}\n`);

    // Показываем последние 20 сообщений для анализа
    console.log("📝 Последние сообщения (для проверки):\n");
    messages.slice(-20).forEach((msg, index) => {
      const preview = msg.content.substring(0, 150).replace(/\n/g, ' ');
      console.log(`${index + 1}. [${msg.role}] ${preview}${msg.content.length > 150 ? '...' : ''}`);
    });

    // Ищем паттерны дополнительной информации в сообщениях пользователя
    const userMessages = messages.filter(m => m.role === 'user').map(m => m.content);
    const allUserText = userMessages.join('\n\n');

    console.log("\n\n🔍 Анализ ответов пользователя...\n");

    const extractedData = {};

    // Occupation (род занятий)
    const occupationKeywords = ['занимаюсь', 'работаю', 'профессия', 'должность'];
    for (const msg of userMessages) {
      if (occupationKeywords.some(kw => msg.toLowerCase().includes(kw))) {
        // Ищем содержательные ответы
        if (msg.length > 10 && msg.length < 200 && !msg.includes('загрузил файл')) {
          console.log(`✅ Occupation найдено: "${msg}"`);
          extractedData.occupation = msg.trim();
          break;
        }
      }
    }

    // AboutMe (о себе)
    const aboutMeKeywords = ['о себе', 'вдохновляет', 'характер', 'люблю', 'ценю'];
    for (const msg of userMessages) {
      if (aboutMeKeywords.some(kw => msg.toLowerCase().includes(kw)) || msg.length > 100) {
        if (msg.length > 20 && msg.length < 500 && !msg.includes('загрузил файл')) {
          console.log(`✅ AboutMe найдено: "${msg.substring(0, 100)}..."`);
          extractedData.aboutMe = msg.trim();
          break;
        }
      }
    }

    // Hobbies (хобби)
    const hobbiesKeywords = ['хобби', 'увлечения', 'увлекаюсь', 'интересуюсь'];
    for (const msg of userMessages) {
      if (hobbiesKeywords.some(kw => msg.toLowerCase().includes(kw))) {
        if (msg.length > 10 && msg.length < 300 && !msg.includes('загрузил файл')) {
          console.log(`✅ Hobbies найдено: "${msg}"`);
          extractedData.hobbies = msg.trim();
          break;
        }
      }
    }

    // Marital Status
    if (allUserText.toLowerCase().includes('женат') || allUserText.toLowerCase().includes('замужем') || allUserText.toLowerCase().includes('в браке')) {
      extractedData.maritalStatus = 'MARRIED';
      console.log(`✅ Marital Status: MARRIED`);
    } else if (allUserText.toLowerCase().includes('холост') || allUserText.toLowerCase().includes('не замужем')) {
      extractedData.maritalStatus = 'SINGLE';
      console.log(`✅ Marital Status: SINGLE`);
    }

    // Spouse Info
    const spouseKeywords = ['супруг', 'супруга', 'муж', 'жена'];
    for (const msg of userMessages) {
      if (spouseKeywords.some(kw => msg.toLowerCase().includes(kw))) {
        if (msg.length > 10 && msg.length < 300) {
          console.log(`✅ Spouse Info найдено: "${msg}"`);
          extractedData.spouseInfo = msg.trim();
          break;
        }
      }
    }

    // Children
    if (allUserText.toLowerCase().includes('есть дети') || allUserText.toLowerCase().includes('у меня есть')) {
      extractedData.hasChildren = true;
      
      const childrenKeywords = ['дети', 'ребенок', 'сын', 'дочь', 'детей'];
      for (const msg of userMessages) {
        if (childrenKeywords.some(kw => msg.toLowerCase().includes(kw))) {
          if (msg.length > 10 && msg.length < 300) {
            console.log(`✅ Children Info найдено: "${msg}"`);
            extractedData.childrenInfo = msg.trim();
            break;
          }
        }
      }
    } else if (allUserText.toLowerCase().includes('нет детей') || allUserText.toLowerCase().includes('детей нет')) {
      extractedData.hasChildren = false;
    }

    // Additional Info
    const additionalKeywords = ['дополнительно', 'также', 'еще', 'кроме того'];
    for (const msg of userMessages) {
      if (additionalKeywords.some(kw => msg.toLowerCase().includes(kw))) {
        if (msg.length > 20 && msg.length < 500) {
          console.log(`✅ Additional Info найдено: "${msg.substring(0, 100)}..."`);
          extractedData.additionalInfo = msg.trim();
          break;
        }
      }
    }

    console.log("\n\n📊 Извлеченные данные:");
    console.log(JSON.stringify(extractedData, null, 2));

    if (Object.keys(extractedData).length > 0) {
      console.log("\n💾 Обновление профиля...");
      
      await prisma.user.update({
        where: { id: user.id },
        data: extractedData,
      });

      console.log("\n✅ Профиль успешно обновлен!");
      console.log("\n📝 Обновленные поля:");
      for (const [key, value] of Object.entries(extractedData)) {
        console.log(`  ${key}: ${value}`);
      }
    } else {
      console.log("\n⚠️  Дополнительная информация не найдена в этой сессии");
    }

  } catch (error) {
    console.error("❌ Ошибка:", error);
  } finally {
    await prisma.$disconnect();
  }
}

extractFromSession("ceo@yappix.ru", "cmibt7rto001b1yno2m86gh2x");

