import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function checkChats() {
  try {
    // Находим пользователей
    const users = await prisma.user.findMany({
      where: {
        OR: [
          { lastName: { contains: 'Кашина', mode: 'insensitive' } },
          { lastName: { contains: 'Еременко', mode: 'insensitive' } },
          { lastName: { contains: 'Усманов', mode: 'insensitive' } },
        ],
      },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
      },
    });

    console.log('Найдено пользователей:', users.length);
    users.forEach(user => {
      console.log(`- ${user.firstName} ${user.lastName} (${user.id})`);
    });

    if (users.length === 0) {
      console.log('Пользователи не найдены');
      return;
    }

    // Находим чат по ID
    const chatId = 'cmkfez0ac0006pti5r67687m8';
    const chat = await prisma.chat.findUnique({
      where: { id: chatId },
      include: {
        participants: {
          include: {
            user: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                email: true,
              },
            },
          },
        },
      },
    });

    if (!chat) {
      console.log(`\n❌ Чат ${chatId} не найден`);
    } else {
      console.log(`\n✅ Чат найден: ${chat.name || 'Без названия'}`);
      console.log(`Тип: ${chat.type}`);
      console.log(`Matrix Room ID: ${chat.matrixRoomId || 'Нет'}`);
      console.log(`Участники:`);
      chat.participants.forEach(p => {
        console.log(`  - ${p.user.firstName} ${p.user.lastName} (${p.user.id})`);
        console.log(`    Роль: ${p.role}, Присоединился: ${p.joinedAt}`);
      });
    }

    // Проверяем все чаты для Кашиной
    const kashina = users.find(u => u.lastName?.includes('Кашина'));
    if (kashina) {
      console.log(`\n📋 Все чаты для ${kashina.firstName} ${kashina.lastName}:`);
      const kashinaChats = await prisma.chatParticipant.findMany({
        where: { userId: kashina.id },
        include: {
          chat: {
            include: {
              participants: {
                include: {
                  user: {
                    select: {
                      id: true,
                      firstName: true,
                      lastName: true,
                    },
                  },
                },
              },
            },
          },
        },
        orderBy: { joinedAt: 'desc' },
      });

      console.log(`Найдено чатов: ${kashinaChats.length}`);
      kashinaChats.forEach(cp => {
        const otherParticipants = cp.chat.participants
          .filter(p => p.userId !== kashina.id)
          .map(p => `${p.user.firstName} ${p.user.lastName}`)
          .join(', ');
        console.log(`  - Чат ${cp.chat.id}: ${otherParticipants || 'Групповой'}`);
        console.log(`    Тип: ${cp.chat.type}, Matrix: ${cp.chat.matrixRoomId ? 'Да' : 'Нет'}`);
      });
    }

    // Проверяем push-токены для Кашиной
    if (kashina) {
      const pushTokens = await prisma.pushNotificationToken.findMany({
        where: { userId: kashina.id },
      });
      console.log(`\n🔔 Push-токены для ${kashina.firstName} ${kashina.lastName}: ${pushTokens.length}`);
      pushTokens.forEach(token => {
        console.log(`  - ${token.token.substring(0, 20)}... (${token.platform})`);
      });
    }
  } catch (error) {
    console.error('Ошибка:', error);
  } finally {
    await prisma.$disconnect();
  }
}

checkChats();
