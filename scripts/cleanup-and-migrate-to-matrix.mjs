import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/**
 * Полная очистка и миграция на Matrix
 * 1. Удаляет все старые чаты без matrixRoomId
 * 2. Удаляет все старые сообщения (теперь в Matrix)
 * 3. Удаляет все обращения/тикеты
 * 4. Мигрирует чаты на новую схему (только ChatParticipant, без participant1Id/participant2Id)
 */
async function cleanupAndMigrate() {
  try {
    console.log('🚀 Начинаем полную миграцию на Matrix...\n');

    // 1. Удаляем все чаты без matrixRoomId (старые чаты)
    console.log('1️⃣ Удаление старых чатов без matrixRoomId...');
    const oldChats = await prisma.chat.findMany({
      where: {
        matrixRoomId: null,
      },
      select: { id: true, type: true },
    });
    
    console.log(`   Найдено старых чатов: ${oldChats.length}`);
    
    if (oldChats.length > 0) {
      // Удаляем участников этих чатов
      await prisma.chatParticipant.deleteMany({
        where: {
          chatId: { in: oldChats.map(c => c.id) },
        },
      });
      
      // Удаляем сообщения
      await prisma.chatMessage.deleteMany({
        where: {
          chatId: { in: oldChats.map(c => c.id) },
        },
      });
      
      // Удаляем чаты
      await prisma.chat.deleteMany({
        where: {
          id: { in: oldChats.map(c => c.id) },
        },
      });
      
      console.log(`   ✅ Удалено ${oldChats.length} старых чатов`);
    }

    // 2. Удаляем все обращения/тикеты
    console.log('\n2️⃣ Удаление всех обращений/тикетов...');
    const ticketsCount = await prisma.ticket.count();
    console.log(`   Найдено обращений: ${ticketsCount}`);
    
    if (ticketsCount > 0) {
      // Удаляем комментарии
      await prisma.ticketComment.deleteMany({});
      
      // Удаляем действия
      await prisma.ticketActionLog.deleteMany({});
      
      // Удаляем документы обращений
      await prisma.document.deleteMany({
        where: {
          type: 'APPEAL',
        },
      });
      
      // Удаляем тикеты (связи с чатами уже удалены в схеме)
      await prisma.ticket.deleteMany({});
      console.log(`   ✅ Удалено ${ticketsCount} обращений`);
    }

    // 3. Удаляем все старые сообщения (теперь они в Matrix)
    console.log('\n3️⃣ Удаление всех старых сообщений из БД...');
    const messagesCount = await prisma.chatMessage.count();
    console.log(`   Найдено сообщений: ${messagesCount}`);
    
    if (messagesCount > 0) {
      // Удаляем вложения
      await prisma.chatMessageAttachment.deleteMany({});
      
      // Удаляем прочитанные статусы
      await prisma.chatMessageRead.deleteMany({});
      
      // Удаляем сообщения
      await prisma.chatMessage.deleteMany({});
      
      console.log(`   ✅ Удалено ${messagesCount} сообщений`);
    }

    // 4. Мигрируем чаты на новую схему
    console.log('\n4️⃣ Миграция чатов на новую схему (только ChatParticipant)...');
    
    const chatsWithOldSchema = await prisma.chat.findMany({
      where: {
        OR: [
          { participant1Id: { not: null } },
          { participant2Id: { not: null } },
        ],
      },
      include: {
        participants: true,
      },
    });
    
    console.log(`   Найдено чатов со старой схемой: ${chatsWithOldSchema.length}`);
    
    for (const chat of chatsWithOldSchema) {
      const participantIds = [];
      
      if (chat.participant1Id) {
        participantIds.push(chat.participant1Id);
      }
      if (chat.participant2Id) {
        participantIds.push(chat.participant2Id);
      }
      
      // Проверяем, что участники уже есть в ChatParticipant
      const existingParticipantIds = chat.participants.map(p => p.userId);
      const missingParticipants = participantIds.filter(
        id => !existingParticipantIds.includes(id)
      );
      
      // Добавляем недостающих участников
      for (const userId of missingParticipants) {
        const user = await prisma.user.findUnique({
          where: { id: userId },
          select: { id: true },
        });
        
        if (user) {
          await prisma.chatParticipant.create({
            data: {
              chatId: chat.id,
              userId: userId,
              role: 'member',
              invitedById: participantIds[0] || userId,
            },
          });
          console.log(`     ✅ Добавлен участник ${userId} в чат ${chat.id}`);
        }
      }
      
      // Обнуляем старые поля (но не удаляем их из схемы еще)
      await prisma.chat.update({
        where: { id: chat.id },
        data: {
          participant1Id: null,
          participant2Id: null,
          participant1ReadAt: null,
          participant2ReadAt: null,
          participant1ClearedAt: null,
          participant2ClearedAt: null,
        },
      });
    }
    
    console.log(`   ✅ Мигрировано ${chatsWithOldSchema.length} чатов`);

    // 5. Очищаем старые прочитанные статусы
    console.log('\n5️⃣ Очистка старых данных прочитанных статусов...');
    await prisma.chat.updateMany({
      data: {
        participant1ReadAt: null,
        participant2ReadAt: null,
        participant1ClearedAt: null,
        participant2ClearedAt: null,
        lastMessage: null,
      },
    });
    console.log('   ✅ Очищено');

    // 6. Статистика
    console.log('\n📊 Финальная статистика:');
    const finalChats = await prisma.chat.count({
      where: { matrixRoomId: { not: null } },
    });
    const finalParticipants = await prisma.chatParticipant.count();
    
    console.log(`   Чатов с Matrix: ${finalChats}`);
    console.log(`   Участников чатов: ${finalParticipants}`);
    console.log(`   Сообщений: 0 (все в Matrix)`);
    console.log(`   Обращений: 0`);

    console.log('\n✅ Миграция завершена!');
    console.log('\n📝 Следующие шаги:');
    console.log('   1. Запустите миграцию БД для удаления старых полей');
    console.log('   2. Обновите код, удалив legacy поддержку');
    console.log('   3. Перезапустите приложение');

  } catch (error) {
    console.error('❌ Ошибка при миграции:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// Подтверждение
const args = process.argv.slice(2);
if (!args.includes('--confirm')) {
  console.log('⚠️  ВНИМАНИЕ! Этот скрипт удалит:');
  console.log('   - Все чаты без matrixRoomId');
  console.log('   - Все сообщения из БД');
  console.log('   - Все обращения/тикеты');
  console.log('');
  console.log('Для подтверждения запустите:');
  console.log('   node scripts/cleanup-and-migrate-to-matrix.mjs --confirm');
  process.exit(1);
}

cleanupAndMigrate();
