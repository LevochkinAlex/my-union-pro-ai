/**
 * Добавляет авторов обращений (Ticket.userId) в ChatParticipant для чатов обращений,
 * если их там ещё нет. Нужно для отображения чата в списке у автора и для отправки сообщений.
 *
 * Использование:
 *   pnpm exec tsx scripts/backfill-ticket-chat-participants.ts
 */

import { prisma } from "@/lib/prisma";

async function main() {
  console.log("🔄 Backfill: добавление авторов обращений в ChatParticipant\n");

  const ticketChats = await prisma.chat.findMany({
    where: { ticket: { isNot: null } },
    include: {
      ticket: { select: { id: true, userId: true, publicId: true } },
      participants: {
        where: { leftAt: null },
        select: { userId: true },
      },
    },
  });

  if (ticketChats.length === 0) {
    console.log("📋 Нет чатов, привязанных к обращениям.");
    await prisma.$disconnect();
    return;
  }

  console.log(`📋 Найдено чатов обращений: ${ticketChats.length}\n`);

  let added = 0;
  let reJoined = 0;
  let skipped = 0;
  let errors = 0;

  for (const chat of ticketChats) {
    const ticket = chat.ticket;
    if (!ticket?.userId) {
      skipped++;
      continue;
    }

    const authorId = ticket.userId;
    const isAlreadyParticipant = chat.participants.some((p) => p.userId === authorId);

    if (isAlreadyParticipant) {
      skipped++;
      continue;
    }

    try {
      const existingLeft = await prisma.chatParticipant.findFirst({
        where: { chatId: chat.id, userId: authorId },
      });

      if (existingLeft) {
        if (existingLeft.leftAt) {
          await prisma.chatParticipant.update({
            where: { id: existingLeft.id },
            data: { leftAt: null },
          });
          reJoined++;
          console.log(`  ✅ Чат ${chat.id} (обращение #${ticket.publicId ?? ticket.id}): автор ${authorId} возвращён в участники`);
        } else {
          skipped++;
        }
        continue;
      }

      await prisma.chatParticipant.create({
        data: {
          chatId: chat.id,
          userId: authorId,
          role: "member",
          invitedById: null,
        },
      });
      added++;
      console.log(`  ✅ Чат ${chat.id} (обращение #${ticket.publicId ?? ticket.id}): автор ${authorId} добавлен в участники`);
    } catch (err) {
      errors++;
      console.error(`  ❌ Чат ${chat.id}, автор ${authorId}:`, (err as Error).message);
    }
  }

  console.log("\n📊 Итого:");
  console.log(`  Добавлено: ${added}`);
  console.log(`  Возвращено (leftAt сброшен): ${reJoined}`);
  console.log(`  Пропущено (уже участник): ${skipped}`);
  if (errors > 0) console.log(`  Ошибок: ${errors}`);

  await prisma.$disconnect();
}

main();
