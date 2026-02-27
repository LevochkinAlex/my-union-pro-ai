import { PrismaClient } from "@prisma/client";
import { config } from "dotenv";
import { resolve } from "path";

config({ path: resolve(process.cwd(), ".env.local") });

const prisma = new PrismaClient();

const AI_CHAT_NAME = "ИИ-Ассистент";
const AI_BOT_EMAIL = "ai-assistant@myunion.pro";
const AI_CHAT_DESCRIPTION = "Персональный ИИ-помощник по профсоюзным вопросам";

async function getOrCreateCanonicalAIChat(tx, userId) {
  let chat = await tx.chat.findFirst({
    where: {
      type: "PRIVATE",
      name: AI_CHAT_NAME,
      participants: {
        some: { userId, leftAt: null },
      },
    },
    select: { id: true },
  });

  if (!chat) {
    chat = await tx.chat.create({
      data: {
        type: "PRIVATE",
        name: AI_CHAT_NAME,
        description: AI_CHAT_DESCRIPTION,
        isPublic: false,
        participants: {
          create: [{ userId, role: "member" }],
        },
      },
      select: { id: true },
    });
  }

  return chat.id;
}

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
  console.log("🔎 Поиск AI-бота...");
  const aiBot = await prisma.user.findUnique({
    where: { email: AI_BOT_EMAIL },
    select: { id: true, email: true },
  });

  if (!aiBot?.id) {
    throw new Error(`Не найден пользователь бота ${AI_BOT_EMAIL}`);
  }

  console.log(`✅ AI-бот найден: ${aiBot.id}`);
  console.log("🔎 Поиск старых веток AI-чата...");

  const candidateChats = await prisma.chat.findMany({
    where: {
      type: "PRIVATE",
      participants: {
        some: { userId: aiBot.id, leftAt: null },
      },
      OR: [{ name: null }, { name: { not: AI_CHAT_NAME } }],
    },
    select: {
      id: true,
      name: true,
      archivedAt: true,
      participants: {
        where: { leftAt: null },
        select: { userId: true },
      },
      _count: {
        select: { messages: true },
      },
    },
  });

  const branches = candidateChats
    .map((chat) => {
      const humanUsers = chat.participants
        .map((p) => p.userId)
        .filter((id) => !!id && id !== aiBot.id);
      if (humanUsers.length !== 1) return null;
      return { ...chat, userId: humanUsers[0] };
    })
    .filter(Boolean);

  if (branches.length === 0) {
    console.log("ℹ️ Старые AI-ветки не найдены.");
    return;
  }

  console.log(`📦 Найдено веток для миграции: ${branches.length}`);

  let mergedChats = 0;
  let movedMessages = 0;
  let skipped = 0;

  for (const branch of branches) {
    const oldChatId = branch.id;
    const userId = branch.userId;

    if (!userId) {
      skipped += 1;
      continue;
    }

    await prisma.$transaction(async (tx) => {
      const canonicalChatId = await getOrCreateCanonicalAIChat(tx, userId);

      if (canonicalChatId === oldChatId) {
        skipped += 1;
        return;
      }

      // Сначала освобождаем unique-ссылку на lastMessageId у старой ветки,
      // иначе при обновлении каноничного чата может быть конфликт уникальности.
      await tx.chat.update({
        where: { id: oldChatId },
        data: {
          lastMessageId: null,
          lastMessageAt: null,
        },
      });

      const updated = await tx.chatMessage.updateMany({
        where: { chatId: oldChatId },
        data: { chatId: canonicalChatId },
      });

      movedMessages += updated.count;

      await refreshLastMessage(tx, canonicalChatId);

      await tx.chatParticipant.updateMany({
        where: { chatId: oldChatId, leftAt: null },
        data: { leftAt: new Date() },
      });

      await tx.chat.update({
        where: { id: oldChatId },
        data: {
          archivedAt: new Date(),
          name: branch.name ? `[merged] ${branch.name}` : "[merged] AI ветка",
        },
      });

      mergedChats += 1;
    });

    console.log(
      `✅ Объединен чат ${oldChatId} (user: ${userId}, messages: ${branch._count.messages})`
    );
  }

  console.log("\n🎉 Готово.");
  console.log(`   Объединено чатов: ${mergedChats}`);
  console.log(`   Перенесено сообщений: ${movedMessages}`);
  console.log(`   Пропущено: ${skipped}`);
}

main()
  .catch((error) => {
    console.error("❌ Ошибка миграции:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
