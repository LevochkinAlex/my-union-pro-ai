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
  const normalizedPhone = phone.replace(/[\s\+\-\(\)]/g, '');
  
  console.log(`🔍 Проверка пользователя с номером: ${phone} (${normalizedPhone})`);
  
  const user = await prisma.user.findUnique({
    where: { phone: normalizedPhone },
    select: {
      id: true,
      phone: true,
      telegramChatId: true,
      telegramUsername: true,
      maxChatId: true,
      maxUsername: true,
      email: true,
    },
  });
  
  if (user) {
    console.log('✅ Пользователь найден:');
    console.log(JSON.stringify(user, null, 2));
  } else {
    console.log('❌ Пользователь не найден в БД');
  }
  
  await prisma.$disconnect();
}

checkUser().catch(console.error);
