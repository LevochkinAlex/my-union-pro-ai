import { PrismaClient } from '@prisma/client';
import { config } from 'dotenv';
import { resolve } from 'path';

config({ path: resolve(process.cwd(), '.env.local') });

const prisma = new PrismaClient();
const MATRIX_SERVER_URL = process.env.MATRIX_SERVER_URL || 'https://matrix.myunion.pro';

/**
 * Получает все сообщения из Matrix комнаты
 */
async function getAllMatrixMessages(roomId, accessToken) {
  let allMessages = [];
  let from = null;
  let hasMore = true;

  while (hasMore) {
    const params = new URLSearchParams({
      limit: '100',
      dir: 'b', // backward (старые сообщения)
    });
    if (from) {
      params.set('from', from);
    }

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
      break;
    }

    const data = await response.json();
    const messages = data.chunk || [];
    allMessages = allMessages.concat(messages);

    // Проверяем, есть ли еще сообщения
    hasMore = messages.length === 100;
    if (hasMore && messages.length > 0) {
      from = messages[messages.length - 1].event_id;
    } else {
      hasMore = false;
    }

    // Небольшая задержка, чтобы не перегрузить Matrix
    await new Promise(resolve => setTimeout(resolve, 100));
  }

  return allMessages;
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
        reason: 'Clearing all messages for migration to WebSocket',
      }),
    }
  );

  return response.ok;
}

/**
 * Скрипт для полной очистки всех сообщений из Matrix для чатов с ИИ
 */
async function clearAllMatrixAIMessages() {
  try {
    console.log('🚀 Начинаем полную очистку всех сообщений из Matrix для чатов с ИИ...\n');

    // 1. Получаем бота ИИ
    const BOT_EMAIL = 'ai-assistant@myunion.pro';
    const botUser = await prisma.user.findUnique({
      where: { email: BOT_EMAIL },
      select: { id: true, matrixUserId: true },
    });

    if (!botUser) {
      console.log('❌ Бот ИИ не найден');
      return;
    }

    console.log(`✅ Бот найден: ${botUser.id}\n`);

    // 2. Находим все чаты с ботом, у которых есть matrixRoomId
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

    let totalDeleted = 0;
    let checkedChats = 0;

    // 3. Очищаем все сообщения из каждого чата
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

        console.log(`   🔍 Загружаем все сообщения для ${userName}...`);

        // Получаем ВСЕ сообщения из Matrix
        const allMessages = await getAllMatrixMessages(roomId, userToken);

        console.log(`   📨 Найдено сообщений: ${allMessages.length}`);

        if (allMessages.length > 0) {
          // Удаляем ВСЕ сообщения (любого типа)
          let deleted = 0;
          let failed = 0;
          for (const msg of allMessages) {
            // Пропускаем системные события, которые нельзя удалить
            if (msg.type === 'm.room.member' || 
                msg.type === 'm.room.create' || 
                msg.type === 'm.room.join_rules' ||
                msg.type === 'm.room.power_levels' ||
                msg.type === 'm.room.name' ||
                msg.type === 'm.room.topic') {
              continue;
            }
            
            try {
              const success = await redactMessage(roomId, msg.event_id, userToken);
              if (success) {
                deleted++;
                totalDeleted++;
              } else {
                failed++;
              }
            } catch (error) {
              failed++;
              // Продолжаем удаление даже при ошибках
            }
            
            // Задержка, чтобы не перегрузить Matrix
            if (deleted % 10 === 0) {
              await new Promise(resolve => setTimeout(resolve, 500));
            } else {
              await new Promise(resolve => setTimeout(resolve, 50));
            }
          }
          console.log(`      ✅ Удалено ${deleted} сообщений для ${userName}${failed > 0 ? `, ошибок: ${failed}` : ''}`);
        } else {
          console.log(`   ⏭️  Нет сообщений для ${userName}`);
        }

        checkedChats++;
      } catch (error) {
        console.error(`   ❌ Ошибка для чата ${chat.id}:`, error.message);
      }
    }

    console.log('\n📊 Итоговая статистика:');
    console.log(`   Проверено чатов: ${checkedChats}`);
    console.log(`   Удалено сообщений: ${totalDeleted}`);

    console.log('\n✅ Полная очистка сообщений из Matrix завершена!');
    console.log('💡 Теперь чаты с ИИ будут работать через WebSocket сервер без Matrix.');

  } catch (error) {
    console.error('❌ Ошибка при очистке сообщений:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// Запускаем скрипт
clearAllMatrixAIMessages()
  .then(() => {
    console.log('\n✅ Скрипт выполнен успешно');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Ошибка выполнения скрипта:', error);
    process.exit(1);
  });
