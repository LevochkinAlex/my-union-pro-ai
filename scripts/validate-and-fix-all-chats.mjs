import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/**
 * Комплексная проверка и исправление всех чатов в системе
 */
async function validateAndFixAllChats() {
  try {
    console.log('🔍 Начинаем проверку всех чатов...\n');

    // 1. Получаем все чаты
    const allChats = await prisma.chat.findMany({
      include: {
        participants: {
          include: {
            user: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                email: true,
                matrixUserId: true,
              },
            },
          },
        },
      },
      orderBy: { updatedAt: 'desc' },
    });

    console.log(`📊 Всего чатов в системе: ${allChats.length}\n`);

    let fixedCount = 0;
    let errorsFound = 0;

    for (const chat of allChats) {
      const issues = [];
      const fixes = [];

      // Проверка 1: Чаты без matrixRoomId (старые чаты, не мигрированные)
      if (!chat.matrixRoomId) {
        issues.push('⚠️  Отсутствует matrixRoomId');
        // Не исправляем автоматически - это может быть старый чат
      }

      // Проверка 2: Чаты без участников
      if (chat.participants.length === 0) {
        issues.push('❌ Нет участников');
        errorsFound++;
      }

      // Проверка 3: Чаты с участниками, которые ушли (leftAt != null), но они все еще в списке
      const activeParticipants = chat.participants.filter(p => !p.leftAt);
      if (activeParticipants.length === 0 && chat.participants.length > 0) {
        issues.push('❌ Все участники покинули чат');
        errorsFound++;
      }

      // Проверка 4: Для приватных чатов должно быть ровно 2 активных участника
      if (chat.type === 'PRIVATE') {
        if (activeParticipants.length < 2) {
          issues.push(`❌ Приватный чат с ${activeParticipants.length} активными участниками (должно быть 2)`);
          errorsFound++;
        }
        if (activeParticipants.length > 2) {
          issues.push(`⚠️  Приватный чат с ${activeParticipants.length} участниками (возможно, это ошибка)`);
        }
      }

      // Проверка 5: Участники без пользователя (user = null)
      const participantsWithoutUser = chat.participants.filter(p => !p.user);
      if (participantsWithoutUser.length > 0) {
        issues.push(`❌ ${participantsWithoutUser.length} участников без пользователя`);
        errorsFound++;
        // Удаляем такие записи
        for (const badParticipant of participantsWithoutUser) {
          await prisma.chatParticipant.delete({
            where: { id: badParticipant.id },
          });
          fixes.push(`  ✅ Удален участник без пользователя (${badParticipant.id})`);
          fixedCount++;
        }
      }

      // Проверка 6: Дублирующиеся участники (один пользователь дважды в чате)
      const userIds = activeParticipants.map(p => p.userId).filter(Boolean);
      const uniqueUserIds = [...new Set(userIds)];
      if (userIds.length !== uniqueUserIds.length) {
        issues.push(`❌ Дублирующиеся участники`);
        errorsFound++;
        
        // Находим и удаляем дубликаты
        const seen = new Set();
        for (const participant of activeParticipants) {
          if (seen.has(participant.userId)) {
            // Это дубликат - удаляем более поздний
            await prisma.chatParticipant.update({
              where: { id: participant.id },
              data: { leftAt: new Date() },
            });
            fixes.push(`  ✅ Удален дубликат участника ${participant.user?.firstName} ${participant.user?.lastName}`);
            fixedCount++;
          } else {
            seen.add(participant.userId);
          }
        }
      }

      // Проверка 7: Участники с матрицей, но чат без matrixRoomId
      const participantsWithMatrix = activeParticipants.filter(
        p => p.user?.matrixUserId
      );
      if (participantsWithMatrix.length > 0 && !chat.matrixRoomId) {
        issues.push('⚠️  Участники с Matrix, но чат без matrixRoomId');
      }

      // Выводим информацию о проблемах
      if (issues.length > 0 || fixes.length > 0) {
        console.log(`📋 Чат ${chat.id} (${chat.type}):`);
        if (chat.name) {
          console.log(`   Название: ${chat.name}`);
        }
        console.log(`   Участники: ${activeParticipants.length} активных из ${chat.participants.length}`);
        activeParticipants.forEach(p => {
          const user = p.user;
          if (user) {
            console.log(`     - ${user.firstName} ${user.lastName} (${user.id})`);
          }
        });
        
        if (issues.length > 0) {
          console.log(`   Проблемы:`);
          issues.forEach(issue => console.log(`     ${issue}`));
        }
        
        if (fixes.length > 0) {
          console.log(`   Исправления:`);
          fixes.forEach(fix => console.log(`     ${fix}`));
        }
        console.log('');
      }
    }

    // Статистика
    console.log('\n📊 Итоговая статистика:');
    console.log(`   Всего чатов: ${allChats.length}`);
    console.log(`   Найдено проблем: ${errorsFound}`);
    console.log(`   Исправлено: ${fixedCount}`);

    // 2. Проверяем пользователей без push-подписок или с выключенными уведомлениями
    console.log('\n🔔 Проверка push-уведомлений...\n');
    
    const usersWithoutPush = await prisma.user.findMany({
      where: {
        pushNotificationsEnabled: false,
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        pushNotificationsEnabled: true,
      },
      take: 10, // Первые 10 для примера
    });

    console.log(`Пользователи с выключенными push-уведомлениями: ${usersWithoutPush.length} (показаны первые 10)`);
    if (usersWithoutPush.length > 0) {
      usersWithoutPush.forEach(user => {
        console.log(`  - ${user.firstName} ${user.lastName} (${user.email || 'нет email'})`);
      });
    }

    console.log('\n✅ Проверка завершена!');

  } catch (error) {
    console.error('❌ Ошибка при проверке чатов:', error);
  } finally {
    await prisma.$disconnect();
  }
}

validateAndFixAllChats();
