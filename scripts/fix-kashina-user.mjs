import { PrismaClient, MembershipStatus, UserRole } from '@prisma/client';
import { config } from 'dotenv';
import { resolve } from 'path';

// Load environment variables
config({ path: resolve(process.cwd(), '.env.local') });

const prisma = new PrismaClient();

async function fixKashinaUser() {
  try {
    console.log('🔍 Ищем пользователя Кашина Алина Сергеевна...\n');

    // Находим пользователя
    const user = await prisma.user.findFirst({
      where: {
        OR: [
          { lastName: { contains: 'Кашина', mode: 'insensitive' } },
          { firstName: { contains: 'Алина', mode: 'insensitive' } },
          { email: { contains: 'kashina', mode: 'insensitive' } },
          { email: { contains: 'asavasina', mode: 'insensitive' } },
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
        avatarUrl: true,
        emailVerified: true,
        phone: true,
        matrixUserId: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!user) {
      console.log('❌ Пользователь не найден');
      return;
    }

    console.log('📋 Найден пользователь:');
    console.log(JSON.stringify(user, null, 2));
    console.log('');

    // Проверяем текущий статус
    const needsUpdate = user.membershipStatus !== MembershipStatus.APPROVED || 
                        user.role === UserRole.PENDING_MEMBER;

    if (!needsUpdate) {
      console.log('✅ Пользователь уже имеет правильный статус');
      console.log(`   Role: ${user.role}`);
      console.log(`   MembershipStatus: ${user.membershipStatus}`);
      
      // Проверяем аватар
      if (!user.avatarUrl) {
        console.log('\n⚠️  У пользователя нет аватара');
        console.log('   Нужно загрузить аватар в профиле');
      } else {
        console.log(`\n✅ Аватар: ${user.avatarUrl}`);
      }
      
      return;
    }

    // Обновляем статус
    console.log('🔧 Обновляем статус пользователя...');
    console.log(`   Текущий: role=${user.role}, membershipStatus=${user.membershipStatus}`);
    
    await prisma.user.update({
      where: { id: user.id },
      data: {
        role: UserRole.MEMBER,
        membershipStatus: MembershipStatus.APPROVED,
      },
    });

    console.log(`   Новый: role=MEMBER, membershipStatus=APPROVED`);
    console.log('✅ Статус обновлен');

    // Проверяем аватар
    if (!user.avatarUrl) {
      console.log('\n⚠️  У пользователя нет аватара');
      console.log('   Пользователю нужно загрузить аватар в профиле');
    } else {
      console.log(`\n✅ Аватар: ${user.avatarUrl}`);
    }

    // Проверяем обращения пользователя
    console.log('\n📋 Проверяем обращения пользователя...');
    const tickets = await prisma.ticket.findMany({
      where: { userId: user.id },
      select: {
        id: true,
        publicId: true,
        type: true,
        status: true,
        title: true,
        createdAt: true,
      },
    });

    console.log(`   Найдено обращений: ${tickets.length}`);
    if (tickets.length > 0) {
      console.log('   Обращения:');
      tickets.forEach(t => {
        console.log(`     - #${t.publicId}: ${t.title} (${t.status})`);
      });
    }

  } catch (error) {
    console.error('❌ Ошибка:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

fixKashinaUser()
  .then(() => {
    console.log('\n✅ Проверка завершена');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Критическая ошибка:', error);
    process.exit(1);
  });
