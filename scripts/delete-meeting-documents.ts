#!/usr/bin/env tsx
/**
 * Удаление всех документов, созданных в разделе «Заседания»:
 * повестки дня (AGENDA), протоколы (PROTOCOL), постановления (RESOLUTION), выписки (PROTOCOL_EXTRACT).
 * Сначала обнуляются ссылки у заседаний, затем удаляются записи Document и связанные данные.
 */

import { PrismaClient } from "@prisma/client";
import fs from "fs/promises";
import path from "path";

const prisma = new PrismaClient();

async function deleteMeetingDocuments() {
  console.log("🔍 Поиск документов заседаний...\n");

  try {
    // 1) Документы-повестки и протоколы (связаны через Meeting.agendaDocumentId / protocolDocumentId)
    const meetings = await prisma.meeting.findMany({
      select: {
        id: true,
        number: true,
        agendaDocumentId: true,
        protocolDocumentId: true,
      },
    });

    const agendaDocIds = meetings.map((m) => m.agendaDocumentId).filter(Boolean) as string[];
    const protocolDocIds = meetings.map((m) => m.protocolDocumentId).filter(Boolean) as string[];

    // 2) Документы-постановления и выписки (связаны через Document.meetingResolutionId / meetingExtractId)
    const resolutionAndExtractDocs = await prisma.document.findMany({
      where: {
        OR: [
          { meetingResolutionId: { not: null } },
          { meetingExtractId: { not: null } },
        ],
      },
      select: { id: true, type: true, title: true, regNumber: true },
    });

    const resolutionExtractIds = resolutionAndExtractDocs.map((d) => d.id);
    const allMeetingDocIds = [...new Set([...agendaDocIds, ...protocolDocIds, ...resolutionExtractIds])];

    if (allMeetingDocIds.length === 0) {
      console.log("✅ Нет документов заседаний для удаления.");
      return;
    }

    console.log(`📄 Найдено документов заседаний: ${allMeetingDocIds.length}`);
    console.log(`   — повестки: ${agendaDocIds.length}`);
    console.log(`   — протоколы: ${protocolDocIds.length}`);
    console.log(`   — постановления/выписки: ${resolutionExtractIds.length}\n`);

    // 3) Обнуляем ссылки у заседаний (иначе FK не даст удалить документы)
    const updatedMeetings = await prisma.meeting.updateMany({
      data: {
        agendaDocumentId: null,
        protocolDocumentId: null,
      },
      where: {
        OR: [
          { agendaDocumentId: { not: null } },
          { protocolDocumentId: { not: null } },
        ],
      },
    });
    console.log(`📌 Обнулены ссылки на документы у заседаний: ${updatedMeetings.count} записей\n`);

    // 4) Удаляем согласования и историю статусов (связаны с Document)
    const deletedApprovals = await prisma.documentApproval.deleteMany({
      where: { documentId: { in: allMeetingDocIds } },
    });
    const deletedHistory = await prisma.documentStatusHistory.deleteMany({
      where: { documentId: { in: allMeetingDocIds } },
    });
    console.log(`   Удалено согласований: ${deletedApprovals.count}, записей истории: ${deletedHistory.count}\n`);

    // 5) Удаляем документы (и при необходимости файлы на диске)
    const documentsToDelete = await prisma.document.findMany({
      where: { id: { in: allMeetingDocIds } },
      select: { id: true, title: true, type: true, filePath: true, signedFilePath: true },
    });

    let fileDeleted = 0;
    for (const doc of documentsToDelete) {
      if (doc.filePath && doc.filePath.startsWith("/")) {
        try {
          const fullPath = path.join(process.cwd(), "public", doc.filePath);
          await fs.unlink(fullPath).catch(() => {});
          fileDeleted++;
        } catch {
          // ignore
        }
      }
      if (doc.signedFilePath && doc.signedFilePath.startsWith("/")) {
        try {
          const fullPath = path.join(process.cwd(), "public", doc.signedFilePath);
          await fs.unlink(fullPath).catch(() => {});
          fileDeleted++;
        } catch {
          // ignore
        }
      }
    }
    if (fileDeleted > 0) {
      console.log(`   Удалено файлов на диске: ${fileDeleted}\n`);
    }

    const deleteResult = await prisma.document.deleteMany({
      where: { id: { in: allMeetingDocIds } },
    });

    console.log(`✅ Удалено документов заседаний: ${deleteResult.count}\n`);
  } catch (error) {
    console.error("❌ Ошибка:", error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

deleteMeetingDocuments();
