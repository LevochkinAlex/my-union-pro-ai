import { PrismaClient } from '@prisma/client';
import { config } from 'dotenv';
import { resolve } from 'path';

config({ path: resolve(process.cwd(), '.env.local') });

const prisma = new PrismaClient();

/**
 * Скрипт для полной очистки истории всех чатов с ИИ помощником
 * Удаляет все сообщения, реакции, вложения и прочитанные статусы
 */
async function clearAllAIChatHistory() {
  try {
    console.log('🧹 Начинаем очистку истории всех чатов с ИИ...\n');

    // 1. Находим всех пользователей-ботов ИИ
    const aiBots = await prisma.user.findMany({
      where: {
        OR: [
          { email: 'ai-assistant@myunion.pro' },
          { email: { contains: 'ai-assistant', mode: 'insensitive' } },
          { firstName: { contains: 'AI', mode: 'insensitive' } },
          { firstName: { contains: 'Помощник', mode: 'insensitive' } },
          { lastName: { contains: 'Помощник', mode: 'insensitive' } },
        ],
      },
      select: { id: true, email: true, firstName: true, lastName: true },
    });

    console.log(`📋 Найдено ботов ИИ: ${aiBots.length}`);
    aiBots.forEach(bot => {
      console.log(`   - ${bot.email || `${bot.firstName} ${bot.lastName}`} (${bot.id})`);
    });

    if (aiBots.length === 0) {
      console.log('⚠️  Боты ИИ не найдены. Пропускаем очистку.');
      return;
    }

    const botIds = aiBots.map(b => b.id);

    // 2. Находим все чаты с ботом ИИ
    const aiChats = await prisma.chat.findMany({
      where: {
        participants: {
          some: {
            userId: { in: botIds },
            leftAt: null,
          },
        },
      },
      select: { id: true, name: true, type: true },
    });

    console.log(`\n📋 Найдено чатов с ИИ: ${aiChats.length}`);
    const chatIds = aiChats.map(c => c.id);

    if (chatIds.length === 0) {
      console.log('⚠️  Чаты с ИИ не найдены. Пропускаем очистку.');
      return;
    }

    // 3. Удаляем все связанные данные сообщений
    console.log('\n🗑️  Удаляем сообщения и связанные данные...');

    let reactionsDeleted = { count: 0 };
    let readsDeleted = { count: 0 };
    let attachmentsDeleted = { count: 0 };
    let messagesDeleted = { count: 0 };

    // Удаляем реакции (если таблица существует)
    try {
      reactionsDeleted = await prisma.chatMessageReaction.deleteMany({
        where: {
          message: {
            chatId: { in: chatIds },
          },
        },
      });
      console.log(`   ✅ Удалено реакций: ${reactionsDeleted.count}`);
    } catch (error) {
      if (error.code === 'P2021') {
        console.log(`   ⚠️  Таблица ChatMessageReaction не существует, пропускаем`);
      } else {
        throw error;
      }
    }

    // Удаляем прочитанные статусы (если таблица существует)
    try {
      readsDeleted = await prisma.chatMessageRead.deleteMany({
        where: {
          message: {
            chatId: { in: chatIds },
          },
        },
      });
      console.log(`   ✅ Удалено прочитанных статусов: ${readsDeleted.count}`);
    } catch (error) {
      if (error.code === 'P2021') {
        console.log(`   ⚠️  Таблица ChatMessageRead не существует, пропускаем`);
      } else {
        throw error;
      }
    }

    // Удаляем вложения (если таблица существует)
    try {
      attachmentsDeleted = await prisma.chatMessageAttachment.deleteMany({
        where: {
          message: {
            chatId: { in: chatIds },
          },
        },
      });
      console.log(`   ✅ Удалено вложений: ${attachmentsDeleted.count}`);
    } catch (error) {
      if (error.code === 'P2021') {
        console.log(`   ⚠️  Таблица ChatMessageAttachment не существует, пропускаем`);
      } else {
        throw error;
      }
    }

    // Удаляем сообщения (если таблица существует)
    try {
      messagesDeleted = await prisma.chatMessage.deleteMany({
        where: {
          chatId: { in: chatIds },
        },
      });
      console.log(`   ✅ Удалено сообщений: ${messagesDeleted.count}`);
    } catch (error) {
      if (error.code === 'P2021') {
        console.log(`   ⚠️  Таблица ChatMessage не существует, пропускаем`);
        console.log(`   💡 Возможно, сообщения хранятся в Matrix. Очистка завершена.`);
      } else {
        throw error;
      }
    }

    // 4. Обновляем чаты - очищаем lastMessage и lastMessageAt (если колонки существуют)
    let chatsUpdated = { count: 0 };
    try {
      chatsUpdated = await prisma.chat.updateMany({
        where: {
          id: { in: chatIds },
        },
        data: {
          lastMessageId: null,
          lastMessageAt: null,
        },
      });
      console.log(`   ✅ Обновлено чатов: ${chatsUpdated.count}`);
    } catch (error) {
      if (error.code === 'P2022') {
        console.log(`   ⚠️  Колонки lastMessageId/lastMessageAt не существуют, пропускаем обновление`);
      } else {
        throw error;
      }
    }

    // 5. Статистика
    console.log('\n📊 Итоговая статистика:');
    console.log(`   Ботов ИИ: ${aiBots.length}`);
    console.log(`   Чатов с ИИ: ${aiChats.length}`);
    console.log(`   Удалено сообщений: ${messagesDeleted.count}`);
    console.log(`   Удалено реакций: ${reactionsDeleted.count}`);
    console.log(`   Удалено вложений: ${attachmentsDeleted.count}`);
    console.log(`   Удалено прочитанных статусов: ${readsDeleted.count}`);
    console.log(`   Обновлено чатов: ${chatsUpdated.count}`);

    console.log('\n✅ Очистка истории чатов с ИИ завершена!');
    console.log('💡 Теперь при открытии чата с ИИ будет показано приветственное сообщение с популярными вопросами.');

  } catch (error) {
    console.error('❌ Ошибка при очистке истории:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// Запускаем скрипт
clearAllAIChatHistory()
  .then(() => {
    console.log('\n✅ Скрипт выполнен успешно');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Ошибка выполнения скрипта:', error);
    process.exit(1);
  });
