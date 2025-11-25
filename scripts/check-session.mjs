import { PrismaClient } from "@prisma/client";
import dotenv from "dotenv";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: join(__dirname, "..", ".env.local") });

const prisma = new PrismaClient();

async function checkSession() {
  const sessionId = "cmiew0leh0011ptm8j9y5w5r2";
  const userEmail = "9061109990@mail.ru";

  try {
    // Находим пользователя
    const user = await prisma.user.findUnique({
      where: { email: userEmail },
      select: { id: true, email: true, firstName: true, lastName: true },
    });

    if (!user) {
      console.log(`❌ Пользователь ${userEmail} не найден`);
      return;
    }

    console.log("\n👤 Пользователь:");
    console.log("  ID:", user.id);
    console.log("  Email:", user.email);
    console.log("  Имя:", user.firstName, user.lastName);

    // Находим сессию
    const session = await prisma.chatSession.findUnique({
      where: { id: sessionId },
      select: {
        id: true,
        title: true,
        type: true,
        userId: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!session) {
      console.log(`\n❌ Сессия ${sessionId} не найдена`);
      return;
    }

    console.log("\n💬 Сессия:");
    console.log("  ID:", session.id);
    console.log("  Title:", session.title);
    console.log("  Type:", session.type);
    console.log("  User ID:", session.userId);
    console.log("  Created:", session.createdAt);
    console.log("  Updated:", session.updatedAt);
    console.log("  ⚠️ Принадлежит пользователю:", session.userId === user.id ? "✅ ДА" : "❌ НЕТ");

    // Получаем все сообщения этой сессии (без фильтра по userId)
    const allMessages = await prisma.chatMessage.findMany({
      where: { sessionId: sessionId },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        role: true,
        content: true,
        userId: true,
        createdAt: true,
      },
    });

    console.log("\n📝 Все сообщения в сессии:", allMessages.length);
    if (allMessages.length > 0) {
      allMessages.forEach((msg, idx) => {
        console.log(`\n  [${idx + 1}] ${msg.role} (${msg.userId === user.id ? "✅ User's" : "❌ Not user's"})`);
        console.log(`      User ID: ${msg.userId}`);
        console.log(`      Created: ${msg.createdAt}`);
        console.log(`      Content: ${msg.content.substring(0, 100)}...`);
      });
    }

    // Получаем сообщения с фильтром по userId (как в API)
    const userMessages = await prisma.chatMessage.findMany({
      where: {
        sessionId: sessionId,
        userId: user.id,
      },
      orderBy: { createdAt: "asc" },
    });

    console.log("\n📊 Сообщения с фильтром по userId:", userMessages.length);
    
    if (allMessages.length > 0 && userMessages.length === 0) {
      console.log("\n⚠️⚠️⚠️ ПРОБЛЕМА НАЙДЕНА:");
      console.log("  В сессии есть сообщения, но они связаны с другим userId!");
      console.log("  Все сообщения принадлежат userId:", allMessages[0].userId);
      console.log("  Текущий пользователь имеет userId:", user.id);
      console.log("\n💡 РЕШЕНИЕ: Нужно обновить userId в сообщениях или исправить логику фильтрации");
    }

  } catch (error) {
    console.error("❌ Ошибка:", error);
  } finally {
    await prisma.$disconnect();
  }
}

checkSession();

