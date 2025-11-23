import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function fixUserProfile() {
  const email = process.argv[2];
  
  if (!email) {
    console.error('❌ Usage: node scripts/fix-user-profile.mjs <email>');
    process.exit(1);
  }

  try {
    console.log(`🔍 Finding user: ${email}`);
    
    const user = await prisma.user.findUnique({
      where: { email },
      include: {
        documents: {
          where: {
            type: {
              in: ['MEMBERSHIP_APPLICATION', 'CONTRIBUTION_APPLICATION']
            }
          }
        }
      }
    });

    if (!user) {
      console.error(`❌ User ${email} not found`);
      process.exit(1);
    }

    console.log('\n📊 Current profile data:');
    console.log('  First Name:', user.firstName);
    console.log('  Last Name:', user.lastName);
    console.log('  Middle Name:', user.middleName);
    console.log('  Address:', user.address);
    console.log('  Region:', user.region);
    console.log('  Documents:', user.documents.length);

    // Проверяем на географические названия в ФИО
    const geoWords = [
      'Республика', 'Область', 'Край', 'Округ', 'Регион', 'Город',
      'Татарстан', 'Башкортостан', 'Москва', 'Казань', 'Санкт', 'Петербург'
    ];

    const hasGeoInName = 
      (user.firstName && geoWords.some(word => user.firstName?.includes(word))) ||
      (user.lastName && geoWords.some(word => user.lastName?.includes(word))) ||
      (user.middleName && geoWords.some(word => user.middleName?.includes(word)));

    if (hasGeoInName) {
      console.log('\n⚠️  FOUND GEOGRAPHIC NAMES IN FIO!');
      console.log('🧹 Cleaning up...');

      const updates = {};
      
      if (user.firstName && geoWords.some(word => user.firstName?.includes(word))) {
        updates.firstName = null;
        console.log('  ❌ Clearing firstName:', user.firstName);
      }
      
      if (user.lastName && geoWords.some(word => user.lastName?.includes(word))) {
        updates.lastName = null;
        console.log('  ❌ Clearing lastName:', user.lastName);
      }
      
      if (user.middleName && geoWords.some(word => user.middleName?.includes(word))) {
        updates.middleName = null;
        console.log('  ❌ Clearing middleName:', user.middleName);
      }

      await prisma.user.update({
        where: { id: user.id },
        data: updates
      });

      console.log('\n✅ Profile cleaned!');
    } else {
      console.log('\n✅ Profile looks good - no geographic names in FIO');
    }

    // Удаляем неправильно сгенерированные документы если нужно
    if (user.documents.length > 0) {
      console.log('\n🗑️  Deleting incorrectly generated documents...');
      await prisma.document.deleteMany({
        where: {
          userId: user.id,
          type: {
            in: ['MEMBERSHIP_APPLICATION', 'CONTRIBUTION_APPLICATION']
          }
        }
      });
      console.log(`  ✅ Deleted ${user.documents.length} documents`);
    }

    console.log('\n✅ Done! User can now fill profile correctly through bot.');
    
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

fixUserProfile();

