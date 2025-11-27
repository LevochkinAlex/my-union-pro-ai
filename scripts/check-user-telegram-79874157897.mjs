import { PrismaClient } from '@prisma/client';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: join(__dirname, '..', '.env.local') });

const prisma = new PrismaClient();

async function checkUser() {
  const phone = '+79874157897';
  
  console.log(`🔍 Поиск пользователя с номером: ${phone}`);
  
  const user = await prisma.user.findFirst({
    where: {
      OR: [
        { phone: phone },
        { phone: phone.replace('+', '') },
        { phone: phone.replace('+7', '7') },
        { phone: phone.replace('+7', '8') },
      ],
    },
    select: {
      id: true,
      phone: true,
      email: true,
      telegramChatId: true,
      telegramUsername: true,
      maxChatId: true,
      createdAt: true,
    },
  });
  
  if (user) {
    console.log('✅ Пользователь найден:');
    console.log(JSON.stringify(user, null, 2));
    console.log('\n📱 Telegram:', user.telegramChatId ? `✅ Привязан (${user.telegramChatId})` : '❌ Не привязан');
    console.log('📱 MAX:', user.maxChatId ? `✅ Привязан (${user.maxChatId})` : '❌ Не привязан');
  } else {
    console.log('❌ Пользователь не найден в БД');
  }
  
  await prisma.$disconnect();
}

checkUser().catch(console.error);
