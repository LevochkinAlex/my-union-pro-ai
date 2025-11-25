import { PrismaClient } from "@prisma/client";
import dotenv from "dotenv";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: join(__dirname, "..", ".env.local") });

const prisma = new PrismaClient();

async function updateSupportUser() {
  const email = "support@myunion.pro";

  try {
    const user = await prisma.user.findUnique({
      where: { email },
    });

    if (!user) {
      console.log(`❌ Пользователь ${email} не найден`);
      return;
    }

    console.log("Текущие данные пользователя:");
    console.log("  firstName:", user.firstName);
    console.log("  lastName:", user.lastName);
    console.log("  email:", user.email);

    // Обновляем данные
    await prisma.user.update({
      where: { email },
      data: {
        firstName: "Поддержка",
        lastName: "МойСоюз",
      },
    });

    console.log("\n✅ Данные успешно обновлены:");
    console.log("  firstName: Поддержка");
    console.log("  lastName: МойСоюз");
  } catch (error) {
    console.error("❌ Ошибка при обновлении:", error);
  } finally {
    await prisma.$disconnect();
  }
}

updateSupportUser();

