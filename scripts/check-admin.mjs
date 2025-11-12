import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function checkAdmin() {
  const email = "support@myunion.pro";
  const testPassword = "Admin@123456";

  try {
    const user = await prisma.user.findUnique({
      where: { email },
      select: {
        id: true,
        email: true,
        password: true,
        role: true,
        membershipStatus: true,
      },
    });

    if (!user) {
      console.log(`❌ Пользователь ${email} не найден в БД`);
      return;
    }

    console.log(`✅ Пользователь найден:`);
    console.log(`   Email: ${user.email}`);
    console.log(`   Role: ${user.role}`);
    console.log(`   Status: ${user.membershipStatus}`);
    console.log(`   Password hash: ${user.password?.substring(0, 20)}...`);

    if (!user.password) {
      console.log(`❌ Пароль НЕ сохранён в БД!`);
      return;
    }

    const isValidPassword = await bcrypt.compare(testPassword, user.password);
    console.log(`\n🔐 Проверка пароля "${testPassword}": ${isValidPassword ? "✅ ВЕРНО" : "❌ НЕВЕРНО"}`);
  } catch (error) {
    console.error("❌ Ошибка:", error);
  } finally {
    await prisma.$disconnect();
  }
}

checkAdmin();
