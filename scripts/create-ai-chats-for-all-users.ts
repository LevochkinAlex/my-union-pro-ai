/**
 * Скрипт для создания дефолтных ИИ чатов для всех пользователей
 * Запуск: tsx scripts/create-ai-chats-for-all-users.ts
 */
import { PrismaClient } from '@prisma/client';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const prisma = new PrismaClient();

const AI_USER_EMAIL = 'ai-assistant@myunion.pro';
const WELCOME_MESSAGE = `Здравствуйте! Я - помощник МойСоюз. 👋

Чем могу помочь?`;

const QUICK_QUESTIONS = [
  'Трудовой спор',
  'Жалоба на работодателя',
  'Консультация по КЗоТ',
  'Помощь с документами'
];

async function ensureAIUser() {
  console.log('🤖 Проверяем наличие ИИ пользователя...');
  
  let aiUser = await prisma.user.findUnique({
    where: { email: AI_USER_EMAIL },
  });

  if (!aiUser) {
    console.log('   Создаем ИИ пользователя...');
    aiUser = await prisma.user.create({
      data: {
        email: AI_USER_EMAIL,
        firstName: 'AI',
        lastName: 'Помощник',
        password: '', // ИИ не имеет пароля
        role: 'EMPLOYEE',
        emailVerified: new Date(),
        isPPOHead: false,
        avatarUrl: '/icon.png',
      },
    });
    console.log('   ✅ ИИ пользователь создан:', aiUser.id);
  } else {
    console.log('   ✅ ИИ пользователь уже существует:', aiUser.id);
  }

  return aiUser;
}

async function createAIChatForUser(userId: string, aiUserId: string) {
  // Проверяем, существует ли уже чат между пользователем и ИИ
  const existingChat = await prisma.chat.findFirst({
    where: {
      type: 'PRIVATE',
      participants: {
        every: {
          OR: [
            { userId: userId },
            { userId: aiUserId },
          ],
        },
      },
    },
    include: {
      participants: true,
    },
  });

  // Проверяем что это именно чат между этими двумя пользователями
  const isCorrectChat = existingChat?.participants.length === 2 &&
    existingChat.participants.some(p => p.userId === userId) &&
    existingChat.participants.some(p => p.userId === aiUserId);

  if (isCorrectChat) {
    console.log(`   ⏭️  Чат уже существует для пользователя ${userId}`);
    return existingChat;
  }

  // Создаем новый чат
  console.log(`   📝 Создаем ИИ чат для пользователя ${userId}`);
  
  const chat = await prisma.chat.create({
    data: {
      name: 'МойСоюз Помощник',
      type: 'PRIVATE',
      participants: {
        create: [
          {
            userId: userId,
            role: 'MEMBER',
          },
          {
            userId: aiUserId,
            role: 'MEMBER',
          },
        ],
      },
    },
  });

  // Создаем приветственное сообщение
  await prisma.chatMessage.create({
    data: {
      chatId: chat.id,
      senderId: aiUserId,
      content: WELCOME_MESSAGE,
      messageType: 'text',
    },
  });

  console.log(`   ✅ ИИ чат создан: ${chat.id}`);
  return chat;
}

async function createAIChatsForAllUsers() {
  console.log(`
╔════════════════════════════════════════════════════════════╗
║     СОЗДАНИЕ ДЕФОЛТНЫХ ИИ ЧАТОВ ДЛЯ ВСЕХ ПОЛЬЗОВАТЕЛЕЙ   ║
╚════════════════════════════════════════════════════════════╝
`);

  try {
    // 1. Убедимся что ИИ пользователь существует
    const aiUser = await ensureAIUser();

    // 2. Получаем всех пользователей (кроме ИИ)
    const users = await prisma.user.findMany({
      where: {
        id: { not: aiUser.id },
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
      },
    });

    console.log(`\n📊 Найдено ${users.length} пользователей\n`);

    let created = 0;
    let skipped = 0;
    let errors = 0;

    // 3. Создаем ИИ чат для каждого пользователя
    for (let i = 0; i < users.length; i++) {
      const user = users[i];
      console.log(`[${i + 1}/${users.length}] ${user.firstName} ${user.lastName} (${user.email})`);
      
      try {
        const chat = await createAIChatForUser(user.id, aiUser.id);
        if (chat) {
          created++;
        } else {
          skipped++;
        }
      } catch (error: any) {
        console.error(`   ❌ Ошибка: ${error.message}`);
        errors++;
      }
    }

    console.log(`
╔════════════════════════════════════════════════════════════╗
║                    РЕЗУЛЬТАТЫ                              ║
╚════════════════════════════════════════════════════════════╝

✅ Создано новых чатов: ${created}
⏭️  Пропущено (уже существуют): ${skipped}
❌ Ошибок: ${errors}
📊 Всего обработано: ${users.length}

✅ Скрипт выполнен успешно!
`);

  } catch (error: any) {
    console.error(`❌ Критическая ошибка: ${error.message}`);
    console.error(error.stack);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

createAIChatsForAllUsers();
