#!/usr/bin/env tsx
/**
 * Удаляет документы заседаний без актуальных связей в БД и «лишние» файлы подписей на диске.
 *
 * Критерии (объединение):
 * — meetingResolutionId / meetingExtractId указывают на несуществующее заседание
 * — AGENDA/PROTOCOL не привязаны к заседанию и не являются копиями (нет metadata.originalDocumentId)
 * — metadata.meetingId ссылается на удалённое заседание
 * — metadata.originalDocumentId ссылается на несуществующий документ (повторяется, пока находятся новые)
 * — файлы в public/uploads/signed с префиксом signed_, на которые нет signedFilePath ни у одной записи
 *
 * Запуск (без изменений): pnpm run cleanup:orphan-meeting-documents -- --dry-run
 * Удаление: pnpm run cleanup:orphan-meeting-documents
 */

import fs from "fs/promises";
import path from "path";
import { prisma } from "@/lib/prisma";

const DRY_RUN = process.argv.includes("--dry-run");

function resolvePublicFile(webPath: string | null | undefined): string | null {
  if (!webPath || typeof webPath !== "string") return null;
  const trimmed = webPath.trim();
  if (!trimmed.startsWith("/")) return null;
  const rel = trimmed.replace(/^\/+/, "");
  return path.join(process.cwd(), "public", rel);
}

async function unlinkPublicPath(webPath: string | null | undefined): Promise<void> {
  const full = resolvePublicFile(webPath);
  if (!full) return;
  await fs.unlink(full).catch(() => {});
}

async function main() {
  const reasons = new Map<string, string>();

  const add = (rows: { id: string }[], reason: string) => {
    for (const r of rows) {
      if (!reasons.has(r.id)) reasons.set(r.id, reason);
    }
  };

  const badResolution = await prisma.$queryRaw<{ id: string }[]>`
    SELECT d.id::text AS id FROM "Document" d
    WHERE d."meetingResolutionId" IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM "Meeting" m WHERE m.id = d."meetingResolutionId")
  `;
  add(badResolution, "meetingResolutionId без заседания");

  const badExtract = await prisma.$queryRaw<{ id: string }[]>`
    SELECT d.id::text AS id FROM "Document" d
    WHERE d."meetingExtractId" IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM "Meeting" m WHERE m.id = d."meetingExtractId")
  `;
  add(badExtract, "meetingExtractId без заседания");

  const orphanAgendaProtocol = await prisma.$queryRaw<{ id: string }[]>`
    SELECT d.id::text AS id FROM "Document" d
    WHERE d.type IN ('AGENDA', 'PROTOCOL')
    AND NOT EXISTS (
      SELECT 1 FROM "Meeting" m
      WHERE m."agendaDocumentId" = d.id OR m."protocolDocumentId" = d.id
    )
    AND (
      d.metadata IS NULL
      OR (d.metadata::jsonb->>'originalDocumentId') IS NULL
    )
  `;
  add(orphanAgendaProtocol, "AGENDA/PROTOCOL без заседания (не копия)");

  const badMeetingMeta = await prisma.$queryRaw<{ id: string }[]>`
    SELECT d.id::text AS id FROM "Document" d
    WHERE d.metadata IS NOT NULL
    AND (d.metadata::jsonb->>'meetingId') IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM "Meeting" m
      WHERE m.id = (d.metadata::jsonb->>'meetingId')
    )
  `;
  add(badMeetingMeta, "metadata.meetingId без заседания");

  for (let i = 0; i < 15; i++) {
    const before = reasons.size;
    const badOriginalRef = await prisma.$queryRaw<{ id: string }[]>`
      SELECT d.id::text AS id FROM "Document" d
      WHERE d.metadata IS NOT NULL
      AND (d.metadata::jsonb->>'originalDocumentId') IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM "Document" o
        WHERE o.id = (d.metadata::jsonb->>'originalDocumentId')
      )
    `;
    add(badOriginalRef, "metadata.originalDocumentId без оригинала");
    if (reasons.size === before) break;
  }

  const ids = [...reasons.keys()];

  console.log(`Кандидатов на удаление (БД): ${ids.length}`);
  for (const id of ids) {
    console.log(`  — ${id}: ${reasons.get(id)}`);
  }

  const docs =
    ids.length > 0
      ? await prisma.document.findMany({
          where: { id: { in: ids } },
          select: { id: true, filePath: true, signedFilePath: true, title: true, type: true },
        })
      : [];

  const referencedSignedNormalized = new Set<string>();
  const allSigned = await prisma.document.findMany({
    where: { signedFilePath: { not: null } },
    select: { signedFilePath: true },
  });
  for (const d of allSigned) {
    if (d.signedFilePath) {
      referencedSignedNormalized.add(d.signedFilePath.replace(/^\/+/, ""));
    }
  }

  const publicRoot = path.join(process.cwd(), "public");
  const signedDirs = [path.join(publicRoot, "uploads", "signed")];

  const orphanFiles: string[] = [];
  for (const dir of signedDirs) {
    let names: string[] = [];
    try {
      names = await fs.readdir(dir);
    } catch {
      continue;
    }
    for (const name of names) {
      if (!name.startsWith("signed_")) continue;
      const full = path.join(dir, name);
      const rel = path.relative(publicRoot, full).split(path.sep).join("/");
      if (!referencedSignedNormalized.has(rel)) {
        orphanFiles.push(full);
      }
    }
  }

  if (orphanFiles.length > 0) {
    console.log(`\nФайлы подписей без ссылки в БД: ${orphanFiles.length}`);
    for (const f of orphanFiles) {
      console.log(`  — ${f}`);
    }
  }

  if (DRY_RUN) {
    console.log("\n[DRY RUN] Удаление не выполнялось.");
    await prisma.$disconnect();
    return;
  }

  if (ids.length > 0) {
    await prisma.userNotification.deleteMany({
      where: {
        OR: ids.map((docId) => ({
          metadata: { path: ["documentId"], equals: docId },
        })),
      },
    });
    await prisma.documentApproval.deleteMany({ where: { documentId: { in: ids } } });
    await prisma.documentStatusHistory.deleteMany({ where: { documentId: { in: ids } } });

    for (const doc of docs) {
      await unlinkPublicPath(doc.filePath);
      await unlinkPublicPath(doc.signedFilePath);
    }

    const del = await prisma.document.deleteMany({ where: { id: { in: ids } } });
    console.log(`\nУдалено записей Document: ${del.count}`);
  } else {
    console.log("\nНет осиротевших документов по критериям БД.");
  }

  let fileRemoved = 0;
  for (const f of orphanFiles) {
    try {
      await fs.unlink(f);
      fileRemoved++;
    } catch (e) {
      console.warn("Не удалось удалить файл:", f, e);
    }
  }
  if (fileRemoved > 0) {
    console.log(`Удалено осиротевших файлов подписей: ${fileRemoved}`);
  }

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
