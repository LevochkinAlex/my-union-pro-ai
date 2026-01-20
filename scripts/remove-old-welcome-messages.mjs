import { PrismaClient } from '@prisma/client';
import { config } from 'dotenv';
import { resolve } from 'path';

config({ path: resolve(process.cwd(), '.env.local') });

const prisma = new PrismaClient();

/**
 * Скрипт для удаления старых приветственных сообщений из чатов с ИИ
 * Эти сообщения теперь показываются в UI компонента, а не в базе данных
 */
async function removeOldWelcomeMessages() {
  try {
    console.log('🚀 Начинаем удаление старых приветственных сообщений из чатов с ИИ...\n');

    // 1. Получаем бота ИИ
    const BOT_EMAIL = 'ai-assistant@myunion.pro';
    const botUser = await prisma.user.findUnique({
      where: { email: BOT_EMAIL },
      select: { id: true },
    });

    if (!botUser) {
      console.log('❌ Бот ИИ не найден');
      return;
    }

    console.log(`✅ Бот найден: ${botUser.id}\n`);

    // 2. Находим все чаты с ботом
    const aiChats = await prisma.chat.findMany({
      where: {
        type: 'PRIVATE',
        participants: {
          some: {
            userId: botUser.id,
            leftAt: null,
          },
        },
      },
      select: {
        id: true,
        participants: {
          where: { leftAt: null },
          select: {
            userId: true,
            user: {
              select: {
                email: true,
                firstName: true,
                lastName: true,
              },
            },
          },
        },
      },
    });

    console.log(`📋 Найдено чатов с ИИ: ${aiChats.length}\n`);

    let deletedCount = 0;
    let checkedChats = 0;

    // 3. Удаляем приветственные сообщения из каждого чата
    for (const chat of aiChats) {
      try {
        const otherUser = chat.participants.find(p => p.userId !== botUser.id);
        const userName = otherUser?.user?.email || otherUser?.user?.firstName || 'Unknown';

        // Ищем приветственные сообщения от бота
        const welcomeMessages = await prisma.chatMessage.findMany({
          where: {
            chatId: chat.id,
            senderId: botUser.id,
            OR: [
              { content: { contains: 'Здравствуйте' } },
              { content: { contains: 'AI-помощник' } },
              { content: { contains: 'Трудовой спор' } },
              { content: { contains: 'Жалоба' } },
              { content: { contains: 'профсоюза МООП РЗ' } },
              { content: { contains: 'Привет! Я ваш AI-помощник' } },
            ],
          },
          select: { id: true, content: true, createdAt: true },
        });

        if (welcomeMessages.length > 0) {
          // Удаляем приветственные сообщения
          await prisma.chatMessage.deleteMany({
            where: {
              id: { in: welcomeMessages.map(m => m.id) },
            },
          });

          // Обновляем lastMessage в чате (если колонки существуют)
          try {
            const lastMessage = await prisma.chatMessage.findFirst({
              where: { chatId: chat.id },
              orderBy: { createdAt: 'desc' },
              select: { id: true },
            });

            if (lastMessage) {
              await prisma.chat.update({
                where: { id: chat.id },
                data: {
                  lastMessageId: lastMessage.id,
                  lastMessageAt: new Date(),
                },
              });
            } else {
              // Если больше нет сообщений, очищаем lastMessage
              await prisma.chat.update({
                where: { id: chat.id },
                data: {
                  lastMessageId: null,
                  lastMessageAt: null,
                },
              });
            }
          } catch (updateError) {
            if (updateError.code !== 'P2022') {
              // Игнорируем ошибки о несуществующих колонках
              throw updateError;
            }
          }

          deletedCount += welcomeMessages.length;
          console.log(`   ✅ Удалено ${welcomeMessages.length} приветственных сообщений для ${userName}`);
        } else {
          console.log(`   ⏭️  Нет приветственных сообщений для ${userName}`);
        }

        checkedChats++;
      } catch (error) {
        console.error(`   ❌ Ошибка для чата ${chat.id}:`, error.message);
      }
    }

    console.log('\n📊 Итоговая статистика:');
    console.log(`   Проверено чатов: ${checkedChats}`);
    console.log(`   Удалено приветственных сообщений: ${deletedCount}`);

    console.log('\n✅ Удаление старых приветственных сообщений завершено!');
    console.log('💡 Теперь приветствие показывается только в UI компонента, когда нет сообщений.');

  } catch (error) {
    console.error('❌ Ошибка при удалении сообщений:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// Запускаем скрипт
removeOldWelcomeMessages()
  .then(() => {
    console.log('\n✅ Скрипт выполнен успешно');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Ошибка выполнения скрипта:', error);
    process.exit(1);
  });
