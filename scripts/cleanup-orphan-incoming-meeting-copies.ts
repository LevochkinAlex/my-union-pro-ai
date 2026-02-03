#!/usr/bin/env tsx
/**
 * Удаление «висящих» копий документов заседаний во входящих.
 * Удаляются копии, у которых:
 * - заседание не существует, или
 * - оригинальный документ не существует, или
 * - оригинал больше не является текущей повесткой/протоколом этого заседания (документ пересоздали), или
 * - оригинал не в статусе PENDING_APPROVAL (черновик/исполнен — согласование уже не требуется).
 *
 * Запуск: pnpm run cleanup:orphan-incoming-copies
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

  // Повестки/протоколы во входящих без originalDocumentId — устаревшие копии, удаляем
  const agendaOrProtocolWithoutOriginal = copies.filter((d) => {
    const type = (d.type || "").toUpperCase();
    if (type !== "AGENDA" && type !== "PROTOCOL") return false;
    const meta = d.metadata as { originalDocumentId?: string } | null;
    return meta?.originalDocumentId == null;
  });

  const toDeleteOrphans = agendaOrProtocolWithoutOriginal.map((d) => ({ id: d.id, title: d.title, type: d.type }));

  if (withMeta.length === 0 && toDeleteOrphans.length === 0) {
    console.log("✅ Нет копий документов заседаний во входящих.\n");
    await prisma.$disconnect();
    return;
  }

  const originalIds = [...new Set(withMeta.map((d) => (d.metadata as { originalDocumentId: string }).originalDocumentId))];
  const meetingIds = [...new Set(withMeta.map((d) => (d.metadata as { meetingId?: string }).meetingId).filter(Boolean))] as string[];

  const originalsList = await prisma.document.findMany({
    where: { id: { in: originalIds } },
    select: { id: true, status: true },
  });
  const existingOriginals = new Set(originalsList.map((d) => d.id));
  const originalStatusById = Object.fromEntries(originalsList.map((d) => [d.id, d.status]));

  // Текущие повестки/протоколы заседаний: только они считаются «актуальными» оригиналами
  let validMeetingOriginalIds = new Set<string>(); // "meetingId:documentId"
  if (meetingIds.length > 0) {
    const meetings = await prisma.meeting.findMany({
      where: { id: { in: meetingIds } },
      select: { id: true, agendaDocumentId: true, protocolDocumentId: true },
    });
    meetings.forEach((m) => {
      if (m.agendaDocumentId) validMeetingOriginalIds.add(`${m.id}:${m.agendaDocumentId}`);
      if (m.protocolDocumentId) validMeetingOriginalIds.add(`${m.id}:${m.protocolDocumentId}`);
    });
  }

  const existingMeetingIds = new Set(
    meetingIds.length > 0
      ? (
          await prisma.meeting.findMany({
            where: { id: { in: meetingIds } },
            select: { id: true },
          })
        ).map((m) => m.id)
      : []
  );

  const toDeleteFromMeta = withMeta.filter((d) => {
    const meta = d.metadata as { originalDocumentId: string; meetingId?: string };
    const originalExists = existingOriginals.has(meta.originalDocumentId);
    const meetingExists = !!meta.meetingId && existingMeetingIds.has(meta.meetingId);
    // Удалить, если оригинал или заседание пропали
    if (!originalExists || !meetingExists) return true;
    // Удалить, если оригинал больше не текущая повестка/протокол этого заседания (протокол пересоздали и т.п.)
    if (meta.meetingId && !validMeetingOriginalIds.has(`${meta.meetingId}:${meta.originalDocumentId}`)) return true;
    // Удалить копии, если оригинал не на согласовании (черновик/исполнен — во входящих не показываем)
    const origStatus = originalStatusById[meta.originalDocumentId];
    if (origStatus && origStatus !== "PENDING_APPROVAL") return true;
    return false;
  });

  const toDelete = [
    ...toDeleteOrphans.map((d) => ({ id: d.id, title: d.title, type: d.type, metadata: null as any })),
    ...toDeleteFromMeta,
  ];

  if (toDelete.length === 0) {
    console.log("✅ Висящих копий не найдено (все заседания и оригиналы на месте).\n");
    await prisma.$disconnect();
    return;
  }

  console.log(`📋 Найдено висящих копий: ${toDelete.length}`);
  toDelete.forEach((d) => {
    const meta = d.metadata as { meetingId?: string; originalDocumentId?: string } | null;
    console.log(`   — ${d.title ?? d.id} (type: ${d.type}, meetingId: ${meta?.meetingId ?? "—"}, original: ${meta?.originalDocumentId ?? "—"})`);
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
