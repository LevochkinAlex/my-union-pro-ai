import { PrismaClient } from '@prisma/client';
import { config } from 'dotenv';
import { resolve } from 'path';

config({ path: resolve(process.cwd(), '.env.local') });

const prisma = new PrismaClient();

/**
 * Создает или находит приватный чат между двумя пользователями
 */
async function getOrCreatePrivateChat(userId1, userId2) {
  // Ищем существующий чат используя raw SQL, чтобы избежать проблем с несуществующими колонками
  let existingChat = null;
  try {
    // Используем raw SQL для поиска чата
    const result = await prisma.$queryRaw`
      SELECT c.id, c.type, c.name, c."createdAt"
      FROM "Chat" c
      WHERE c.type = 'PRIVATE'
        AND EXISTS (
          SELECT 1 FROM "ChatParticipant" cp1
          WHERE cp1."chatId" = c.id
            AND cp1."userId" = ${userId1}
            AND cp1."leftAt" IS NULL
        )
        AND EXISTS (
          SELECT 1 FROM "ChatParticipant" cp2
          WHERE cp2."chatId" = c.id
            AND cp2."userId" = ${userId2}
            AND cp2."leftAt" IS NULL
        )
      LIMIT 1
    `;
    
    if (result && result.length > 0) {
      existingChat = result[0];
    }
  } catch (error) {
    // Если raw SQL не работает, пробуем через Prisma (может упасть на lastMessageId)
    try {
      existingChat = await prisma.chat.findFirst({
        where: {
          type: 'PRIVATE',
          AND: [
            {
              participants: {
                some: { userId: userId1, leftAt: null },
              },
            },
            {
              participants: {
                some: { userId: userId2, leftAt: null },
              },
            },
          ],
        },
        select: {
          id: true,
          type: true,
          name: true,
          createdAt: true,
        },
      });
    } catch (prismaError) {
      // Если и это не работает, считаем что чата нет и создадим новый
      if (prismaError.code === 'P2022') {
        // Колонка не существует - это нормально, создадим новый чат
      } else {
        throw prismaError;
      }
    }
  }

  if (existingChat) {
    return { chat: existingChat, isNew: false };
  }

  // Создаем новый чат
  const newChat = await prisma.chat.create({
    data: {
      type: 'PRIVATE',
      name: null,
      participants: {
        create: [
          {
            userId: userId1,
            role: 'member',
            joinedAt: new Date(),
            invitedById: userId1,
          },
          {
            userId: userId2,
            role: 'member',
            joinedAt: new Date(),
            invitedById: userId1,
          },
        ],
      },
    },
    select: {
      id: true,
      type: true,
      name: true,
      participants: {
        where: { leftAt: null },
        select: {
          id: true,
          userId: true,
          role: true,
        },
      },
    },
  });

  return { chat: newChat, isNew: true };
}

/**
 * Создает или получает базу знаний пользователя
 */
async function getOrCreateUserKnowledgeBase(userId) {
  let userKB = await prisma.userKnowledgeBase.findUnique({
    where: { userId },
  });

  if (!userKB) {
    userKB = await prisma.userKnowledgeBase.create({
      data: { userId },
    });
  }

  return userKB;
}

/**
 * Сохраняет профиль пользователя в базу знаний
 */
async function saveUserProfileToKnowledgeBase(user) {
  try {
    const userKB = await getOrCreateUserKnowledgeBase(user.id);

    // Формируем текстовое представление профиля
    const profileData = [];

    if (user.firstName || user.lastName || user.middleName) {
      const fullName = [user.lastName, user.firstName, user.middleName]
        .filter(Boolean)
        .join(' ');
      profileData.push(`ФИО: ${fullName}`);
    }

    if (user.email) profileData.push(`Email: ${user.email}`);
    if (user.phone) profileData.push(`Телефон: ${user.phone}`);
    if (user.dateOfBirth) {
      profileData.push(`Дата рождения: ${new Date(user.dateOfBirth).toLocaleDateString('ru-RU')}`);
    }
    if (user.address) profileData.push(`Адрес: ${user.address}`);
    if (user.jobTitle) profileData.push(`Должность: ${user.jobTitle}`);
    if (user.profession) profileData.push(`Профессия: ${user.profession}`);
    if (user.education) profileData.push(`Образование: ${user.education}`);
    if (user.organization) {
      profileData.push(`Организация: ${user.organization.name}`);
      if (user.organization.inn) {
        profileData.push(`ИНН организации: ${user.organization.inn}`);
      }
    }
    if (user.employmentStatus) profileData.push(`Статус занятости: ${user.employmentStatus}`);
    if (user.hobbies) profileData.push(`Хобби: ${user.hobbies}`);
    if (user.aboutMe) profileData.push(`О себе: ${user.aboutMe}`);

    const profileText = profileData.join('\n');

    if (!profileText.trim()) {
      return; // Нет данных для сохранения
    }

    // Проверяем, есть ли уже chunk с типом PROFILE_DATA
    const existingChunk = await prisma.userKnowledgeChunk.findFirst({
      where: {
        userKnowledgeBaseId: userKB.id,
        type: 'PROFILE_DATA',
      },
    });

    if (existingChunk) {
      // Обновляем существующий chunk
      await prisma.userKnowledgeChunk.update({
        where: { id: existingChunk.id },
        data: {
          content: profileText,
          tokens: profileText.length,
        },
      });
    } else {
      // Создаем новый chunk
      await prisma.userKnowledgeChunk.create({
        data: {
          userKnowledgeBaseId: userKB.id,
          type: 'PROFILE_DATA',
          content: profileText,
          source: 'profile',
          tokens: profileText.length,
        },
      });
    }
  } catch (error) {
    console.error(`[saveUserProfileToKnowledgeBase] Ошибка:`, error);
    // Не бросаем ошибку, чтобы не блокировать создание чата
  }
}

/**
 * Скрипт для создания дефолтного чата с ИИ для всех пользователей
 * Создает чат с приветственным сообщением и кнопками
 */
async function createDefaultAIChats() {
  try {
    console.log('🚀 Начинаем создание дефолтных чатов с ИИ для всех пользователей...\n');

    // 1. Получаем или создаем бота ИИ
    const BOT_EMAIL = 'ai-assistant@myunion.pro';
    let botUser = await prisma.user.findUnique({
      where: { email: BOT_EMAIL },
    });

    if (!botUser) {
      console.log('📝 Создаем бота ИИ...');
      botUser = await prisma.user.create({
        data: {
          email: BOT_EMAIL,
          firstName: 'AI',
          lastName: 'Помощник',
          phone: '+70000000000',
          role: 'MEMBER',
          membershipStatus: 'APPROVED',
          emailVerified: new Date(),
        },
      });
      console.log(`   ✅ Бот создан: ${botUser.id}`);
    } else {
      console.log(`   ✅ Бот уже существует: ${botUser.id}`);
    }

    // 2. Получаем всех активных пользователей (исключаем ботов)
    const allUsers = await prisma.user.findMany({
      where: {
        id: { not: botUser.id },
        AND: [
          {
            OR: [
              { email: null },
              { email: { not: { contains: 'bot' } } },
            ],
          },
          {
            OR: [
              { email: null },
              { email: { not: { contains: 'assistant' } } },
            ],
          },
        ],
      },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
      },
    });

    console.log(`\n📋 Найдено пользователей: ${allUsers.length}`);

    // 3. Приветственное сообщение с кнопками
    const welcomeMessage = `Привет! Я ваш AI-помощник 👋

Я помогу вам с вопросами о профсоюзе, скидках, документах и членстве.

Выберите один из популярных вопросов или задайте свой:

📝 Как вступить в профсоюз?
💳 Какие есть скидки?
📋 Где найти мои документы?
✉️ Как создать обращение?
👤 Как заполнить профиль?
❓ Кто наш председатель?`;

    let createdChats = 0;
    let existingChats = 0;
    let errors = 0;

    // 4. Создаем чат с ИИ и базу знаний для каждого пользователя
    for (const user of allUsers) {
      try {
        // 4.1. Создаем или получаем базу знаний пользователя
        try {
          await getOrCreateUserKnowledgeBase(user.id);
          
          // Сохраняем профиль пользователя в базу знаний
          const fullUser = await prisma.user.findUnique({
            where: { id: user.id },
            include: { organization: true },
          });
          
          if (fullUser) {
            await saveUserProfileToKnowledgeBase(fullUser);
            console.log(`   📚 База знаний создана/обновлена для ${user.email || user.firstName}`);
          }
        } catch (kbError) {
          console.error(`   ⚠️  Ошибка создания базы знаний для ${user.email || user.firstName}:`, kbError.message);
          // Продолжаем создание чата даже если база знаний не создалась
        }

        // 4.2. Создаем или получаем чат с ботом
        const { chat, isNew } = await getOrCreatePrivateChat(user.id, botUser.id);

        if (!isNew) {
          existingChats++;
          console.log(`   ⏭️  Чат уже существует для ${user.email || user.firstName} (${chat.id})`);
          continue;
        }

        // 4.3. Создаем приветственное сообщение от бота (если таблица ChatMessage существует)
        try {
          // Пробуем создать сообщение без messageType (если колонка не существует)
          let message;
          try {
            message = await prisma.chatMessage.create({
              data: {
                chatId: chat.id,
                senderId: botUser.id,
                content: welcomeMessage,
                messageType: 'text',
              },
            });
          } catch (typeError) {
            if (typeError.code === 'P2022' && typeError.meta?.column === 'messageType') {
              // Колонка messageType не существует, создаем без неё
              message = await prisma.chatMessage.create({
                data: {
                  chatId: chat.id,
                  senderId: botUser.id,
                  content: welcomeMessage,
                },
              });
            } else {
              throw typeError;
            }
          }

          // Обновляем lastMessage в чате (если колонки существуют)
          try {
            await prisma.chat.update({
              where: { id: chat.id },
              data: {
                lastMessageId: message.id,
                lastMessageAt: new Date(),
              },
            });
          } catch (updateError) {
            if (updateError.code === 'P2022') {
              // Колонки не существуют - это нормально до миграции
              console.log(`   ⚠️  Колонки lastMessageId/lastMessageAt не существуют, пропускаем обновление`);
            } else {
              throw updateError;
            }
          }
          
          console.log(`   💬 Приветственное сообщение создано для ${user.email || user.firstName}`);
        } catch (error) {
          if (error.code === 'P2021') {
            // Таблица ChatMessage не существует - это нормально, сообщения в Matrix
            console.log(`   ⚠️  Таблица ChatMessage не существует, пропускаем создание сообщения`);
          } else {
            console.error(`   ⚠️  Ошибка создания сообщения:`, error.message);
            // Не бросаем ошибку, чтобы не блокировать создание чата
          }
        }

        createdChats++;
        console.log(`   ✅ Создан чат для ${user.email || user.firstName} (${chat.id})`);
      } catch (error) {
        errors++;
        console.error(`   ❌ Ошибка для ${user.email || user.firstName}:`, error.message);
      }
    }

    // 5. Статистика
    console.log('\n📊 Итоговая статистика:');
    console.log(`   Всего пользователей: ${allUsers.length}`);
    console.log(`   Создано новых чатов: ${createdChats}`);
    console.log(`   Чатов уже существовало: ${existingChats}`);
    console.log(`   Ошибок: ${errors}`);

    console.log('\n✅ Создание дефолтных чатов завершено!');
    console.log('💡 Теперь у всех пользователей есть чат с ИИ помощником с приветственным сообщением.');

  } catch (error) {
    console.error('❌ Ошибка при создании чатов:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// Запускаем скрипт
createDefaultAIChats()
  .then(() => {
    console.log('\n✅ Скрипт выполнен успешно');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Ошибка выполнения скрипта:', error);
    process.exit(1);
  });
