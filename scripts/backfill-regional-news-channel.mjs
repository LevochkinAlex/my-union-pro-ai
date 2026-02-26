#!/usr/bin/env node
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const admin = await prisma.user.findFirst({
    where: { role: "SUPER_ADMIN" },
    select: { id: true },
  });

  if (!admin) {
    throw new Error("SUPER_ADMIN не найден. Невозможно создать глобальный канал.");
  }

  let channel = await prisma.newsChannel.findFirst({
    where: { globalScopeKey: "REGIONAL_NEWS_GLOBAL" },
    select: { id: true, name: true },
  });

  if (!channel) {
    channel = await prisma.newsChannel.create({
      data: {
        name: "Региональные новости",
        description: "Глобальный канал новостей для всех пользователей платформы",
        organizationId: null,
        createdById: admin.id,
        isMain: false,
        globalScopeKey: "REGIONAL_NEWS_GLOBAL",
      },
      select: { id: true, name: true },
    });
    console.log(`[backfill] Created channel ${channel.id} (${channel.name})`);
  } else {
    console.log(`[backfill] Channel already exists ${channel.id} (${channel.name})`);
  }

  let chat = await prisma.chat.findUnique({
    where: { newsChannelId: channel.id },
    select: { id: true },
  });

  if (!chat) {
    chat = await prisma.chat.create({
      data: {
        type: "CHANNEL",
        name: "Региональные новости",
        description: "Глобальный канал новостей для всех пользователей платформы",
        createdById: admin.id,
        newsChannelId: channel.id,
      },
      select: { id: true },
    });
    console.log(`[backfill] Created chat ${chat.id}`);
  } else {
    console.log(`[backfill] Chat already exists ${chat.id}`);
  }

  const users = await prisma.user.findMany({
    where: { membershipStatus: "APPROVED" },
    select: { id: true },
  });

  if (users.length > 0) {
    await prisma.chatParticipant.createMany({
      data: users.map((u) => ({
        chatId: chat.id,
        userId: u.id,
        role: u.id === admin.id ? "admin" : "member",
      })),
      skipDuplicates: true,
    });
    console.log(`[backfill] Synced ${users.length} approved users to channel chat`);
  } else {
    console.log("[backfill] No approved users found");
  }
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
