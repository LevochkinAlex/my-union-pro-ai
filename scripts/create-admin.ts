import { prisma } from "../lib/prisma";
import bcrypt from "bcryptjs";

async function createSuperAdmin() {
  const email = "support@myunion.pro";
  const password = "Admin@123456"; // Временный пароль, нужно изменить при первом входе

  try {
    // Хешируем пароль
    const hashedPassword = await bcrypt.hash(password, 10);

    // Проверяем, существует ли уже администратор
    const existingAdmin = await prisma.user.findUnique({
      where: { email },
    });

    if (existingAdmin) {
      console.log(`✅ Супер-администратор ${email} уже существует`);
      return;
    }

    // Создаем супер-администратора
    const admin = await prisma.user.create({
      data: {
        email,
        password: hashedPassword,
        role: "SUPER_ADMIN",
        membershipStatus: "APPROVED",
        emailVerified: new Date(),
        firstName: "Admin",
        lastName: "MyUnion",
      },
    });

    console.log(`✅ Супер-администратор создан:`);
    console.log(`   Email: ${email}`);
    console.log(`   Временный пароль: ${password}`);
    console.log(`   ⚠️  ВАЖНО: Измените пароль при первом входе!`);
  } catch (error) {
    console.error("❌ Ошибка при создании администратора:", error);
  } finally {
    await prisma.$disconnect();
  }
}

createSuperAdmin();

