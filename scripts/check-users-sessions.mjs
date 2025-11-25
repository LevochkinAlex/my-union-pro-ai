import { PrismaClient } from "@prisma/client";
import dotenv from "dotenv";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: join(__dirname, "..", ".env.local") });

const prisma = new PrismaClient();

async function checkUsersSessions() {
  const userEmails = ["9061109990@mail.ru", "talik@mail.ru"];

  try {
    for (const email of userEmails) {
      console.log("\n" + "=".repeat(80));
      console.log(`👤 Проверка пользователя: ${email}`);
      console.log("=".repeat(80));

      const user = await prisma.user.findUnique({
        where: { email },
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          createdAt: true,
        },
      });

      if (!user) {
        console.log(`❌ Пользователь ${email} не найден`);
        continue;
      }

      console.log("\n📋 Данные пользователя:");
      console.log("  ID:", user.id);
      console.log("  Имя:", user.firstName, user.lastName);
      console.log("  Создан:", user.createdAt);

      // Получаем все сессии пользователя
      const sessions = await prisma.chatSession.findMany({
        where: { userId: user.id },
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          title: true,
          type: true,
          createdAt: true,
          updatedAt: true,
          _count: {
            select: { messages: true },
          },
        },
      });

      console.log(`\n💬 Всего сессий: ${sessions.length}`);

      if (sessions.length > 0) {
        for (const session of sessions) {
          console.log(`\n  📝 Сессия: ${session.id}`);
          console.log(`     Название: ${session.title || "Без названия"}`);
          console.log(`     Тип: ${session.type}`);
          console.log(`     Создана: ${session.createdAt}`);
          console.log(`     Обновлена: ${session.updatedAt}`);
          console.log(`     Сообщений: ${session._count.messages}`);

          // Получаем первые 3 сообщения из каждой сессии
          const messages = await prisma.chatMessage.findMany({
            where: { sessionId: session.id },
            orderBy: { createdAt: "asc" },
            take: 3,
            select: {
              id: true,
              role: true,
              content: true,
              createdAt: true,
              userId: true,
            },
          });

          if (messages.length > 0) {
            console.log(`\n     Первые ${messages.length} сообщения:`);
            messages.forEach((msg, idx) => {
              const preview = msg.content.substring(0, 80).replace(/\n/g, " ");
              console.log(`       ${idx + 1}. [${msg.role}] ${preview}...`);
              console.log(`          User ID: ${msg.userId} ${msg.userId === user.id ? "✅" : "❌ НЕ СОВПАДАЕТ!"}`);
              console.log(`          Создано: ${msg.createdAt}`);
            });
          } else {
            console.log("     ⚠️ Сообщений нет!");
          }
        }
      }

      // Проверяем сообщения без привязки к сессии (потерянные сообщения)
      const orphanMessages = await prisma.chatMessage.findMany({
        where: {
          userId: user.id,
          sessionId: null,
        },
        select: {
          id: true,
          role: true,
          content: true,
          createdAt: true,
        },
      });

      if (orphanMessages.length > 0) {
        console.log(`\n⚠️ Найдено ${orphanMessages.length} потерянных сообщений (без sessionId):`);
        orphanMessages.forEach((msg, idx) => {
          const preview = msg.content.substring(0, 60).replace(/\n/g, " ");
          console.log(`  ${idx + 1}. [${msg.role}] ${preview}...`);
        });
      }

      // Проверяем сообщения с неправильным userId
      const allSessions = await prisma.chatSession.findMany({
        where: { userId: user.id },
        select: { id: true },
      });

      if (allSessions.length > 0) {
        const sessionIds = allSessions.map((s) => s.id);
        const wrongUserMessages = await prisma.chatMessage.findMany({
          where: {
            sessionId: { in: sessionIds },
            userId: { not: user.id },
          },
          select: {
            id: true,
            sessionId: true,
            userId: true,
            role: true,
            content: true,
            createdAt: true,
          },
        });

        if (wrongUserMessages.length > 0) {
          console.log(`\n⚠️⚠️⚠️ Найдено ${wrongUserMessages.length} сообщений с неправильным userId:`);
          console.log("Эти сообщения принадлежат сессиям пользователя, но имеют другой userId!");
          
          wrongUserMessages.forEach((msg, idx) => {
            const preview = msg.content.substring(0, 60).replace(/\n/g, " ");
            console.log(`  ${idx + 1}. Session: ${msg.sessionId}`);
            console.log(`     Wrong User ID: ${msg.userId} (should be: ${user.id})`);
            console.log(`     [${msg.role}] ${preview}...`);
          });
        }
      }
    }

    console.log("\n" + "=".repeat(80));
    console.log("✅ Проверка завершена");
    console.log("=".repeat(80));
  } catch (error) {
    console.error("❌ Ошибка:", error);
  } finally {
    await prisma.$disconnect();
  }
}

checkUsersSessions();

