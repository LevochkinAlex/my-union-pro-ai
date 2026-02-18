/**
 * Пересборка статусов обращений по переписке в чате.
 * Для всех обращений (включая с архивированными чатами):
 * - если в чате есть хотя бы одно сообщение не от автора (например от председателя),
 *   а статус обращения всё ещё PENDING — переводим в IN_PROGRESS и выставляем lastResponseAt.
 * - сбрасываем isOverdue для обращений, которые уже в работе/закрыты.
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("[rebuild-appeal-statuses] Поиск обращений с привязанным чатом...\n");

  // Все обращения с непустым chatId (включая чаты в архиве — не фильтруем по archivedAt)
  const ticketsWithChat = await prisma.ticket.findMany({
    where: { chatId: { not: null } },
    select: {
      id: true,
      publicId: true,
      chatId: true,
      userId: true,
      status: true,
      lastResponseAt: true,
      isOverdue: true,
      chat: {
        select: {
          id: true,
          archivedAt: true,
          _count: { select: { messages: true } },
        },
      },
    },
    orderBy: { createdAt: "asc" },
  });

  console.log(`Найдено обращений с чатом: ${ticketsWithChat.length}`);
  const byStatus = ticketsWithChat.reduce<Record<string, number>>((acc, t) => {
    acc[t.status] = (acc[t.status] || 0) + 1;
    return acc;
  }, {});
  console.log("По статусам:", byStatus);
  const inArchive = ticketsWithChat.filter((t) => t.chat?.archivedAt != null).length;
  if (inArchive > 0) console.log(`Из них чат в архиве: ${inArchive}`);
  console.log();

  let updatedToInProgress = 0;
  let fixedOverdue = 0;
  const details: string[] = [];

  for (const ticket of ticketsWithChat) {
    const chatId = ticket.chatId!;
    const authorId = ticket.userId;

    // Есть ответ не от автора в чате?
    const firstNonAuthorMessage = await prisma.chatMessage.findFirst({
      where: {
        chatId,
        senderId: { not: authorId },
      },
      orderBy: { createdAt: "asc" },
      select: { id: true, createdAt: true, senderId: true },
    });

    const inArchive = ticket.chat?.archivedAt != null;
    const archiveLabel = inArchive ? " [архив]" : "";

    if (ticket.status === "PENDING" && firstNonAuthorMessage) {
      await prisma.ticket.update({
        where: { id: ticket.id },
        data: {
          status: "IN_PROGRESS",
          lastResponseAt: firstNonAuthorMessage.createdAt,
          isOverdue: false,
        },
      });
      updatedToInProgress++;
      details.push(
        `  #${ticket.publicId}${archiveLabel}: PENDING → IN_PROGRESS (первый ответ не от автора: ${firstNonAuthorMessage.createdAt.toISOString()})`
      );
      continue;
    }

    // Сброс isOverdue для обращений уже не в ожидании
    if (ticket.isOverdue && ticket.status !== "PENDING") {
      await prisma.ticket.update({
        where: { id: ticket.id },
        data: { isOverdue: false },
      });
      fixedOverdue++;
      details.push(`  #${ticket.publicId}${archiveLabel}: сброшен isOverdue (статус ${ticket.status})`);
    }
  }

  console.log("Итог:");
  console.log(`  Переведено в «В работе» (PENDING → IN_PROGRESS): ${updatedToInProgress}`);
  console.log(`  Сброшен isOverdue: ${fixedOverdue}`);
  if (details.length > 0) {
    console.log("\nДетали изменений:");
    details.forEach((d) => console.log(d));
  }
  console.log("\n[rebuild-appeal-statuses] Готово.");
}

main()
  .catch((e) => {
    console.error("[rebuild-appeal-statuses] Ошибка:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
