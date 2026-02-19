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
 * @param chairmanName — имя председателя для текста «документ от ...» (если не передано, подставляется «Председатель»).
 */
export async function assignAgendaToParticipantsAndNotify(
  meetingId: string,
  createdByUserId: string,
  chairmanName?: string
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

  try {
    await sendMassNotification({
      userIds: participantUserIds,
      title: `Повестка дня на согласование: Заседание №${meeting.number}`,
      body: `Просьба согласовать или ознакомиться с документом от ${fromName}. Заседание ${meetingDate}. Документ во вкладке «Входящие».`,
      url: `/dashboard/documents?tab=incoming`,
      type: "meeting_agenda_review",
      metadata: { meetingId: meeting.id, documentId: meeting.agendaDocument!.id },
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
