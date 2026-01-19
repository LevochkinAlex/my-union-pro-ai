import { PrismaClient } from '@prisma/client';
import { config } from 'dotenv';
import { resolve } from 'path';

// Load environment variables
config({ path: resolve(process.cwd(), '.env.local') });

const prisma = new PrismaClient();
const MATRIX_SERVER_URL = process.env.MATRIX_SERVER_URL || 'https://matrix.myunion.pro';
const BOT_ACCESS_TOKEN = process.env.MATRIX_BOT_TOKEN;

// Стартовое сообщение с готовыми ответами
const WELCOME_MESSAGE = `Здравствуйте! 👋 Я ваш AI-помощник профсоюза МООП РЗ.

Чем могу помочь? Выберите один из вариантов:

💼 **Трудовой спор** — помощь в решении трудовых вопросов
📋 **Жалоба** — подача жалобы на действия работодателя
⚖️ **Консультация** — юридическая консультация по вопросам профсоюза
🛡️ **Льготы** — информация о льготах и скидках для членов профсоюза
📄 **Документы** — помощь с заявлениями и документами
❓ **Другой вопрос** — задайте свой вопрос

Вы также можете просто написать свой вопрос в свободной форме — я помогу вам! 😊`;

async function getBotAccessToken() {
  if (BOT_ACCESS_TOKEN) {
    return BOT_ACCESS_TOKEN;
  }

  // Если токен не задан, получаем из БД
  const botUser = await prisma.user.findFirst({
    where: {
      OR: [
        { matrixUserId: { contains: 'myunion_bot' } },
        { matrixUserId: { contains: 'ai_assistant' } },
      ],
    },
    select: { matrixAccessToken: true },
  });

  return botUser?.matrixAccessToken || null;
}

async function getMatrixMessages(roomId, accessToken, limit = 100) {
  const params = new URLSearchParams({
    limit: limit.toString(),
    dir: 'b', // backward (новые сообщения в конце)
  });

  const response = await fetch(
    `${MATRIX_SERVER_URL}/_matrix/client/v3/rooms/${encodeURIComponent(roomId)}/messages?${params}`,
    {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
      },
    }
  );

  if (!response.ok) {
    console.error(`Failed to get messages for ${roomId}: ${response.status}`);
    return [];
  }

  const data = await response.json();
  return data.chunk || [];
}

async function redactMessage(roomId, eventId, accessToken) {
  const txnId = `r${Date.now()}`;
  const response = await fetch(
    `${MATRIX_SERVER_URL}/_matrix/client/v3/rooms/${encodeURIComponent(roomId)}/redact/${encodeURIComponent(eventId)}/${txnId}`,
    {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        reason: 'Reset to welcome message',
      }),
    }
  );

  return response.ok;
}

async function sendWelcomeMessage(roomId, accessToken) {
  const txnId = `m${Date.now()}`;
  const response = await fetch(
    `${MATRIX_SERVER_URL}/_matrix/client/v3/rooms/${encodeURIComponent(roomId)}/send/m.room.message/${txnId}`,
    {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        msgtype: 'm.text',
        body: WELCOME_MESSAGE,
        format: 'org.matrix.custom.html',
        formatted_body: WELCOME_MESSAGE
          .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
          .replace(/\n/g, '<br>'),
      }),
    }
  );

  if (response.ok) {
    const data = await response.json();
    return data.event_id;
  }

  console.error(`Failed to send welcome message: ${response.status}`, await response.text());
  return null;
}

async function resetAIChats() {
  const args = process.argv.slice(2);
  const confirm = args.includes('--confirm');

  if (!confirm) {
    console.log('⚠️  ВНИМАНИЕ! Этот скрипт:');
    console.log('   - Удалит все сообщения из всех чатов с ИИ');
    console.log('   - Отправит новое стартовое сообщение с готовыми ответами');
    console.log('');
    console.log('Для подтверждения запустите:');
    console.log('   node scripts/reset-ai-chats.mjs --confirm');
    process.exit(1);
  }

  try {
    console.log('🚀 Начинаем сброс чатов с ИИ...\n');

    // Получаем токен бота
    const botToken = await getBotAccessToken();
    if (!botToken) {
      throw new Error('MATRIX_BOT_TOKEN не найден. Установите переменную окружения или создайте пользователя-бота в БД.');
    }

    // Находим все чаты с ИИ
    const aiChats = await prisma.chat.findMany({
      where: {
        matrixRoomId: { not: null },
        participants: {
          some: {
            user: {
              OR: [
                { matrixUserId: { contains: 'ai_assistant' } },
                { matrixUserId: { contains: 'myunion_bot' } },
                { matrixUserId: { contains: 'assistant' } },
              ],
            },
          },
        },
      },
      include: {
        participants: {
          where: { leftAt: null },
          include: {
            user: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                matrixUserId: true,
                matrixAccessToken: true,
              },
            },
          },
        },
      },
    });

    console.log(`📋 Найдено чатов с ИИ: ${aiChats.length}\n`);

    if (aiChats.length === 0) {
      console.log('✅ Нет чатов с ИИ для сброса');
      return;
    }

    let resetCount = 0;
    let errorCount = 0;

    for (const chat of aiChats) {
      const roomId = chat.matrixRoomId;
      if (!roomId) continue;

      try {
        console.log(`📝 Обрабатываем чат: ${chat.name || chat.id}`);
        console.log(`   Matrix Room: ${roomId}`);

        // Находим участника-пользователя (не бота) для получения токена
        const userParticipant = chat.participants?.find(p => {
          const mUserId = p.user?.matrixUserId || '';
          return !mUserId.includes('myunion_bot') && 
                 !mUserId.includes('ai_assistant') && 
                 !mUserId.includes('assistant') &&
                 p.user?.matrixAccessToken;
        });

        if (!userParticipant?.user?.matrixAccessToken) {
          console.log(`   ⚠️  Не найден участник с токеном для чата ${chat.id}`);
          errorCount++;
          continue;
        }

        const userToken = userParticipant.user.matrixAccessToken;
        const userName = `${userParticipant.user.firstName || ''} ${userParticipant.user.lastName || ''}`.trim() || 'Пользователь';
        console.log(`   Участник: ${userName} (${userParticipant.user.matrixUserId})`);

        // Получаем все сообщения из комнаты используя токен пользователя
        const messages = await getMatrixMessages(roomId, userToken);
        console.log(`   Найдено сообщений: ${messages.length}`);

        if (messages.length === 0) {
          console.log(`   ℹ️  Нет сообщений в комнате, отправляем приветствие от бота...`);
          const welcomeEventId = await sendWelcomeMessage(roomId, botToken);
          if (welcomeEventId) {
            console.log(`   ✅ Отправлено приветственное сообщение`);
            resetCount++;
          } else {
            console.log(`   ⚠️  Не удалось отправить приветствие`);
            errorCount++;
          }
          continue;
        }

        // Удаляем все сообщения (используем токен пользователя для redact)
        const messagesToDelete = messages.filter(m => {
          // Удаляем только сообщения (m.room.message), пропускаем события типа m.room.member
          return m.type === 'm.room.message';
        });

        console.log(`   Удаляем ${messagesToDelete.length} сообщений...`);

        // Удаляем все сообщения (redact) - используем токен пользователя
        // Добавляем задержку между запросами чтобы избежать rate limit
        let deletedCount = 0;
        for (let i = 0; i < messagesToDelete.length; i++) {
          const msg = messagesToDelete[i];
          const deleted = await redactMessage(roomId, msg.event_id, userToken);
          if (deleted) deletedCount++;
          
          // Задержка между запросами (кроме последнего)
          if (i < messagesToDelete.length - 1) {
            await new Promise(resolve => setTimeout(resolve, 100)); // 100ms задержка
          }
        }

        console.log(`   ✅ Удалено ${deletedCount} из ${messagesToDelete.length} сообщений`);

        // Ждем немного перед отправкой приветствия (чтобы избежать rate limit)
        await new Promise(resolve => setTimeout(resolve, 500));

        // Отправляем новое приветственное сообщение
        // Сначала пробуем от бота, если не получается - от пользователя
        let welcomeEventId = null;
        
        // Пробуем найти правильного бота из участников комнаты
        const botParticipant = chat.participants?.find(p => {
          const mUserId = p.user?.matrixUserId || '';
          return mUserId.includes('myunion_bot') || 
                 mUserId.includes('ai_assistant') || 
                 mUserId.includes('assistant');
        });
        
        if (botParticipant?.user?.matrixAccessToken) {
          const botUserToken = botParticipant.user.matrixAccessToken;
          welcomeEventId = await sendWelcomeMessage(roomId, botUserToken);
        }
        
        // Если не удалось от бота, пробуем от пользователя
        if (!welcomeEventId) {
          welcomeEventId = await sendWelcomeMessage(roomId, userToken);
        }
        
        if (welcomeEventId) {
          console.log(`   ✅ Отправлено новое приветственное сообщение`);
          resetCount++;
        } else {
          console.log(`   ⚠️  Сообщения удалены, но не удалось отправить приветствие`);
          errorCount++;
        }

      } catch (error) {
        console.error(`   ❌ Ошибка при обработке чата ${chat.id}:`, error.message);
        errorCount++;
      }

      console.log('');
    }

    console.log('📊 Результаты:');
    console.log(`   ✅ Успешно обработано: ${resetCount}`);
    console.log(`   ❌ Ошибок: ${errorCount}`);
    console.log(`   📝 Всего чатов: ${aiChats.length}`);

  } catch (error) {
    console.error('❌ Ошибка при сбросе чатов:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

resetAIChats()
  .then(() => {
    console.log('\n✅ Сброс чатов завершен!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Критическая ошибка:', error);
    process.exit(1);
  });
