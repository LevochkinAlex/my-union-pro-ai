import { PrismaClient } from '@prisma/client';
import { config } from 'dotenv';
import { resolve } from 'path';

config({ path: resolve(process.cwd(), '.env.local') });

const prisma = new PrismaClient();

// Приветственное сообщение (как в виджете)
const WELCOME_MESSAGE = `Привет! Я ваш AI-помощник 👋

Я помогу вам с вопросами о профсоюзе, скидках, документах и членстве.

Выберите один из популярных вопросов или задайте свой:

📝 Как вступить в профсоюз?
💳 Какие есть скидки?
📋 Где найти мои документы?
✉️ Как создать обращение?
👤 Как заполнить профиль?
❓ Кто наш председатель?`;

/**
 * Скрипт для сброса всех чатов с ИИ:
 * 1. Удаляет все старые сообщения (артефакты)
 * 2. Создает приветственное сообщение с кнопками
 */
async function resetAIChatsToWelcome() {
  try {
    console.log('🚀 Начинаем сброс всех чатов с ИИ...\n');

    // 1. Получаем бота ИИ
    const BOT_EMAIL = 'ai-assistant@myunion.pro';
    const botUser = await prisma.user.findUnique({
      where: { email: BOT_EMAIL },
      select: { id: true },
    });

    if (!botUser) {
      console.log('❌ Бот ИИ не найден');
      process.exit(1);
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
          where: {
            userId: { not: botUser.id },
            leftAt: null,
          },
          select: {
            user: {
              select: {
                id: true,
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

    let resetCount = 0;
    let errorCount = 0;

    // 3. Для каждого чата: удаляем старые сообщения и создаем приветствие
    for (const chat of aiChats) {
      const otherUser = chat.participants[0]?.user;
      const userName = otherUser?.email || otherUser?.firstName || 'Неизвестный пользователь';

      try {
        console.log(`   🔄 Обрабатываем чат для ${userName}...`);

        // 3.1. Удаляем все старые сообщения и связанные данные
        try {
          // Удаляем реакции
          const reactionsCount = await prisma.chatMessageReaction.count({
            where: {
              message: {
                chatId: chat.id,
              },
            },
          });
          if (reactionsCount > 0) {
            await prisma.chatMessageReaction.deleteMany({
              where: {
                message: {
                  chatId: chat.id,
                },
              },
            });
            console.log(`      🗑️  Удалено ${reactionsCount} реакций`);
          }

          // Удаляем отметки прочитано
          const readsCount = await prisma.chatMessageRead.count({
            where: {
              message: {
                chatId: chat.id,
              },
            },
          });
          if (readsCount > 0) {
            await prisma.chatMessageRead.deleteMany({
              where: {
                message: {
                  chatId: chat.id,
                },
              },
            });
            console.log(`      🗑️  Удалено ${readsCount} отметок прочитано`);
          }

          // Удаляем вложения
          const attachmentsCount = await prisma.chatMessageAttachment.count({
            where: {
              message: {
                chatId: chat.id,
              },
            },
          });
          if (attachmentsCount > 0) {
            await prisma.chatMessageAttachment.deleteMany({
              where: {
                message: {
                  chatId: chat.id,
                },
              },
            });
            console.log(`      🗑️  Удалено ${attachmentsCount} вложений`);
          }

          // Удаляем все сообщения
          const messagesCount = await prisma.chatMessage.count({
            where: { chatId: chat.id },
          });
          if (messagesCount > 0) {
            await prisma.chatMessage.deleteMany({
              where: { chatId: chat.id },
            });
            console.log(`      🗑️  Удалено ${messagesCount} сообщений`);
          }
        } catch (deleteError) {
          console.error(`      ⚠️  Ошибка при удалении сообщений:`, deleteError.message);
          // Продолжаем даже если удаление не удалось
        }

        // 3.2. Создаем приветственное сообщение от бота
        try {
          // Проверяем, существует ли модель ChatMessage
          const hasChatMessage = 'chatMessage' in prisma;
          
          if (!hasChatMessage) {
            console.log(`      ⚠️  Модель ChatMessage не существует, пропускаем создание приветствия`);
            errorCount++;
            continue;
          }

          const welcomeMessage = await prisma.chatMessage.create({
            data: {
              chatId: chat.id,
              senderId: botUser.id,
              content: WELCOME_MESSAGE,
              messageType: 'text',
            },
          });

          // 3.3. Обновляем чат с последним сообщением (если поля существуют)
          try {
            await prisma.chat.update({
              where: { id: chat.id },
              data: {
                lastMessageId: welcomeMessage.id,
                lastMessageAt: welcomeMessage.createdAt,
              },
            });
          } catch (updateError) {
            // Поля lastMessageId/lastMessageAt могут не существовать до миграции
            console.log(`      ⚠️  Не удалось обновить lastMessage (возможно, миграция не применена)`);
          }

          console.log(`      ✅ Создано приветственное сообщение`);
          resetCount++;
        } catch (createError) {
          console.error(`      ❌ Ошибка при создании приветствия:`, createError.message);
          errorCount++;
        }
      } catch (error) {
        console.error(`   ❌ Ошибка для ${userName}:`, error.message);
        errorCount++;
      }
    }

    // 4. Статистика
    console.log('\n📊 Итоговая статистика:');
    console.log(`   Всего чатов: ${aiChats.length}`);
    console.log(`   Успешно сброшено: ${resetCount}`);
    console.log(`   Ошибок: ${errorCount}`);

    console.log('\n✅ Сброс чатов с ИИ завершен!');
    console.log('💡 Теперь у всех пользователей есть приветственное сообщение с кнопками.');

  } catch (error) {
    console.error('❌ Ошибка при сбросе чатов:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// Запускаем скрипт
resetAIChatsToWelcome()
  .then(() => {
    console.log('\n✅ Скрипт выполнен успешно');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Ошибка выполнения скрипта:', error);
    process.exit(1);
  });
