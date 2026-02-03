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

/**
 * Назначает повестку дня всем участникам заседания (создаёт копии во входящие)
 * и отправляет push + email уведомления.
 * Вызывается после создания повестки (generate-document) или при ручной рассылке (notify-participants).
 */
export async function assignAgendaToParticipantsAndNotify(
  meetingId: string,
  createdByUserId: string
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

  // Копии и уведомления — только участникам, не председателю (председатель утверждает на странице заседания)
  const participantUserIds = meeting.participants
    .filter((p): p is typeof p & { user: { id: string } } => p.user != null && p.role !== "CHAIRMAN")
    .map((p) => p.user.id);

  if (participantUserIds.length === 0) {
    return { assignedCount: 0, notifiedCount: 0 };
  }

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

  await sendMassNotification({
    userIds: participantUserIds,
    title: `Повестка дня: Заседание №${meeting.number}`,
    body: `Вы приглашены на заседание ${meetingDate}. Ознакомьтесь с повесткой дня.`,
    url: `/dashboard/documents`,
    type: "meeting_agenda_review",
  });

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
      url: `/dashboard/documents`,
      type: "meeting_agenda_review",
    });
  }

  return { assignedCount, notifiedCount: userIdsToAssign.length };
}
