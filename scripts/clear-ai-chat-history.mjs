import { PrismaClient } from '@prisma/client';
import { config } from 'dotenv';
import { resolve } from 'path';

// Load environment variables
config({ path: resolve(process.cwd(), '.env.local') });

const prisma = new PrismaClient();

async function clearAIChatHistory() {
  try {
    console.log('🧹 Начинаем очистку истории чатов с ИИ...\n');

    // Находим бота
    const botUser = await prisma.user.findFirst({
      where: {
        OR: [
          { matrixUserId: { contains: 'myunion_bot' } },
          { matrixUserId: { contains: 'ai_assistant' } },
          { matrixUserId: { contains: 'assistant' } },
        ],
      },
      select: { id: true, firstName: true, lastName: true },
    });

    if (!botUser) {
      console.log('❌ Бот не найден в БД');
      return;
    }

    console.log(`✅ Найден бот: ${botUser.firstName || ''} ${botUser.lastName || ''} (${botUser.id})\n`);

    // Находим все чаты с ботом
    const aiChats = await prisma.chat.findMany({
      where: {
        participants: {
          some: {
            userId: botUser.id,
            leftAt: null,
          },
        },
      },
      select: { id: true, name: true },
    });

    console.log(`📋 Найдено чатов с ИИ: ${aiChats.length}\n`);

    if (aiChats.length === 0) {
      console.log('✅ Нет чатов с ИИ для очистки');
      return;
    }

    const chatIds = aiChats.map(c => c.id);

    // Удаляем все сообщения из этих чатов
    console.log('🗑️  Удаляем все сообщения...');
    
    // Сначала удаляем связанные данные
    const messages = await prisma.chatMessage.findMany({
      where: { chatId: { in: chatIds } },
      select: { id: true },
    });

    const messageIds = messages.map(m => m.id);

    if (messageIds.length > 0) {
      // Удаляем реакции
      await prisma.chatMessageReaction.deleteMany({
        where: { messageId: { in: messageIds } },
      });
      console.log(`   ✅ Удалены реакции из ${messageIds.length} сообщений`);

      // Удаляем прочитанные статусы
      await prisma.chatMessageRead.deleteMany({
        where: { messageId: { in: messageIds } },
      });
      console.log(`   ✅ Удалены статусы прочитано из ${messageIds.length} сообщений`);

      // Удаляем вложения
      await prisma.chatMessageAttachment.deleteMany({
        where: { messageId: { in: messageIds } },
      });
      console.log(`   ✅ Удалены вложения из ${messageIds.length} сообщений`);

      // Удаляем сообщения (каскадно удалятся ответы в тредах)
      await prisma.chatMessage.deleteMany({
        where: { chatId: { in: chatIds } },
      });
      console.log(`   ✅ Удалено ${messageIds.length} сообщений`);
    }

    // Обновляем чаты
    await prisma.chat.updateMany({
      where: { id: { in: chatIds } },
      data: {
        lastMessageId: null,
        lastMessageAt: null,
      },
    });
    console.log(`   ✅ Обновлено ${chatIds.length} чатов\n`);

    console.log('✅ История чатов с ИИ полностью очищена!');
    console.log(`   Удалено сообщений: ${messageIds.length}`);
    console.log(`   Обработано чатов: ${chatIds.length}`);

  } catch (error) {
    console.error('❌ Ошибка при очистке:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

clearAIChatHistory()
  .then(() => {
    console.log('\n✅ Очистка завершена!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Критическая ошибка:', error);
    process.exit(1);
  });
