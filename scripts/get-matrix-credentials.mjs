import { PrismaClient } from "@prisma/client";
import dotenv from "dotenv";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: join(__dirname, "..", ".env.local") });

const prisma = new PrismaClient();

async function main() {
  const args = process.argv.slice(2);
  const identifier = args[0]; // email или user ID

  if (!identifier) {
    console.log("❌ Использование: node scripts/get-matrix-credentials.mjs <email|userId>");
    console.log("Пример: node scripts/get-matrix-credentials.mjs user@example.com");
    console.log("Пример: node scripts/get-matrix-credentials.mjs cmke9bxsc002s1ypyd8vt4yco");
    process.exit(1);
  }

  try {
    // Пытаемся найти по email или ID
    const user = await prisma.user.findFirst({
      where: {
        OR: [
          { email: identifier },
          { id: identifier },
        ],
      },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        matrixUserId: true,
        matrixAccessToken: true,
      },
    });

    if (!user) {
      console.log(`❌ Пользователь "${identifier}" не найден в базе данных.`);
      process.exit(1);
    }

    console.log("\n✅ Пользователь найден:");
    console.log(`   ID: ${user.id}`);
    console.log(`   Email: ${user.email || "не указан"}`);
    console.log(`   Имя: ${[user.firstName, user.lastName].filter(Boolean).join(" ") || "не указано"}`);

    if (user.matrixUserId && user.matrixAccessToken) {
      console.log("\n✅ Matrix учетные данные найдены:");
      console.log(`   Matrix User ID: ${user.matrixUserId}`);
      console.log(`   Access Token: ${user.matrixAccessToken.substring(0, 20)}...${user.matrixAccessToken.substring(user.matrixAccessToken.length - 10)}`);
      console.log(`   Server URL: https://matrix.myunion.pro`);
      
      // Извлекаем username из matrixUserId (формат: @username:matrix.myunion.pro)
      const username = user.matrixUserId.split(":")[0].replace("@", "");
      console.log(`\n📝 Для входа через веб-интерфейс:`);
      console.log(`   URL: https://matrix.myunion.pro/#/login`);
      console.log(`   Username: ${username}`);
      console.log(`   ⚠️  Пароль не сохраняется в БД (генерируется автоматически)`);
      console.log(`   💡 Используйте Access Token для API или создайте новый пароль через админ-панель Matrix`);
      
      console.log(`\n🔑 Для использования через API:`);
      console.log(`   Authorization: Bearer ${user.matrixAccessToken}`);
      console.log(`   Server: https://matrix.myunion.pro`);
      console.log(`   User ID: ${user.matrixUserId}`);
    } else {
      console.log("\n⚠️  Matrix учетные данные не найдены.");
      console.log("   Matrix аккаунт будет создан автоматически при первом входе в чат.");
      console.log("   Или используйте API: POST /api/chat/matrix/auth");
    }

    // Проверяем переменные окружения для бота
    console.log("\n🤖 Matrix Bot конфигурация:");
    console.log(`   MATRIX_SERVER_URL: ${process.env.MATRIX_SERVER_URL || "не установлен (используется https://matrix.myunion.pro)"}`);
    console.log(`   MATRIX_BOT_TOKEN: ${process.env.MATRIX_BOT_TOKEN ? "✅ установлен" : "❌ не установлен"}`);
    console.log(`   MATRIX_ADMIN_TOKEN: ${process.env.MATRIX_ADMIN_TOKEN ? "✅ установлен" : "❌ не установлен"}`);

  } catch (error) {
    console.error("❌ Ошибка:", error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
