import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function fixVitalyUser() {
  try {
    // Ищем пользователя Виталия
    const users = await prisma.user.findMany({
      where: {
        OR: [
          { firstName: { contains: 'Виталий', mode: 'insensitive' } },
          { lastName: { contains: 'Еременко', mode: 'insensitive' } },
        ],
      },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        middleName: true,
        role: true,
        membershipStatus: true,
        emailVerified: true,
        phone: true,
      },
    });

    console.log('Найдено пользователей:', users.length);
    users.forEach(user => {
      console.log(JSON.stringify(user, null, 2));
    });

    if (users.length === 0) {
      console.log('Пользователь Виталий не найден');
      return;
    }

    // Исправляем статус для всех найденных пользователей Виталия
    for (const user of users) {
      console.log(`\nИсправляем пользователя: ${user.firstName} ${user.lastName} (${user.id})`);
      console.log(`Текущий статус: role=${user.role}, membershipStatus=${user.membershipStatus}`);

      const updated = await prisma.user.update({
        where: { id: user.id },
        data: {
          role: 'MEMBER',
          membershipStatus: 'APPROVED',
        },
      });

      console.log(`✅ Обновлен: role=${updated.role}, membershipStatus=${updated.membershipStatus}`);
    }

    console.log('\n✅ Все пользователи Виталия исправлены');
  } catch (error) {
    console.error('Ошибка:', error);
  } finally {
    await prisma.$disconnect();
  }
}

fixVitalyUser();
