/**
 * Синхронизация постов из чата в NewsPost.
 * Находит сообщения типа channel_post в каналах, для которых нет записи NewsPost
 * (или postId указывает на несуществующий пост), и создаёт недостающие NewsPost.
 *
 * Запуск: pnpm exec tsx scripts/sync-channel-posts-to-news.ts
 */

import { prisma } from "@/lib/prisma";

interface ParsedContent {
  type?: string;
  postId?: string;
  title?: string;
  content?: string;
  coverImage?: string | null;
  hasPolls?: boolean;
}

function parseContent(content: string): ParsedContent | null {
  try {
    return JSON.parse(content) as ParsedContent;
  } catch {
    return null;
  }
}

async function main() {
  console.log("🔄 Синхронизация постов канала (channel_post) → NewsPost\n");

  const messages = await prisma.chatMessage.findMany({
    where: { messageType: "channel_post" },
    include: {
      chat: {
        select: {
          id: true,
          type: true,
          newsChannelId: true,
        },
      },
    },
    orderBy: { createdAt: "asc" },
  });

  const channelMessages = messages.filter(
    (m) => m.chat?.type === "CHANNEL" && m.chat?.newsChannelId
  );

  if (channelMessages.length === 0) {
    console.log("📋 Нет сообщений channel_post в каналах.");
    await prisma.$disconnect();
    return;
  }

  console.log(`📋 Найдено сообщений channel_post в каналах: ${channelMessages.length}\n`);

  let created = 0;
  let updated = 0;
  let skipped = 0;
  let errors = 0;

  for (const msg of channelMessages) {
    const chat = msg.chat as { id: string; type: string; newsChannelId: string | null };
    const channelId = chat.newsChannelId;
    if (!channelId) continue;

    const parsed = parseContent(msg.content);
    if (!parsed || (parsed.type !== "channel_post" && !parsed.postId && !parsed.title)) {
      skipped++;
      continue;
    }

    const postId = parsed.postId;
    const title = (parsed.title || "").trim();
    const content = (parsed.content || "").trim();

    if (!title && !content) {
      skipped++;
      continue;
    }

    // Создаём NewsPost только если в сообщении вообще не было postId (пост никогда не создавался).
    // Если postId есть, но поста в БД нет — считаем, что пост удалили намеренно, не восстанавливаем.
    let needCreate = false;
    if (!postId) {
      needCreate = true;
    } else {
      const existing = await prisma.newsPost.findUnique({
        where: { id: postId },
        select: { id: true },
      });
      if (existing) {
        skipped++;
        continue;
      }
      // postId есть, но поста нет — удалённый пост, не создаём заново
    }

    if (!needCreate) {
      skipped++;
      continue;
    }

    try {
      const newsPost = await prisma.newsPost.create({
        data: {
          authorId: msg.senderId,
          channelId,
          title: title || "Без заголовка",
          content: content || "",
          coverImage: parsed.coverImage || null,
          isPublished: true,
          publishedAt: msg.createdAt,
        },
      });

      created++;

      const newContent = {
        ...parsed,
        type: "channel_post",
        postId: newsPost.id,
        title: newsPost.title,
        content: newsPost.content,
        coverImage: newsPost.coverImage,
      };

      await prisma.chatMessage.update({
        where: { id: msg.id },
        data: { content: JSON.stringify(newContent) },
      });
      updated++;

      console.log(`  ✅ Message ${msg.id.slice(0, 8)}… → NewsPost ${newsPost.id.slice(0, 8)}…`);
    } catch (e) {
      errors++;
      console.error(`  ❌ Message ${msg.id}:`, e);
    }
  }

  console.log("\n📊 Итого:");
  console.log(`   Создано NewsPost: ${created}`);
  console.log(`   Обновлено сообщений (postId): ${updated}`);
  console.log(`   Пропущено (уже есть пост): ${skipped}`);
  if (errors) console.log(`   Ошибок: ${errors}`);

  await prisma.$disconnect();
}

main();
