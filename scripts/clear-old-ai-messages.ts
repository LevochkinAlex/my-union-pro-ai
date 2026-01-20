/**
 * Скрипт для очистки старых сообщений ИИ и сброса к дефолтному состоянию
 * Запуск: tsx scripts/clear-old-ai-messages.ts
 */
import { PrismaClient } from '@prisma/client';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const prisma = new PrismaClient();

const AI_USER_EMAIL = 'ai-assistant@myunion.pro';
const NEW_WELCOME_MESSAGE = `Здравствуйте! Я - помощник МойСоюз. 👋

Чем могу помочь?`;

async function clearOldAIMessages() {
  console.log(`
╔════════════════════════════════════════════════════════════╗
║          ОЧИСТКА СТАРЫХ СООБЩЕНИЙ ИИ                      ║
╚════════════════════════════════════════════════════════════╝
`);

  try {
    // Находим ИИ пользователя
    const aiUser = await prisma.user.findUnique({
      where: { email: AI_USER_EMAIL },
    });

    if (!aiUser) {
      console.error('❌ ИИ пользователь не найден');
      process.exit(1);
    }

    console.log(`🤖 ИИ пользователь найден: ${aiUser.id}\n`);

    // Находим все чаты с ИИ
    const aiChats = await prisma.chat.findMany({
      where: {
        type: 'PRIVATE',
        participants: {
          some: {
            userId: aiUser.id,
          },
        },
      },
      include: {
        participants: true,
        messages: {
          orderBy: {
            createdAt: 'asc',
          },
        },
      },
    });

    console.log(`📊 Найдено ${aiChats.length} чатов с ИИ\n`);

    let deletedMessages = 0;
    let restoredChats = 0;

    for (const chat of aiChats) {
      const otherParticipant = chat.participants.find(p => p.userId !== aiUser.id);
      if (!otherParticipant) continue;

      const otherUser = await prisma.user.findUnique({
        where: { id: otherParticipant.userId },
        select: { firstName: true, lastName: true },
      });

      const userName = otherUser ? `${otherUser.firstName} ${otherUser.lastName}` : 'Unknown';
      console.log(`📝 Обрабатываем чат с ${userName}...`);

      // Удаляем ВСЕ старые сообщения в этом чате
      if (chat.messages.length > 0) {
        const result = await prisma.chatMessage.deleteMany({
          where: {
            chatId: chat.id,
          },
        });
        
        deletedMessages += result.count;
        console.log(`   🗑️  Удалено ${result.count} старых сообщений`);
      }

      // Создаем новое приветственное сообщение
      await prisma.chatMessage.create({
        data: {
          chatId: chat.id,
          senderId: aiUser.id,
          content: NEW_WELCOME_MESSAGE,
          messageType: 'text',
        },
      });

      console.log(`   ✅ Создано новое приветственное сообщение\n`);
      restoredChats++;
    }

    console.log(`
╔════════════════════════════════════════════════════════════╗
║                    РЕЗУЛЬТАТЫ                              ║
╚════════════════════════════════════════════════════════════╝

🗑️  Удалено старых сообщений: ${deletedMessages}
✅ Восстановлено чатов: ${restoredChats}

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

clearOldAIMessages();
