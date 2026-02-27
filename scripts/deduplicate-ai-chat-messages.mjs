/**
 * Удаляет дубликаты сообщений в чатах «ИИ-Ассистент».
 * Дубликат: два подряд идущих сообщения с одинаковым content и messageType,
 * созданные в течение 60 секунд (двойная отправка).
 * Оставляем первое, удаляем второе.
 */
import { PrismaClient } from "@prisma/client";
import { config } from "dotenv";
import { resolve } from "path";

config({ path: resolve(process.cwd(), ".env.local") });

const prisma = new PrismaClient();

const AI_CHAT_NAME = "ИИ-Ассистент";
const MAX_SECONDS_BETWEEN_DUPLICATES = 60;

async function main() {
  console.log("🔎 Поиск чатов ИИ-Ассистент...");

  const aiChats = await prisma.chat.findMany({
    where: {
      type: "PRIVATE",
      name: AI_CHAT_NAME,
    },
    select: {
      id: true,
      lastMessageId: true,
      lastMessageAt: true,
    },
  });

  if (aiChats.length === 0) {
    console.log("ℹ️ Чаты ИИ-Ассистент не найдены.");
    return;
  }

  console.log(`📦 Найдено чатов: ${aiChats.length}`);
  let totalDeleted = 0;
  let chatsAffected = 0;

  for (const chat of aiChats) {
    const messages = await prisma.chatMessage.findMany({
      where: { chatId: chat.id, threadRootId: null },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        content: true,
        messageType: true,
        createdAt: true,
      },
    });

    if (messages.length < 2) continue;

    const idsToDelete = [];
    for (let i = 1; i < messages.length; i++) {
      const prev = messages[i - 1];
      const curr = messages[i];
      const sameContent = prev.content === curr.content;
      const sameType = prev.messageType === curr.messageType;
      const timeDiffMs = new Date(curr.createdAt) - new Date(prev.createdAt);
      const withinWindow = timeDiffMs >= 0 && timeDiffMs <= MAX_SECONDS_BETWEEN_DUPLICATES * 1000;

      if (sameContent && sameType && withinWindow) {
        idsToDelete.push(curr.id);
      }
    }

    if (idsToDelete.length === 0) continue;

    const idsSet = new Set(idsToDelete);
    const remaining = messages.filter((m) => !idsSet.has(m.id));
    const newLast = remaining.length > 0 ? remaining[remaining.length - 1] : null;

    await prisma.$transaction(async (tx) => {
      await tx.chatMessage.deleteMany({
        where: { id: { in: idsToDelete } },
      });
      const updateData = {};
      if (chat.lastMessageId && idsSet.has(chat.lastMessageId)) {
        if (newLast) {
          updateData.lastMessageId = newLast.id;
          updateData.lastMessageAt = newLast.createdAt;
        } else {
          updateData.lastMessageId = null;
          updateData.lastMessageAt = null;
        }
      }
      if (Object.keys(updateData).length > 0) {
        await tx.chat.update({
          where: { id: chat.id },
          data: updateData,
        });
      }
    });

    totalDeleted += idsToDelete.length;
    chatsAffected += 1;
    console.log(`  Чат ${chat.id}: удалено дубликатов: ${idsToDelete.length}`);
  }

  console.log("\n🎉 Готово.");
  console.log(`   Чатов обработано с дубликатами: ${chatsAffected}`);
  console.log(`   Удалено сообщений-дубликатов: ${totalDeleted}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
