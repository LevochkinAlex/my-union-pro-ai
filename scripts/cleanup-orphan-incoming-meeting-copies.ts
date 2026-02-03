#!/usr/bin/env tsx
/**
 * Удаление «висящих» копий документов заседаний во входящих.
 * Такие копии остаются, если заседание удалили до того, как мы начали при удалении
 * заседания удалять копии и оригиналы (повестку/протокол).
 *
 * Критерий «сироты»: документ с assignedToId и metadata.originalDocumentId,
 * при этом заседание (metadata.meetingId) не существует ИЛИ оригинальный документ не существует.
 *
 * Запуск: pnpm exec tsx scripts/cleanup-orphan-incoming-meeting-copies.ts
 */

import { prisma } from "@/lib/prisma";

async function main() {
  console.log("🔍 Поиск входящих копий документов заседаний...\n");

  const copies = await prisma.document.findMany({
    where: { assignedToId: { not: null } },
    select: { id: true, title: true, type: true, metadata: true },
  });

  const withMeta = copies.filter((d) => {
    const meta = d.metadata as { originalDocumentId?: string; meetingId?: string } | null;
    return meta?.originalDocumentId != null;
  });

  if (withMeta.length === 0) {
    console.log("✅ Нет копий документов заседаний во входящих.\n");
    await prisma.$disconnect();
    return;
  }

  const originalIds = [...new Set(withMeta.map((d) => (d.metadata as { originalDocumentId: string }).originalDocumentId))];
  const meetingIds = [...new Set(withMeta.map((d) => (d.metadata as { meetingId?: string }).meetingId).filter(Boolean))] as string[];

  const existingOriginals = new Set(
    (
      await prisma.document.findMany({
        where: { id: { in: originalIds } },
        select: { id: true },
      })
    ).map((d) => d.id)
  );
  const existingMeetings = new Set(
    meetingIds.length > 0
      ? (
          await prisma.meeting.findMany({
            where: { id: { in: meetingIds } },
            select: { id: true },
          })
        ).map((m) => m.id)
      : []
  );

  const toDelete = withMeta.filter((d) => {
    const meta = d.metadata as { originalDocumentId: string; meetingId?: string };
    const originalExists = existingOriginals.has(meta.originalDocumentId);
    const meetingExists = !meta.meetingId || existingMeetings.has(meta.meetingId);
    return !originalExists || !meetingExists;
  });

  if (toDelete.length === 0) {
    console.log("✅ Висящих копий не найдено (все заседания и оригиналы на месте).\n");
    await prisma.$disconnect();
    return;
  }

  console.log(`📋 Найдено висящих копий: ${toDelete.length}`);
  toDelete.forEach((d) => {
    const meta = d.metadata as { meetingId?: string; originalDocumentId: string };
    console.log(`   — ${d.title ?? d.id} (type: ${d.type}, meetingId: ${meta.meetingId ?? "—"}, original: ${meta.originalDocumentId})`);
  });
  console.log("");

  const ids = toDelete.map((d) => d.id);
  await prisma.document.deleteMany({
    where: { id: { in: ids } },
  });

  console.log(`✅ Удалено документов: ${ids.length}\n`);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
