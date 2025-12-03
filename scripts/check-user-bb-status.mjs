import { PrismaClient } from "@prisma/client";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: join(__dirname, "..", ".env.local") });

const prisma = new PrismaClient();

async function checkUserBBStatus(email) {
  try {
    console.log(`\n🔍 Проверка статуса пользователя ${email}...\n`);

    const user = await prisma.user.findUnique({
      where: { email },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        avatarUrl: true,
        bestBenefitsUserId: true,
        bestBenefitsStatus: true,
        bestBenefitsCreatedAt: true,
        bestBenefitsPassword: true,
        emailVerified: true,
      },
    });

    if (!user) {
      console.log(`❌ Пользователь ${email} не найден в базе данных`);
      return;
    }

    console.log(`✅ Пользователь найден:`);
    console.log(`   ID: ${user.id}`);
    console.log(`   Email: ${user.email}`);
    console.log(`   Имя: ${user.firstName || "не указано"} ${user.lastName || ""}`);
    console.log(`   Email подтвержден: ${user.emailVerified ? "✅ Да" : "❌ Нет"}`);
    console.log(`   Avatar URL: ${user.avatarUrl ? (user.avatarUrl.length > 50 ? user.avatarUrl.substring(0, 50) + "..." : user.avatarUrl) : "не установлен"}`);
    console.log(`   Avatar URL длина: ${user.avatarUrl?.length || 0} символов`);
    console.log(`   Avatar URL тип: ${user.avatarUrl?.startsWith('data:') ? 'base64' : user.avatarUrl?.startsWith('http') ? 'URL' : 'другой'}`);

    console.log(`\n📊 Статус Best Benefits:`);
    console.log(`   BestBenefits User ID: ${user.bestBenefitsUserId || "❌ НЕ УСТАНОВЛЕН"}`);
    console.log(`   BestBenefits Status: ${user.bestBenefitsStatus || "❌ НЕ УСТАНОВЛЕН"}`);
    console.log(`   BestBenefits Created At: ${user.bestBenefitsCreatedAt ? new Date(user.bestBenefitsCreatedAt).toLocaleString('ru-RU') : "❌ НЕ УСТАНОВЛЕН"}`);
    console.log(`   BestBenefits Password: ${user.bestBenefitsPassword ? "✅ Сохранен (зашифрован)" : "❌ НЕ СОХРАНЕН"}`);

    if (!user.bestBenefitsUserId) {
      console.log(`\n⚠️  Пользователь НЕ синхронизирован с Best Benefits`);
      if (!user.emailVerified) {
        console.log(`   Причина: Email не подтвержден`);
      } else if (!user.firstName || !user.lastName) {
        console.log(`   Причина: Не заполнены ФИО`);
      } else {
        console.log(`   Причина: Неизвестна (возможно, требуется ручная синхронизация)`);
      }
    } else {
      console.log(`\n✅ Пользователь синхронизирован с Best Benefits`);
    }

  } catch (error) {
    console.error(`\n❌ Ошибка при проверке:`, error);
  } finally {
    await prisma.$disconnect();
  }
}

const email = process.argv[2] || "talik.e@mail.ru";
checkUserBBStatus(email);

