import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getOrgHead } from "@/lib/ppo-head-utils";
import { DEMO_MEMBER_USER_ID } from "@/lib/demo-constants";
import { getDemoMemberOutgoingDocuments } from "@/lib/demo";
import fs from "fs";
import path from "path";

// Константы для устава (системный документ, доступный всем)
const CHARTER_PATH = "/docs/union/Устав Профсоюза (принят на VII съезде апрель 2021) зарегистрировано для публикации на сайте и печати.docx";
const CHARTER_TITLE = "Устав Профсоюза работников здравоохранения РФ";
const CHARTER_DESCRIPTION = "Устав Профсоюза работников здравоохранения РФ (принят на VII съезде, апрель 2021)";
const CHARTER_FILENAME = "Устав Профсоюза (принят на VII съезде апрель 2021) зарегистрировано для публикации на сайте и печати.docx";

function buildCharterDocument() {
  let charterFileSize: number | null = null;
  let charterFilePath: string | null = CHARTER_PATH;
  try {
    const fullPath = path.join(process.cwd(), "public", CHARTER_PATH);
    if (fs.existsSync(fullPath)) {
      const stats = fs.statSync(fullPath);
      charterFileSize = stats.size;
    } else {
      charterFilePath = null;
    }
  } catch {
    charterFilePath = null;
  }
  return {
    id: "charter-system",
    type: "OTHER" as const,
    status: "GENERATED" as const,
    title: CHARTER_TITLE,
    description: CHARTER_DESCRIPTION,
    fileName: CHARTER_FILENAME,
    fileSize: charterFileSize,
    mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    filePath: charterFilePath,
    signedFilePath: null,
    driveFileId: null,
    driveUrl: null,
    verificationStatus: null,
    verificationMessage: null,
    verifiedAt: null,
    createdAt: new Date("2021-04-01"),
    updatedAt: new Date("2021-04-01"),
    assignedAt: null,
    user: null,
  };
}

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }

    // Демо-член профсоюза: только входящие (устав) и сгенерированные заявления, без БД
    if (session.user.id === DEMO_MEMBER_USER_ID) {
      const incomingDocuments = [buildCharterDocument()];
      const outgoingDocuments = getDemoMemberOutgoingDocuments();
      return NextResponse.json({
        incomingDocuments,
        outgoingDocuments,
        isElectedBody: false,
      });
    }

    // Член выборного органа = председатель (ППО/МПО/РПО) или сотрудник организации (зам., член профкома)
    const orgHead = await getOrgHead(session.user.id);
    const isElectedBody =
      !!orgHead ||
      !!(await prisma.organizationStaff.findFirst({
        where: { userId: session.user.id, status: "ACTIVE" },
        select: { id: true },
      }));

    // Получаем документы пользователя (исходящие - созданные пользователем)
    const outgoingDocuments = await prisma.document.findMany({
      where: { userId: session.user.id },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        type: true,
        status: true,
        title: true,
        description: true,
        fileName: true,
        fileSize: true,
        mimeType: true,
        filePath: true,
        signedFilePath: true,
        driveFileId: true,
        driveUrl: true,
        createdAt: true,
        updatedAt: true,
        verificationStatus: true,
        verificationMessage: true,
        verifiedAt: true,
      },
    });

    // Получаем документы, назначенные пользователю для ознакомления (входящие)
    const incomingDocuments = await prisma.document.findMany({
      where: { assignedToId: session.user.id },
      orderBy: { assignedAt: "desc" },
      select: {
        id: true,
        type: true,
        status: true,
        title: true,
        description: true,
        fileName: true,
        fileSize: true,
        mimeType: true,
        filePath: true,
        signedFilePath: true,
        driveFileId: true,
        driveUrl: true,
        createdAt: true,
        updatedAt: true,
        verificationStatus: true,
        verificationMessage: true,
        verifiedAt: true,
        assignedAt: true,
        metadata: true,
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            middleName: true,
          },
        },
      },
    });

    const originalIds = incomingDocuments
      .map((d: { metadata?: unknown }) => (d.metadata as { originalDocumentId?: string } | null)?.originalDocumentId)
      .filter(Boolean) as string[];
    // Копии с удалённым оригиналом не показываем во входящих
    let existingOriginalIds = new Set<string>();
    const originalStatusMap: Record<string, string> = {};
    if (originalIds.length > 0) {
      const existing = await prisma.document.findMany({
        where: { id: { in: originalIds } },
        select: { id: true, status: true },
      });
      existing.forEach((d) => {
        existingOriginalIds.add(d.id);
        originalStatusMap[d.id] = d.status;
      });
    }
    // Копии с удалённым заседанием не показываем (заседание удалили — документ не актуален)
    const meetingIdsFromCopies = incomingDocuments
      .map((d: { metadata?: unknown }) => (d.metadata as { meetingId?: string } | null)?.meetingId)
      .filter(Boolean) as string[];
    let existingMeetingIds = new Set<string>();
    let meetingIdsWhereIAmChairman = new Set<string>();
    /** Для копий заседания: оригинал должен быть текущей повесткой или протоколом этого заседания */
    const validMeetingOriginalIds = new Set<string>(); // "meetingId:originalDocumentId"
    if (meetingIdsFromCopies.length > 0) {
      const meetings = await prisma.meeting.findMany({
        where: { id: { in: meetingIdsFromCopies } },
        select: {
          id: true,
          agendaDocumentId: true,
          protocolDocumentId: true,
          participants: {
            where: { role: "CHAIRMAN", userId: { not: null } },
            select: { userId: true },
          },
        },
      });
      existingMeetingIds = new Set(meetings.map((m) => m.id));
      meetings.forEach((m) => {
        const chairmanUserId = m.participants[0]?.userId;
        if (chairmanUserId === session.user.id) meetingIdsWhereIAmChairman.add(m.id);
        if (m.agendaDocumentId) validMeetingOriginalIds.add(`${m.id}:${m.agendaDocumentId}`);
        if (m.protocolDocumentId) validMeetingOriginalIds.add(`${m.id}:${m.protocolDocumentId}`);
      });
    }
    const incomingFiltered = incomingDocuments.filter((d: { metadata?: unknown; type?: string }) => {
      const meta = d.metadata as { originalDocumentId?: string; meetingId?: string } | null;
      const originalId = meta?.originalDocumentId;
      const meetingId = meta?.meetingId;
      const isAgendaOrProtocol = (d.type || "").toUpperCase() === "AGENDA" || (d.type || "").toUpperCase() === "PROTOCOL";
      if (!originalId) {
        if (isAgendaOrProtocol) return false; // повестки/протоколы без привязки к оригиналу не показываем (устаревшие копии)
        return true; // не копия заседания
      }
      if (!existingOriginalIds.has(originalId)) return false; // оригинал удалён
      if (meetingId && !existingMeetingIds.has(meetingId)) return false; // заседание удалено
      // Показывать только копии текущей повестки/протокола заседания (не старые, пересозданные документы)
      if (meetingId && !validMeetingOriginalIds.has(`${meetingId}:${originalId}`)) return false;
      // Не показывать председателю копии своих заседаний — утверждает на странице заседания
      if (meetingId && meetingIdsWhereIAmChairman.has(meetingId)) return false;
      // Любая копия (с originalDocumentId): показываем только если оригинал на согласовании (не черновик, не исполнен)
      const origStatus = originalStatusMap[originalId];
      if (origStatus && origStatus !== "PENDING_APPROVAL") return false;
      return true;
    });
    const approvalMap: Record<string, { status: string; comment: string | null; approvedAt: Date | null }> = {};
    if (existingOriginalIds.size > 0) {
      const approvals = await prisma.documentApproval.findMany({
        where: { documentId: { in: Array.from(existingOriginalIds) }, userId: session.user.id },
        select: { documentId: true, status: true, comment: true, approvedAt: true },
      });
      approvals.forEach((a) => {
        approvalMap[a.documentId] = {
          status: a.status,
          comment: a.comment,
          approvedAt: a.approvedAt,
        };
      });
    }
    type IncomingDoc = { id: string; type: string; title?: string | null; description?: string | null; metadata?: unknown };
    const incomingWithApproval = incomingFiltered.map((d: IncomingDoc) => {
      const meta = d.metadata as { originalDocumentId?: string; meetingId?: string } | null;
      const originalId = meta?.originalDocumentId;
      const approval = originalId ? approvalMap[originalId] : undefined;
      const originalStatus = originalId ? originalStatusMap[originalId] : undefined;
      return {
        ...d,
        approvalStatus: approval
          ? { status: approval.status, comment: approval.comment, approvedAt: approval.approvedAt }
          : undefined,
        meetingId: meta?.meetingId,
        originalDocumentId: originalId,
        /** Статус оригинала: кнопка «Согласовать» только при PENDING_APPROVAL */
        originalDocumentStatus: originalStatus,
      };
    });

    // Добавляем устав во входящие документы (если его еще нет)
    const hasCharterInIncoming = incomingWithApproval.some(
      (doc: { id: string; type: string; title?: string | null; description?: string | null }) =>
        doc.id === "charter-system" ||
        (doc.type === "OTHER" &&
          ((doc.title?.toLowerCase?.() || "").includes("устав") ||
            (doc.description?.toLowerCase?.() || "").includes("устав")))
    );

    if (!hasCharterInIncoming) {
      // Вычисляем размер файла устава, если он существует
      let charterFileSize: number | null = null;
      let charterFilePath: string | null = CHARTER_PATH;
      
      try {
        const fullPath = path.join(process.cwd(), "public", CHARTER_PATH);
        if (fs.existsSync(fullPath)) {
          const stats = fs.statSync(fullPath);
          charterFileSize = stats.size;
        } else {
          charterFilePath = null;
        }
      } catch (error) {
        console.warn("[documents] Не удалось получить размер файла устава:", error);
        charterFilePath = null;
      }

      // Добавляем устав в начало списка входящих документов
      const charterDocument = {
        id: "charter-system",
        type: "OTHER" as const,
        status: "GENERATED" as const,
        title: CHARTER_TITLE,
        description: CHARTER_DESCRIPTION,
        fileName: CHARTER_FILENAME,
        fileSize: charterFileSize,
        mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        filePath: charterFilePath,
        signedFilePath: null,
        driveFileId: null,
        driveUrl: null,
        verificationStatus: null,
        verificationMessage: null,
        verifiedAt: null,
        createdAt: new Date("2021-04-01"),
        updatedAt: new Date("2021-04-01"),
        assignedAt: null,
        user: null,
      };

      incomingWithApproval.unshift({ ...charterDocument, approvalStatus: undefined, meetingId: undefined, originalDocumentId: undefined, originalDocumentStatus: undefined });
    }

    // Сортируем исходящие документы по приоритету
    const sortedOutgoingDocuments = outgoingDocuments.sort((a, b) => {
      const getPriority = (type: string) => {
        switch (type) {
          case "MEMBERSHIP_APPLICATION":
            return 1;
          case "CONTRIBUTION_APPLICATION":
            return 2;
          case "APPEAL":
            return 3;
          case "OTHER":
            return 4;
          default:
            return 5;
        }
      };

      const priorityA = getPriority(a.type);
      const priorityB = getPriority(b.type);

      if (priorityA !== priorityB) {
        return priorityA - priorityB;
      }

      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });

    return NextResponse.json({ 
      incomingDocuments: incomingWithApproval,
      outgoingDocuments: sortedOutgoingDocuments,
      isElectedBody,
    });
  } catch (error) {
    console.error("Ошибка получения документов:", error);
    return NextResponse.json(
      { error: "Ошибка при получении документов" },
      { status: 500 }
    );
  }
}

