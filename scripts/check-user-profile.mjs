import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function checkUserProfile() {
  const email = process.argv[2] || 'ceo@yappix.ru';

  try {
    const user = await prisma.user.findUnique({
      where: { email },
      include: {
        documents: {
          orderBy: { createdAt: 'desc' }
        },
        chatSessions: {
          include: {
            messages: {
              orderBy: { createdAt: 'desc' },
              take: 10
            }
          },
          orderBy: { createdAt: 'desc' },
          take: 1
        }
      }
    });

    if (!user) {
      console.error('❌ User not found:', email);
      process.exit(1);
    }

    console.log('📊 ПОЛНАЯ ИНФОРМАЦИЯ О ПОЛЬЗОВАТЕЛЕ');
    console.log('=' .repeat(60));
    console.log('\n📋 Основные данные:');
    console.log('  Email:', user.email);
    console.log('  First Name:', user.firstName || '❌ НЕТ');
    console.log('  Last Name:', user.lastName || '❌ НЕТ');
    console.log('  Middle Name:', user.middleName || '❌ НЕТ');
    console.log('  Date of Birth:', user.dateOfBirth || '❌ НЕТ');
    console.log('  Phone:', user.phone || '❌ НЕТ');
    console.log('  Address:', user.address || '❌ НЕТ');
    console.log('  Region:', user.region || '❌ НЕТ');
    
    console.log('\n💼 Профессиональная информация:');
    console.log('  Job Title:', user.jobTitle || '❌ НЕТ');
    console.log('  Profession:', user.profession || '❌ НЕТ');
    console.log('  Education:', user.education || '❌ НЕТ');
    
    console.log('\n🏙️ Предпочтения:');
    console.log('  Preferred Discount City:', user.preferredDiscountCity || '❌ НЕТ');
    
    console.log('\n📄 Документы (' + user.documents.length + '):');
    if (user.documents.length === 0) {
      console.log('  ❌ Документов нет');
    } else {
      user.documents.forEach(d => {
        console.log(`  - [${d.type}] ${d.title} (${d.status})`);
      });
    }
    
    console.log('\n💬 Последние сообщения в чате:');
    if (user.chatSessions.length === 0 || user.chatSessions[0].messages.length === 0) {
      console.log('  ❌ Сообщений нет');
    } else {
      user.chatSessions[0].messages.forEach((m, i) => {
        const preview = m.content.length > 100 
          ? m.content.substring(0, 100) + '...' 
          : m.content;
        console.log(`\n  ${i + 1}. [${m.role.toUpperCase()}]:`);
        console.log(`     ${preview}`);
      });
    }
    
    console.log('\n' + '='.repeat(60));
    
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

checkUserProfile();

