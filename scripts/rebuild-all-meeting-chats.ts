/**
 * Пересборка чатов заседаний для всех заседаний с участниками:
 * для каждого заседания вызывается ensureMeetingGroupChat — создаётся чат при отсутствии,
 * синхронизируются участники (добавляются в чат те, кого добавили в заседание).
 *
 * Использование:
 *   pnpm exec tsx scripts/rebuild-all-meeting-chats.ts
 *   pnpm run rebuild-all-meeting-chats
 */

import { prisma } from "@/lib/prisma";
import { ensureMeetingGroupChat } from "@/lib/meeting-chat";

async function main() {
  console.log("🔄 Пересборка чатов заседаний для всех заседаний с участниками\n");

  const meetings = await prisma.meeting.findMany({
    where: {
      participants: {
        some: { userId: { not: null } },
      },
    },
    include: {
      participants: {
        where: { userId: { not: null } },
        select: { userId: true },
      },
      groupChat: { select: { id: true } },
    },
    orderBy: { scheduledDate: "desc" },
  });

  if (meetings.length === 0) {
    console.log("📋 Нет заседаний с участниками (userId).");
    await prisma.$disconnect();
    return;
  }

  console.log(`📋 Найдено заседаний с участниками: ${meetings.length}\n`);

  let created = 0;
  let updated = 0;
  let errors = 0;

  for (const meeting of meetings) {
    try {
      const result = await ensureMeetingGroupChat(meeting.id);
      if (result) {
        if (result.created) {
          created++;
          console.log(`  ✅ Заседание №${meeting.number ?? meeting.id.slice(0, 8)}: чат создан`);
        } else {
          updated++;
          console.log(`  ✅ Заседание №${meeting.number ?? meeting.id.slice(0, 8)}: чат обновлён (участники синхронизированы)`);
        }
      } else {
        console.log(`  ⚠️ Заседание №${meeting.number ?? meeting.id.slice(0, 8)}: чат не создан (нет участников с userId)`);
      }
    } catch (err) {
      errors++;
      console.error(`  ❌ Заседание №${meeting.number ?? meeting.id.slice(0, 8)} (${meeting.id}):`, err);
    }
  }

  console.log("\n📊 Итого:");
  console.log(`   Создано чатов: ${created}`);
  console.log(`   Обновлено чатов: ${updated}`);
  if (errors > 0) console.log(`   Ошибок: ${errors}`);
  console.log("\n✅ Готово.");
  await prisma.$disconnect();
}

main();
