import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function fixKashinaChat() {
  try {
    // Находим пользователей
    const kashina = await prisma.user.findFirst({
      where: { lastName: { contains: 'Кашина', mode: 'insensitive' } },
    });
    const vitaly = await prisma.user.findFirst({
      where: { firstName: { contains: 'Виталий', mode: 'insensitive' }, lastName: { contains: 'Еременко', mode: 'insensitive' } },
    });
    const usmanov = await prisma.user.findFirst({
      where: { lastName: { contains: 'Усманов', mode: 'insensitive' } },
    });

    if (!kashina || !vitaly || !usmanov) {
      console.log('Не все пользователи найдены');
      console.log('Кашина:', kashina ? 'найдена' : 'не найдена');
      console.log('Виталий:', vitaly ? 'найден' : 'не найден');
      console.log('Усманов:', usmanov ? 'найден' : 'не найден');
      return;
    }

    console.log('Пользователи найдены:');
    console.log(`- ${kashina.firstName} ${kashina.lastName} (${kashina.id})`);
    console.log(`- ${vitaly.firstName} ${vitaly.lastName} (${vitaly.id})`);
    console.log(`- ${usmanov.firstName} ${usmanov.lastName} (${usmanov.id})`);

    // Проверяем чат
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
              },
            },
          },
        },
      },
    });

    if (!chat) {
      console.log(`\n❌ Чат ${chatId} не найден`);
      return;
    }

    console.log(`\n✅ Чат найден: ${chat.name || 'Без названия'}`);
    console.log(`Участники сейчас:`);
    chat.participants.forEach(p => {
      console.log(`  - ${p.user.firstName} ${p.user.lastName} (${p.user.id})`);
    });

    // Проверяем, есть ли Ренат в чате
    const usmanovInChat = chat.participants.find(p => p.userId === usmanov.id);
    
    if (!usmanovInChat) {
      console.log(`\n⚠️ Ренат Усманов не найден в чате. Добавляем...`);
      
      // Добавляем Рената в чат
      await prisma.chatParticipant.create({
        data: {
          chatId: chat.id,
          userId: usmanov.id,
          role: 'member',
          invitedById: vitaly.id, // Виталий пригласил
        },
      });
      
      console.log(`✅ Ренат Усманов добавлен в чат`);
    } else {
      console.log(`\n✅ Ренат Усманов уже в чате`);
    }

    // Проверяем push-токены для Кашиной
    console.log(`\n🔔 Проверяем push-уведомления для ${kashina.firstName} ${kashina.lastName}:`);
    
    const pushTokens = await prisma.pushNotificationToken.findMany({
      where: { userId: kashina.id },
    });
    
    console.log(`Найдено токенов: ${pushTokens.length}`);
    
    if (pushTokens.length === 0) {
      console.log(`⚠️ У Кашиной нет push-токенов. Нужно, чтобы она включила уведомления в браузере.`);
    } else {
      pushTokens.forEach(token => {
        console.log(`  - ${token.token.substring(0, 20)}... (${token.platform})`);
      });
    }

    // Проверяем настройки уведомлений
    const userSettings = await prisma.user.findUnique({
      where: { id: kashina.id },
      select: {
        pushNotificationsEnabled: true,
        emailNotificationsEnabled: true,
      },
    });

    console.log(`\n⚙️ Настройки уведомлений:`);
    console.log(`  - Push: ${userSettings?.pushNotificationsEnabled ? 'Включены' : 'Выключены'}`);
    console.log(`  - Email: ${userSettings?.emailNotificationsEnabled ? 'Включены' : 'Выключены'}`);

    // Если push выключены, включаем их
    if (!userSettings?.pushNotificationsEnabled) {
      console.log(`\n⚠️ Push-уведомления выключены. Включаем...`);
      await prisma.user.update({
        where: { id: kashina.id },
        data: { pushNotificationsEnabled: true },
      });
      console.log(`✅ Push-уведомления включены`);
    }

    console.log(`\n✅ Проверка завершена`);
  } catch (error) {
    console.error('Ошибка:', error);
  } finally {
    await prisma.$disconnect();
  }
}

fixKashinaChat();
