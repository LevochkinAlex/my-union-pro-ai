import { PrismaClient } from "@prisma/client";
import dotenv from "dotenv";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: join(__dirname, "..", ".env.local") });

const prisma = new PrismaClient();

async function restoreSessions() {
  try {
    console.log("🔧 Восстановление сессий для пользователей...\n");

    const sessionsToRestore = [
      {
        userId: "cmiew08jp000lptm8tfqu4ofg", // Ренат
        correctSessionId: "cmiew0lbd000zptm8g20yu4pl", // 37 сообщений
        wrongSessionId: "cmiew0leh0011ptm8j9y5w5r2", // 1 сообщение
        userName: "Ренат Усманов",
      },
      {
        userId: "cmievz3tp0004ptm8nwjk21wa", // Виталий
        correctSessionId: "cmievzhsg0008ptm8mg8077sy", // 41 сообщение
        wrongSessionId: "cmievzhsp000aptm8ncjz6fa7", // 1 сообщение
        userName: "Виталий Еременко",
      },
    ];

    for (const item of sessionsToRestore) {
      console.log(`\n${"=".repeat(80)}`);
      console.log(`👤 Восстановление для: ${item.userName}`);
      console.log(`${"=".repeat(80)}`);

      // 1. Обновляем updatedAt для правильной сессии на текущее время
      const correctSession = await prisma.chatSession.update({
        where: { id: item.correctSessionId },
        data: { updatedAt: new Date() },
        include: {
          _count: {
            select: { messages: true },
          },
        },
      });

      console.log(`\n✅ Обновлена правильная сессия:`);
      console.log(`   ID: ${correctSession.id}`);
      console.log(`   Сообщений: ${correctSession._count.messages}`);
      console.log(`   Теперь будет первой при входе`);

      // 2. Удаляем пустую сессию
      const deletedMessages = await prisma.chatMessage.deleteMany({
        where: { sessionId: item.wrongSessionId },
      });

      const deletedSession = await prisma.chatSession.delete({
        where: { id: item.wrongSessionId },
      });

      console.log(`\n🗑️  Удалена пустая сессия:`);
      console.log(`   ID: ${deletedSession.id}`);
      console.log(`   Удалено сообщений: ${deletedMessages.count}`);

      console.log(`\n✅ ${item.userName}: Восстановление завершено!`);
      console.log(`   Ссылка: https://myunion.pro/dashboard?session=${item.correctSessionId}`);
    }

    console.log(`\n${"=".repeat(80)}`);
    console.log("✅ Все сессии восстановлены!");
    console.log(`${"=".repeat(80)}\n`);

    // Проверяем результат
    console.log("📊 Проверка результата:\n");
    for (const item of sessionsToRestore) {
      const sessions = await prisma.chatSession.findMany({
        where: { userId: item.userId },
        orderBy: { updatedAt: "desc" },
        select: {
          id: true,
          title: true,
          updatedAt: true,
          _count: {
            select: { messages: true },
          },
        },
      });

      console.log(`${item.userName}:`);
      sessions.forEach((s, idx) => {
        console.log(`  ${idx + 1}. ${s.id} (${s._count.messages} сообщений) - ${s.updatedAt}`);
      });
      console.log();
    }
  } catch (error) {
    console.error("❌ Ошибка:", error);
  } finally {
    await prisma.$disconnect();
  }
}

restoreSessions();

