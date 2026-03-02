/**
 * Исправляет сломанные пути обложек (coverImage) в NewsPost и в сообщениях channel_post.
 * Нормализует: полный URL (http...) → относительный путь /uploads/news/... для хранения в БД.
 *
 * Запуск: pnpm run fix:news-cover-images
 */

import { prisma } from "@/lib/prisma";

function normalizeCoverImageForStorage(coverImage: string | null | undefined): string | null {
  if (!coverImage || typeof coverImage !== "string") return null;
  const s = coverImage.trim();
  if (!s || s.startsWith("data:")) return s;
  if (s.startsWith("http://") || s.startsWith("https://")) {
    try {
      const pathname = new URL(s).pathname;
      if (pathname.startsWith("/api/uploads/")) return pathname.replace("/api/uploads/", "/uploads/");
      if (pathname.startsWith("/uploads/")) return pathname;
      return pathname;
    } catch {
      return s;
    }
  }
  if (s.startsWith("/api/uploads/")) return s.replace("/api/uploads/", "/uploads/");
  return s;
}

async function main() {
  console.log("🔄 Исправление путей обложек в NewsPost и channel_post\n");

  const newsPosts = await prisma.newsPost.findMany({
    where: { coverImage: { not: null } },
    select: { id: true, title: true, coverImage: true, channelId: true, isPublished: true },
  });

  let updatedNews = 0;
  for (const post of newsPosts) {
    const normalized = normalizeCoverImageForStorage(post.coverImage);
    if (normalized === post.coverImage) continue;
    await prisma.newsPost.update({
      where: { id: post.id },
      data: { coverImage: normalized },
    });
    updatedNews++;
    console.log(`  NewsPost ${post.id.slice(0, 8)}… "${(post.title || "").slice(0, 40)}…" → ${normalized?.slice(0, 50)}…`);
  }

  const channelPosts = await prisma.chatMessage.findMany({
    where: { messageType: "channel_post" },
    select: { id: true, content: true },
  });

  let updatedMessages = 0;
  for (const msg of channelPosts) {
    let parsed: { postId?: string; title?: string; content?: string; coverImage?: string | null; type?: string } | null = null;
    try {
      parsed = JSON.parse(msg.content) as typeof parsed;
    } catch {
      continue;
    }
    if (!parsed || parsed.type !== "channel_post") continue;
    const normalized = normalizeCoverImageForStorage(parsed.coverImage);
    if (normalized === parsed.coverImage) continue;
    const newContent = { ...parsed, coverImage: normalized };
    await prisma.chatMessage.update({
      where: { id: msg.id },
      data: { content: JSON.stringify(newContent) },
    });
    updatedMessages++;
    console.log(`  ChatMessage ${msg.id.slice(0, 8)}… coverImage → ${normalized?.slice(0, 50)}…`);
  }

  // Посты РПО: убедиться, что они в региональном канале и опубликованы
  const regionalChannel = await prisma.newsChannel.findFirst({
    where: { organizationId: null, name: "Региональные новости" },
    select: { id: true },
  });

  if (regionalChannel) {
    const titles = [
      "Два представителя Московской области",
      "Гала-концерт",
      "Об акциях Профсоюза",
      "форуме ФНПР",
    ];
    const toFix = await prisma.newsPost.findMany({
      where: {
        OR: titles.map((t) => ({ title: { contains: t, mode: "insensitive" as const } })),
      },
      select: { id: true, title: true, channelId: true, isPublished: true },
    });
    let fixedChannel = 0;
    for (const post of toFix) {
      const updates: { channelId?: string; isPublished?: boolean; publishedAt?: Date } = {};
      if (post.channelId !== regionalChannel.id) {
        updates.channelId = regionalChannel.id;
        fixedChannel++;
      }
      if (!post.isPublished) {
        updates.isPublished = true;
        updates.publishedAt = new Date();
        fixedChannel++;
      }
      if (Object.keys(updates).length > 0) {
        await prisma.newsPost.update({
          where: { id: post.id },
          data: updates,
        });
        console.log(`  РПО пост "${(post.title || "").slice(0, 50)}…" → канал региональный, опубликован`);
      }
    }
    if (fixedChannel) console.log(`   Постов РПО переведено в региональный канал/опубликовано: ${fixedChannel}`);
  }

  console.log("\n📊 Итого:");
  console.log(`   Обновлено NewsPost (обложки): ${updatedNews}`);
  console.log(`   Обновлено сообщений channel_post (обложки): ${updatedMessages}`);

  await prisma.$disconnect();
}

main();
