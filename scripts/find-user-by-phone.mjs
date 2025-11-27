import { PrismaClient } from '@prisma/client';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: join(__dirname, '..', '.env.local') });

const prisma = new PrismaClient();

async function findUser() {
  const phone = '+79874157897';
  const variants = [
    phone,
    phone.replace('+', ''),
    phone.replace('+7', '7'),
    phone.replace('+7', '8'),
    '79874157897',
    '89874157897',
    '79874157897',
  ];
  
  console.log('🔍 Поиск пользователя по разным вариантам номера:');
  
  for (const variant of variants) {
    const user = await prisma.user.findUnique({
      where: { phone: variant },
      select: {
        id: true,
        phone: true,
        email: true,
        telegramChatId: true,
        createdAt: true,
      },
    });
    
    if (user) {
      console.log(`✅ Найден пользователь с номером "${variant}":`, JSON.stringify(user, null, 2));
    }
  }
  
  // Также поищем всех пользователей с похожими номерами
  console.log('\n🔍 Поиск всех пользователей с номерами, содержащими "79874157897":');
  const allUsers = await prisma.user.findMany({
    where: {
      phone: {
        contains: '79874157897',
      },
    },
    select: {
      id: true,
      phone: true,
      email: true,
      telegramChatId: true,
      createdAt: true,
    },
  });
  
  if (allUsers.length > 0) {
    console.log(`Найдено пользователей: ${allUsers.length}`);
    allUsers.forEach(user => {
      console.log(JSON.stringify(user, null, 2));
    });
  } else {
    console.log('Пользователи не найдены');
  }
  
  await prisma.$disconnect();
}

findUser().catch(console.error);
