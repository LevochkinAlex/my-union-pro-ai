import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/**
 * Полная очистка всех чатов и обращений
 * Оставляет только чаты с ИИ (где есть участник с matrixUserId содержащим 'ai_assistant' или 'myunion_bot')
 */
async function cleanupAllChatsAndTickets() {
  try {
    console.log('🚀 Начинаем полную очистку всех чатов и обращений...\n');

    // 1. Находим чаты с ИИ (которые нужно сохранить)
    console.log('1️⃣ Поиск чатов с ИИ...');
    const aiChats = await prisma.chat.findMany({
      where: {
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
      select: { id: true, name: true },
    });
    
    console.log(`   Найдено чатов с ИИ для сохранения: ${aiChats.length}`);
    aiChats.forEach(chat => {
      console.log(`   - ${chat.name || chat.id}`);
    });

    // 2. Удаляем все обращения/тикеты
    console.log('\n2️⃣ Удаление всех обращений/тикетов...');
    const ticketsCount = await prisma.ticket.count();
    console.log(`   Найдено обращений: ${ticketsCount}`);
    
    if (ticketsCount > 0) {
      // Удаляем комментарии
      await prisma.ticketComment.deleteMany({});
      
      // Удаляем действия
      await prisma.ticketActionLog.deleteMany({});
      
      // Удаляем вложения
      await prisma.ticketAttachment.deleteMany({});
      
      // Удаляем документы обращений
      await prisma.document.deleteMany({
        where: {
          type: 'APPEAL',
        },
      });
      
      // Удаляем тикеты
      await prisma.ticket.deleteMany({});
      console.log(`   ✅ Удалено ${ticketsCount} обращений`);
    }

    // 3. Удаляем все чаты, кроме чатов с ИИ
    console.log('\n3️⃣ Удаление всех чатов (кроме чатов с ИИ)...');
    const aiChatIds = aiChats.map(c => c.id);
    
    // Удаляем участников всех чатов, кроме ИИ
    const deletedParticipants = await prisma.chatParticipant.deleteMany({
      where: {
        chatId: {
          notIn: aiChatIds.length > 0 ? aiChatIds : ['dummy'], // Если нет ИИ чатов, удаляем всех
        },
      },
    });
    console.log(`   Удалено участников: ${deletedParticipants.count}`);

    // Удаляем все чаты, кроме ИИ
    const deletedChats = await prisma.chat.deleteMany({
      where: {
        id: {
          notIn: aiChatIds.length > 0 ? aiChatIds : ['dummy'],
        },
      },
    });
    console.log(`   ✅ Удалено чатов: ${deletedChats.count}`);

    // 4. Статистика
    console.log('\n📊 Финальная статистика:');
    const finalChats = await prisma.chat.count();
    const finalParticipants = await prisma.chatParticipant.count();
    const finalTickets = await prisma.ticket.count();
    
    console.log(`   Чатов всего: ${finalChats} (только с ИИ)`);
    console.log(`   Участников чатов: ${finalParticipants}`);
    console.log(`   Обращений: ${finalTickets}`);
    console.log(`   Сообщений: 0 (все в Matrix)`);

    console.log('\n✅ Очистка завершена!');
    console.log('\n📝 Следующие шаги:');
    console.log('   1. При создании обращения будет создан новый тред в Matrix');
    console.log('   2. Чат с ИИ сохранен и доступен всем пользователям');
    console.log('   3. Перезапустите приложение для применения изменений');

  } catch (error) {
    console.error('❌ Ошибка при очистке:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// Подтверждение
const args = process.argv.slice(2);
if (!args.includes('--confirm')) {
  console.log('⚠️  ВНИМАНИЕ! Этот скрипт удалит:');
  console.log('   - ВСЕ чаты (кроме чатов с ИИ)');
  console.log('   - ВСЕ обращения/тикеты');
  console.log('   - Все связанные данные (комментарии, действия, вложения)');
  console.log('');
  console.log('Для подтверждения запустите:');
  console.log('   node scripts/cleanup-all-chats-and-tickets.mjs --confirm');
  process.exit(1);
}

cleanupAllChatsAndTickets();
