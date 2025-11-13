import { PrismaClient } from "@prisma/client";
import dotenv from "dotenv";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: join(__dirname, "..", ".env.local") });

const prisma = new PrismaClient();

async function main() {
  try {
    const user = await prisma.user.findUnique({
      where: { email: "ceo@yappix.ru" },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
        membershipStatus: true,
        createdAt: true,
      },
    });

    if (user) {
      console.log("✅ Пользователь найден:");
      console.log(JSON.stringify(user, null, 2));
      console.log("\n⚠️ Пароли хэшированы и не могут быть прочитаны.");
      console.log("💡 Используйте функцию сброса пароля или создайте нового пользователя.");
    } else {
      console.log("❌ Пользователь ceo@yappix.ru не найден в базе данных.");
    }
  } catch (error) {
    console.error("Ошибка:", error);
  } finally {
    await prisma.$disconnect();
  }
}

main();
