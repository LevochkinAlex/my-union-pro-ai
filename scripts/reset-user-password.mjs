import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import dotenv from "dotenv";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: join(__dirname, "..", ".env.local") });

const prisma = new PrismaClient();

const EMAIL = "ceo@yappix.ru";
const NEW_PASSWORD = "password123"; // Измените на нужный пароль

async function main() {
  try {
    const user = await prisma.user.findUnique({
      where: { email: EMAIL },
    });

    if (!user) {
      console.log(`❌ Пользователь ${EMAIL} не найден.`);
      process.exit(1);
    }

    const hashedPassword = await bcrypt.hash(NEW_PASSWORD, 10);

    await prisma.user.update({
      where: { email: EMAIL },
      data: {
        password: hashedPassword,
        resetToken: null,
        resetTokenExpires: null,
      },
    });

    console.log(`✅ Пароль для ${EMAIL} успешно обновлён!`);
    console.log(`📧 Email: ${EMAIL}`);
    console.log(`🔑 Пароль: ${NEW_PASSWORD}`);
    console.log(`\n⚠️ ВАЖНО: Измените пароль после первого входа!`);
  } catch (error) {
    console.error("Ошибка:", error);
  } finally {
    await prisma.$disconnect();
  }
}

main();
