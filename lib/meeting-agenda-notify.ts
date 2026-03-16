/**
 * Назначение повестки дня участникам заседания и отправка уведомлений (push + email).
 * Документ появляется во «Входящих» у каждого участника (копия с assignedToId = userId).
 */

import { prisma } from "@/lib/prisma";
import { sendMassNotification } from "@/lib/notifications";

export interface AssignAgendaResult {
  assignedCount: number;
  notifiedCount: number;
}

export interface AssignAgendaOptions {
  /** false = председатель утвердил без согласования; уведомления без кнопок «Согласовать»/«Отклонить» */
  approvalRequired?: boolean;
}

/**
 * Назначает повестку дня всем участникам заседания (создаёт копии во входящие)
 * и отправляет push + email уведомления.
 * @param chairmanName — имя председателя для текста «документ от ...» (если не передано, подставляется «Председатель»).
 * @param options.approvalRequired — при false (утверждение без согласования) тип уведомления «только ознакомиться», без кнопок согласования.
 */
export async function assignAgendaToParticipantsAndNotify(
  meetingId: string,
  createdByUserId: string,
  chairmanName?: string,
  options?: AssignAgendaOptions
): Promise<AssignAgendaResult> {
  const meeting = await prisma.meeting.findUnique({
    where: { id: meetingId },
    include: {
      participants: {
        where: { userId: { not: null } },
        include: {
          user: {
            select: { id: true },
          },
        },
      },
      agendaDocument: {
        select: {
          id: true,
          title: true,
          content: true,
          regNumber: true,
          filePath: true,
          fileName: true,
        },
      },
    },
  });

  if (!meeting?.agendaDocument) {
    return { assignedCount: 0, notifiedCount: 0 };
  }

  // Имя председателя для текста «документ от ...»
  let fromName = chairmanName?.trim();
  if (!fromName) {
    const creator = await prisma.user.findUnique({
      where: { id: createdByUserId },
      select: { lastName: true, firstName: true },
    });
    fromName = [creator?.lastName, creator?.firstName].filter(Boolean).join(" ") || "Председатель";
  }

  // Копии и уведомления — только участникам с привязанным пользователем (userId), не председателю
  const participantUserIds = meeting.participants
    .filter((p): p is typeof p & { user: { id: string } } => p.user != null && p.role !== "CHAIRMAN")
    .map((p) => p.user.id);

  if (participantUserIds.length === 0) {
    console.warn("[meeting-agenda-notify] Нет участников для уведомления (все без userId или только председатель). Убедитесь, что в заседании добавлены участники с привязанными учётными записями.");
    return { assignedCount: 0, notifiedCount: 0 };
  }

  console.log(`[meeting-agenda-notify] Повестка: уведомление ${participantUserIds.length} участникам (userId: ${participantUserIds.slice(0, 5).join(", ")}${participantUserIds.length > 5 ? "…" : ""})`);

  // Кто уже имеет назначенную повестку (оригинал или копию)
  const existingAssigned = await prisma.document.findMany({
    where: {
      OR: [
        { id: meeting.agendaDocument!.id },
        {
          metadata: { path: ["originalDocumentId"], equals: meeting.agendaDocument!.id },
        },
      ],
      assignedToId: { in: participantUserIds },
    },
    select: { assignedToId: true },
  });
  const assignedUserIds = new Set(
    (existingAssigned.map((d) => d.assignedToId).filter(Boolean) as string[])
  );
  const usersToAssign = participantUserIds.filter((id) => !assignedUserIds.has(id));

  let assignedCount = 0;
  if (usersToAssign.length > 0) {
    const agendaDoc = meeting.agendaDocument;
    await Promise.all(
      usersToAssign.map((userId) =>
        prisma.document.create({
          data: {
            type: "AGENDA",
            status: "GENERATED",
            category: "INTERNAL",
            title: agendaDoc.title,
            content: agendaDoc.content,
            regNumber: agendaDoc.regNumber
              ? `${agendaDoc.regNumber}-${userId.slice(0, 4)}`
              : null,
            regDate: new Date(),
            filePath: agendaDoc.filePath,
            fileName: agendaDoc.fileName,
            userId: createdByUserId,
            organizationId: meeting.organizationId,
            assignedToId: userId,
            assignedAt: new Date(),
            metadata: {
              meetingId: meeting.id,
              meetingNumber: meeting.number,
              meetingDate: meeting.scheduledDate.toISOString(),
              isCopy: true,
              originalDocumentId: meeting.agendaDocument!.id,
            },
          },
        })
      )
    );
    assignedCount = usersToAssign.length;
  }

  const meetingDate = new Date(meeting.scheduledDate).toLocaleDateString("ru-RU", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  const approvalRequired = options?.approvalRequired !== false;
  try {
    await sendMassNotification({
      userIds: participantUserIds,
      title: approvalRequired
        ? `Повестка дня на согласование: Заседание №${meeting.number}`
        : `Повестка дня утверждена: Заседание №${meeting.number}`,
      body: approvalRequired
        ? `Просьба согласовать или ознакомиться с документом от ${fromName}. Заседание ${meetingDate}. Документ во вкладке «Входящие».`
        : `Председатель утвердил повестку. Ознакомьтесь с документом во вкладке «Входящие». Заседание ${meetingDate}.`,
      url: `/dashboard/documents/meetings/${meeting.id}`,
      type: approvalRequired ? "meeting_agenda_review" : "meeting_agenda_approved",
      metadata: {
        meetingId: meeting.id,
        documentId: meeting.agendaDocument!.id,
        ...(approvalRequired ? {} : { approvedWithoutReview: true }),
      },
    });
  } catch (err) {
    console.error("[meeting-agenda-notify] Ошибка отправки push/email участникам:", err);
    throw err;
  }

  return { assignedCount, notifiedCount: participantUserIds.length };
}

/**
 * Назначает повестку дня только указанным участникам (создаёт копии во входящие и уведомляет).
 * Используется при синхронизации чата заседания, когда в чат добавлены новые участники.
 */
export async function assignAgendaToUserIds(
  meetingId: string,
  userIds: string[],
  createdByUserId: string
): Promise<AssignAgendaResult> {
  if (userIds.length === 0) return { assignedCount: 0, notifiedCount: 0 };

  const meeting = await prisma.meeting.findUnique({
    where: { id: meetingId },
    include: {
      participants: {
        where: { userId: { not: null } },
        select: { userId: true, role: true },
      },
      agendaDocument: {
        select: {
          id: true,
          title: true,
          content: true,
          regNumber: true,
          filePath: true,
          fileName: true,
        },
      },
    },
  });

  if (!meeting?.agendaDocument) return { assignedCount: 0, notifiedCount: 0 };

  // Не назначаем копии председателю — он утверждает на странице заседания
  const chairmanUserId = meeting.participants.find((p) => p.role === "CHAIRMAN")?.userId ?? null;
  const userIdsToAssign = chairmanUserId ? userIds.filter((id) => id !== chairmanUserId) : userIds;
  if (userIdsToAssign.length === 0) return { assignedCount: 0, notifiedCount: userIds.length };

  const existingAssigned = await prisma.document.findMany({
    where: {
      OR: [
        { id: meeting.agendaDocument!.id },
        {
          metadata: { path: ["originalDocumentId"], equals: meeting.agendaDocument!.id },
        },
      ],
      assignedToId: { in: userIdsToAssign },
    },
    select: { assignedToId: true },
  });
  const assignedUserIds = new Set(
    (existingAssigned.map((d) => d.assignedToId).filter(Boolean) as string[])
  );
  const usersToAssign = userIdsToAssign.filter((id) => !assignedUserIds.has(id));

  let assignedCount = 0;
  if (usersToAssign.length > 0) {
    const agendaDoc = meeting.agendaDocument;
    await Promise.all(
      usersToAssign.map((userId) =>
        prisma.document.create({
          data: {
            type: "AGENDA",
            status: "GENERATED",
            category: "INTERNAL",
            title: agendaDoc.title,
            content: agendaDoc.content,
            regNumber: agendaDoc.regNumber
              ? `${agendaDoc.regNumber}-${userId.slice(0, 4)}`
              : null,
            regDate: new Date(),
            filePath: agendaDoc.filePath,
            fileName: agendaDoc.fileName,
            userId: createdByUserId,
            organizationId: meeting.organizationId,
            assignedToId: userId,
            assignedAt: new Date(),
            metadata: {
              meetingId: meeting.id,
              meetingNumber: meeting.number,
              meetingDate: meeting.scheduledDate.toISOString(),
              isCopy: true,
              originalDocumentId: meeting.agendaDocument!.id,
            },
          },
        })
      )
    );
    assignedCount = usersToAssign.length;

    const meetingDate = new Date(meeting.scheduledDate).toLocaleDateString("ru-RU", {
      day: "numeric",
      month: "long",
      year: "numeric",
    });
    await sendMassNotification({
      userIds: usersToAssign,
      title: `Повестка дня: Заседание №${meeting.number}`,
      body: `Вам направлена повестка дня заседания ${meetingDate}. Ознакомьтесь во вкладке «Входящие».`,
      url: `/dashboard/documents?tab=incoming`,
      type: "meeting_agenda_review",
      metadata: { meetingId: meeting.id, documentId: meeting.agendaDocument!.id },
    });
  }

  return { assignedCount, notifiedCount: userIdsToAssign.length };
}

export interface AssignProtocolResult {
  assignedCount: number;
}

/**
 * Назначает протокол заседания всем участникам (создаёт копии во «Входящие»).
 * Используется при отправке на согласование, при утверждении и при подписании протокола.
 */
export async function assignProtocolToParticipantsAndNotify(
  meetingId: string,
  protocolDocumentId: string,
  createdByUserId: string
): Promise<AssignProtocolResult> {
  const meeting = await prisma.meeting.findUnique({
    where: { id: meetingId },
    include: {
      participants: {
        where: { userId: { not: null } },
        include: {
          user: { select: { id: true } },
        },
      },
    },
  });

  const protocolDoc = await prisma.document.findUnique({
    where: { id: protocolDocumentId },
    select: {
      id: true,
      title: true,
      content: true,
      regNumber: true,
      filePath: true,
      fileName: true,
      signedFilePath: true,
    },
  });

  if (!meeting || !protocolDoc) {
    return { assignedCount: 0 };
  }

  const participantUserIds = meeting.participants
    .filter((p): p is typeof p & { user: { id: string } } => p.user != null && p.role !== "CHAIRMAN")
    .map((p) => p.user.id);

  if (participantUserIds.length === 0) {
    return { assignedCount: 0 };
  }

  const existingAssigned = await prisma.document.findMany({
    where: {
      OR: [
        { id: protocolDoc.id },
        { metadata: { path: ["originalDocumentId"], equals: protocolDoc.id } },
      ],
      assignedToId: { in: participantUserIds },
    },
    select: { assignedToId: true },
  });
  const assignedUserIds = new Set(
    (existingAssigned.map((d) => d.assignedToId).filter(Boolean) as string[])
  );
  const usersToAssign = participantUserIds.filter((id) => !assignedUserIds.has(id));

  if (usersToAssign.length === 0) {
    return { assignedCount: 0 };
  }

  const meetingDate = new Date(meeting.scheduledDate).toLocaleDateString("ru-RU", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  const title =
    protocolDoc.regNumber != null
      ? `Протокол заседания профкома ${protocolDoc.regNumber} от ${meetingDate}`
      : `Протокол заседания от ${meetingDate}`;

  const protocolFilePath = protocolDoc.signedFilePath ?? protocolDoc.filePath;
  const protocolFileName = protocolFilePath?.split("/").pop() ?? protocolDoc.fileName;

  await Promise.all(
    usersToAssign.map((userId) =>
      prisma.document.create({
        data: {
          type: "PROTOCOL",
          status: "GENERATED",
          category: "INTERNAL",
          title,
          content: protocolDoc.content,
          regNumber: protocolDoc.regNumber
            ? `${protocolDoc.regNumber}-${userId.slice(0, 4)}`
            : null,
          regDate: new Date(),
          filePath: protocolFilePath,
          fileName: protocolFileName,
          userId: createdByUserId,
          organizationId: meeting.organizationId,
          assignedToId: userId,
          assignedAt: new Date(),
          metadata: {
            meetingId: meeting.id,
            meetingNumber: meeting.number,
            meetingDate: meeting.scheduledDate.toISOString(),
            isCopy: true,
            originalDocumentId: protocolDoc.id,
          },
        },
      })
    )
  );

  return { assignedCount: usersToAssign.length };
}
