/**
 * Одноразовая замена темы и текста обращения (и карточки в чате) по publicId.
 * Не храните в репозитории нецензурные строки — задаёте только безопасный итоговый текст.
 *
 * Запуск (локально / на VDS с .env.local):
 *   pnpm dotenv -e .env.local -- tsx scripts/sanitize-ticket-content.ts 35604798
 *   pnpm dotenv -e .env.local -- tsx scripts/sanitize-ticket-content.ts 3560-4798 --dry-run
 *
 * Переменные окружения (опционально):
 *   SANITIZE_TICKET_TITLE   — тема обращения (по умолчанию ниже)
 *   SANITIZE_TICKET_CONTENT — HTML-текст обращения (по умолчанию ниже)
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

function normalizePublicId(raw: string): string {
  const s = raw.replace(/\s/g, "").replace(/-/g, "");
  if (!/^\d{8}$/.test(s)) {
    throw new Error(`publicId должен быть 8 цифр (с дефисом или без), получено: ${raw}`);
  }
  return s;
}

function formatAppealId(id: string): string {
  if (id.length !== 8) return id;
  return `${id.slice(0, 4)}-${id.slice(4)}`;
}

function buildAppealChatBody(params: {
  publicId: string;
  title: string;
  content: string;
  createdAt: Date;
}): string {
  const displayId = formatAppealId(params.publicId);
  const createdAt = params.createdAt;
  const dateStr = createdAt.toLocaleDateString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
  const timeStr = createdAt.toLocaleTimeString("ru-RU", {
    hour: "2-digit",
    minute: "2-digit",
  });
  let initialMessage = `**Обращение #${displayId}**\n\n`;
  initialMessage += `**Тема:** ${params.title}\n\n`;
  initialMessage += `**Текст обращения:**\n${params.content}\n\n`;
  initialMessage += `**Дата и время создания:** ${dateStr} в ${timeStr}`;
  return initialMessage;
}

const DEFAULT_TITLE =
  process.env.SANITIZE_TICKET_TITLE?.trim() ||
  "Консультация по правам члена профсоюза и сервисам MyUnion";

const DEFAULT_CONTENT =
  process.env.SANITIZE_TICKET_CONTENT?.trim() ||
  "<p>Здравствуйте. Прошу разъяснить порядок пользования льготами и сервисами, доступными членам профсоюза в системе MyUnion, а также указать контакт для справок по членству и взносам.</p>";

async function main() {
  const args = process.argv.slice(2).filter((a) => a !== "--dry-run");
  const dryRun = process.argv.includes("--dry-run");
  const rawId = args[0];
  if (!rawId) {
    console.error("Укажите publicId: tsx scripts/sanitize-ticket-content.ts 35604798 [--dry-run]");
    process.exit(1);
  }

  const publicId = normalizePublicId(rawId);
  const displayId = formatAppealId(publicId);

  const ticket = await prisma.ticket.findUnique({
    where: { publicId },
    select: {
      id: true,
      publicId: true,
      title: true,
      content: true,
      createdAt: true,
      chatId: true,
    },
  });

  if (!ticket) {
    console.error(`Обращение с publicId=${publicId} (${displayId}) не найдено.`);
    process.exit(1);
  }

  const newTitle = DEFAULT_TITLE;
  const newContent = DEFAULT_CONTENT;
  const newChatBody = buildAppealChatBody({
    publicId: ticket.publicId,
    title: newTitle,
    content: newContent,
    createdAt: ticket.createdAt,
  });

  console.log(`Обращение #${displayId} (id=${ticket.id})`);
  console.log(`Тема (было → станет):`);
  console.log(`  «${ticket.title.slice(0, 120)}${ticket.title.length > 120 ? "…" : ""}»`);
  console.log(`  → «${newTitle}»`);
  console.log(`Текст: ${ticket.content.length} симв. → ${newContent.length} симв.`);
  if (dryRun) {
    console.log("\n[--dry-run] изменения не записаны.");
    await prisma.$disconnect();
    return;
  }

  await prisma.ticket.update({
    where: { id: ticket.id },
    data: { title: newTitle, content: newContent },
  });

  if (ticket.chatId) {
    const chat = await prisma.chat.findUnique({
      where: { id: ticket.chatId },
      select: { id: true, name: true },
    });
    if (chat?.name === ticket.title) {
      await prisma.chat.update({
        where: { id: chat.id },
        data: { name: newTitle },
      });
      console.log("Название чата обновлено (совпадало со старой темой).");
    }

    const messages = await prisma.chatMessage.findMany({
      where: { chatId: ticket.chatId, messageType: "text" },
      select: { id: true, content: true },
    });

    let updatedMsgs = 0;
    for (const m of messages) {
      const c = m.content;
      const looksLikeAppealCard =
        c.includes("Обращение #") &&
        (c.includes(ticket.publicId) || c.includes(displayId));
      if (!looksLikeAppealCard) continue;
      await prisma.chatMessage.update({
        where: { id: m.id },
        data: { content: newChatBody, editedAt: new Date() },
      });
      updatedMsgs++;
    }
    console.log(`Обновлено сообщений в чате: ${updatedMsgs}`);
  }

  console.log("Готово.");
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  prisma.$disconnect();
  process.exit(1);
});
