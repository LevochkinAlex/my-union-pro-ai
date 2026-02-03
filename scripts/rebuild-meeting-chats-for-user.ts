/**
 * Пересборка чатов заседаний для пользователя: для всех заседаний, где он участник,
 * создаёт/синхронизирует групповой чат (ensureMeetingGroupChat) и при необходимости
 * назначает копии повесток/протоколов.
 *
 * Использование:
 *   pnpm exec tsx scripts/rebuild-meeting-chats-for-user.ts
 *   pnpm exec tsx scripts/rebuild-meeting-chats-for-user.ts "Кашина"
 *   pnpm exec tsx scripts/rebuild-meeting-chats-for-user.ts "<userId>"
 */

import { prisma } from "@/lib/prisma";
import { ensureMeetingGroupChat } from "@/lib/meeting-chat";

async function main() {
  const search = process.argv[2] ?? "Кашина";
  console.log("🔄 Пересборка чатов заседаний для пользователя:", search, "\n");

  const user = await (async () => {
    if (search.length === 24 || search.length === 25) {
      const byId = await prisma.user.findUnique({ where: { id: search } });
      if (byId) return byId;
    }
    return prisma.user.findFirst({
      where: {
        OR: [
          { lastName: { contains: search, mode: "insensitive" } },
          { firstName: { contains: search, mode: "insensitive" } },
          { email: { contains: search, mode: "insensitive" } },
        ],
      },
    });
  })();

  if (!user) {
    console.error("❌ Пользователь не найден:", search);
    process.exit(1);
  }

  console.log("👤 Пользователь:", user.firstName, user.lastName, `(${user.id})\n`);

  const participations = await prisma.meetingParticipant.findMany({
    where: { userId: user.id },
    include: {
      meeting: {
        select: {
          id: true,
          number: true,
          title: true,
          groupChat: { select: { id: true } },
        },
      },
    },
    orderBy: { meeting: { scheduledDate: "desc" } },
  });

  const meetingIds = [...new Set(participations.map((p) => p.meeting.id))];

  if (meetingIds.length === 0) {
    console.log("📋 Нет заседаний, где пользователь является участником.");
    await prisma.$disconnect();
    return;
  }

  console.log(`📋 Найдено заседаний: ${meetingIds.length}\n`);

  for (const meetingId of meetingIds) {
    const meeting = participations.find((p) => p.meeting.id === meetingId)!.meeting;
    try {
      const result = await ensureMeetingGroupChat(meetingId);
      if (result) {
        const action = result.created ? "создан" : "обновлён (синхронизированы участники)";
        console.log(`  ✅ Заседание №${meeting.number ?? meeting.id.slice(0, 8)}: чат ${action}`);
      } else {
        console.log(`  ⚠️ Заседание №${meeting.number ?? meeting.id.slice(0, 8)}: чат не создан (нет участников с userId?)`);
      }
    } catch (err) {
      console.error(`  ❌ Заседание ${meeting.id}:`, err);
    }
  }

  console.log("\n✅ Готово.");
  await prisma.$disconnect();
}

main();
