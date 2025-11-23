import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function restoreProfile() {
  const email = 'ceo@yappix.ru';
  
  try {
    console.log('🔄 Restoring profile for:', email);
    
    const user = await prisma.user.findUnique({
      where: { email }
    });
    
    if (!user) {
      console.error('❌ User not found');
      process.exit(1);
    }
    
    // Данные из истории чата
    const correctData = {
      firstName: 'Виталий',
      lastName: 'Еременко',
      middleName: 'Николаевич',
      dateOfBirth: new Date('1980-08-19'),
      phone: '+7 (963) 977-12-86',
      address: 'Москва, Производственная 8к2',
      jobTitle: 'Зампред',
      profession: 'Сторож высшего разряда',
      education: 'Основное общее (9 классов)',
      region: 'Москва'
    };
    
    console.log('\n📝 Restoring data:');
    Object.entries(correctData).forEach(([key, value]) => {
      console.log(`  ${key}: ${value}`);
    });
    
    await prisma.user.update({
      where: { id: user.id },
      data: correctData
    });
    
    console.log('\n✅ Profile restored successfully!');
    
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

restoreProfile();

