import { PrismaClient } from '@prisma/client';
import { config } from 'dotenv';
import { resolve } from 'path';

config({ path: resolve(process.cwd(), '.env.local') });

const prisma = new PrismaClient();
const MATRIX_SERVER_URL = process.env.MATRIX_SERVER_URL || 'https://matrix.myunion.pro';

/**
 * Получает сообщения из Matrix комнаты
 */
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

/**
 * Удаляет (redact) сообщение из Matrix
 */
async function redactMessage(roomId, eventId, accessToken) {
  const txnId = `r${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  const response = await fetch(
    `${MATRIX_SERVER_URL}/_matrix/client/v3/rooms/${encodeURIComponent(roomId)}/redact/${encodeURIComponent(eventId)}/${txnId}`,
    {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        reason: 'Removing old welcome message',
      }),
    }
  );

  return response.ok;
}

/**
 * Скрипт для удаления старых приветственных сообщений из Matrix
 */
async function removeMatrixWelcomeMessages() {
  try {
    console.log('🚀 Начинаем удаление старых приветственных сообщений из Matrix...\n');

    // 1. Получаем бота ИИ
    const BOT_EMAIL = 'ai-assistant@myunion.pro';
    const botUser = await prisma.user.findUnique({
      where: { email: BOT_EMAIL },
      select: { id: true, matrixUserId: true, matrixAccessToken: true },
    });

    if (!botUser) {
      console.log('❌ Бот ИИ не найден');
      return;
    }

    console.log(`✅ Бот найден: ${botUser.id}\n`);

    // 2. Находим все чаты с ботом, у которых есть matrixRoomId (используем select, чтобы избежать проблем с несуществующими колонками)
    const aiChats = await prisma.chat.findMany({
      where: {
        type: 'PRIVATE',
        matrixRoomId: { not: null },
        participants: {
          some: {
            userId: botUser.id,
            leftAt: null,
          },
        },
      },
      select: {
        id: true,
        matrixRoomId: true,
        type: true,
        participants: {
          where: { leftAt: null },
          select: {
            userId: true,
            user: {
              select: {
                id: true,
                email: true,
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

    let deletedCount = 0;
    let checkedChats = 0;

    // 3. Удаляем приветственные сообщения из каждого чата
    for (const chat of aiChats) {
      try {
        const otherUser = chat.participants.find(p => p.userId !== botUser.id);
        const userName = otherUser?.user?.email || otherUser?.user?.firstName || 'Unknown';
        const roomId = chat.matrixRoomId;

        if (!roomId) {
          console.log(`   ⏭️  Нет matrixRoomId для ${userName}`);
          continue;
        }

        // Используем токен пользователя для доступа к комнате
        const userToken = otherUser?.user?.matrixAccessToken;
        if (!userToken) {
          console.log(`   ⚠️  Нет Matrix токена для ${userName}, пропускаем`);
          continue;
        }

        // Получаем сообщения из Matrix
        const messages = await getMatrixMessages(roomId, userToken, 50);

        // Ищем приветственные сообщения от бота
        const welcomeMessages = messages.filter(msg => {
          if (msg.type !== 'm.room.message') return false;
          if (msg.sender !== botUser.matrixUserId) return false;
          
          const content = msg.content?.body || '';
          return (
            content.includes('Здравствуйте') ||
            content.includes('AI-помощник') ||
            content.includes('Трудовой спор') ||
            content.includes('Жалоба') ||
            content.includes('профсоюза МООП РЗ') ||
            content.includes('Привет! Я ваш AI-помощник')
          );
        });

        if (welcomeMessages.length > 0) {
          console.log(`   🔍 Найдено ${welcomeMessages.length} приветственных сообщений для ${userName}`);

          // Удаляем каждое приветственное сообщение
          for (const msg of welcomeMessages) {
            const success = await redactMessage(roomId, msg.event_id, userToken);
            if (success) {
              deletedCount++;
              console.log(`      ✅ Удалено сообщение ${msg.event_id.substring(0, 20)}...`);
            } else {
              console.log(`      ❌ Не удалось удалить сообщение ${msg.event_id.substring(0, 20)}...`);
            }
            
            // Небольшая задержка, чтобы не перегрузить Matrix
            await new Promise(resolve => setTimeout(resolve, 200));
          }
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

    console.log('\n✅ Удаление старых приветственных сообщений из Matrix завершено!');
    console.log('💡 Теперь приветствие показывается только в UI компонента, когда нет сообщений.');

  } catch (error) {
    console.error('❌ Ошибка при удалении сообщений:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// Запускаем скрипт
removeMatrixWelcomeMessages()
  .then(() => {
    console.log('\n✅ Скрипт выполнен успешно');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Ошибка выполнения скрипта:', error);
    process.exit(1);
  });
