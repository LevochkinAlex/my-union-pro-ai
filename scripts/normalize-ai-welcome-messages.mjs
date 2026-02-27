import { PrismaClient } from "@prisma/client";
import { config } from "dotenv";
import { resolve } from "path";

config({ path: resolve(process.cwd(), ".env.local") });

const prisma = new PrismaClient();

const CANONICAL_AI_CHAT_NAME = "ИИ-Ассистент";
const OLD_WELCOME_PREFIX = "Здравствуйте! Я - помощник МойСоюз";
const NEW_WELCOME_PREFIX = "Здравствуйте! Я ИИ-Ассистент МойСоюз";

async function refreshLastMessage(tx, chatId) {
  const latest = await tx.chatMessage.findFirst({
    where: { chatId },
    orderBy: { createdAt: "desc" },
    select: { id: true, createdAt: true },
  });

  await tx.chat.update({
    where: { id: chatId },
    data: {
      lastMessageId: latest?.id ?? null,
      lastMessageAt: latest?.createdAt ?? null,
    },
  });
}

async function main() {
  const chats = await prisma.chat.findMany({
    where: { type: "PRIVATE", name: CANONICAL_AI_CHAT_NAME },
    select: { id: true },
  });

  let affectedChats = 0;
  let deletedMessages = 0;

  for (const chat of chats) {
    await prisma.$transaction(async (tx) => {
      const messages = await tx.chatMessage.findMany({
        where: { chatId: chat.id },
        orderBy: { createdAt: "asc" },
        select: { id: true, content: true },
      });

      const hasNewWelcome = messages.some((m) =>
        String(m.content || "").startsWith(NEW_WELCOME_PREFIX)
      );

      if (!hasNewWelcome) return;

      const oldWelcomeMessages = messages.filter((m) =>
        String(m.content || "").startsWith(OLD_WELCOME_PREFIX)
      );

      if (oldWelcomeMessages.length === 0) return;

      const toDeleteIds = oldWelcomeMessages.map((m) => m.id);
      const result = await tx.chatMessage.deleteMany({
        where: { id: { in: toDeleteIds } },
      });

      if (result.count > 0) {
        affectedChats += 1;
        deletedMessages += result.count;
        await refreshLastMessage(tx, chat.id);
      }
    });
  }

  console.log("🎉 Нормализация приветствий завершена.");
  console.log(`   Чатов изменено: ${affectedChats}`);
  console.log(`   Удалено старых приветствий: ${deletedMessages}`);
}

main()
  .catch((error) => {
    console.error("❌ Ошибка нормализации:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

