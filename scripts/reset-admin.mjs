import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function resetAdmin() {
  const email = "support@myunion.pro";
  const password = "Admin@123456";

  try {
    // Удаляем старого админа
    await prisma.user.deleteMany({
      where: { email },
    });
    console.log(`✅ Удален старый админ ${email}`);

    // Создаём нового с новым паролем
    const hashedPassword = await bcrypt.hash(password, 10);

    await prisma.user.create({
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

    console.log(`✅ Создан новый супер-администратор:`);
    console.log(`   Email: ${email}`);
    console.log(`   Пароль: ${password}`);
  } catch (error) {
    console.error("❌ Ошибка:", error);
  } finally {
    await prisma.$disconnect();
  }
}

resetAdmin();

