import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { checkUserPermissions } from "@/lib/staff-permissions";
import { DocumentType } from "@prisma/client";

/**
 * GET /api/ppo-head/meetings/[id]
 * Получение заседания по ID с полной информацией
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }

    const currentUser = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { membershipStatus: true, unionMembershipStatus: true },
    });
    const isReApplying =
      currentUser?.unionMembershipStatus === "REMOVED" &&
      (currentUser?.membershipStatus === "DOCUMENTS_PENDING" ||
        currentUser?.membershipStatus === "PROFILE_INCOMPLETE");
    if (
      currentUser?.membershipStatus === "EXCLUDED" ||
      (currentUser?.unionMembershipStatus === "REMOVED" && !isReApplying)
    ) {
      return NextResponse.json(
        { error: "Доступ закрыт: вы исключены из профсоюза" },
        { status: 403 }
      );
    }

    const { id } = await params;

    const meeting = await prisma.meeting.findUnique({
      where: { id },
      include: {
        organization: {
          select: { id: true, name: true, chairmanName: true, chairmanJobTitle: true },
        },
        createdBy: {
          select: { id: true, firstName: true, lastName: true, middleName: true },
        },
        agendaDocument: {
          include: {
            approvals: {
              include: {
                user: {
                  select: {
                    id: true,
                    firstName: true,
                    lastName: true,
                    middleName: true,
                  },
                },
              },
              orderBy: { order: "asc" },
            },
          },
        },
        protocolDocument: {
          select: { id: true, regNumber: true, status: true, filePath: true, signedFilePath: true, title: true, createdAt: true },
        },
        resolutions: {
          select: { id: true, regNumber: true, status: true, filePath: true, signedFilePath: true, title: true, metadata: true },
        },
        extracts: {
          select: { id: true, regNumber: true, status: true, filePath: true, title: true },
        },
        participants: {
          include: {
            user: {
              select: { 
                id: true, 
                firstName: true, 
                lastName: true, 
                middleName: true, 
                jobTitle: true,
                email: true,
              },
            },
          },
          orderBy: [
            { role: "asc" },
            { createdAt: "asc" },
          ],
        },
        agendaItems: {
          include: {
            speaker: {
              select: { id: true, firstName: true, lastName: true, middleName: true },
            },
            votes: {
              include: {
                user: {
                  select: { id: true, firstName: true, lastName: true },
                },
              },
            },
          },
          orderBy: { orderNumber: "asc" },
        },
        groupChat: { select: { id: true, archivedAt: true } },
      },
    });

    if (!meeting) {
      return NextResponse.json({ error: "Заседание не найдено" }, { status: 404 });
    }

    // По одному постановлению на вопрос повестки: удаляем дубликаты в БД и в ответе
    const resolutions = (meeting.resolutions || []) as Array<{ id: string; metadata?: { agendaItemId?: string } | null; createdAt?: Date; [k: string]: unknown }>;
    const byAgendaItem = new Map<string, typeof resolutions>();
    for (const r of resolutions) {
      const agendaItemId = r.metadata?.agendaItemId;
      if (!agendaItemId) continue;
      if (!byAgendaItem.has(agendaItemId)) byAgendaItem.set(agendaItemId, []);
      byAgendaItem.get(agendaItemId)!.push(r);
    }
    const idsToDelete: string[] = [];
    const uniqueResolutions: typeof resolutions = [];
    for (const [, group] of byAgendaItem) {
      group.sort((a, b) => (a.createdAt && b.createdAt ? new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime() : 0));
      uniqueResolutions.push(group[0]);
      for (let i = 1; i < group.length; i++) idsToDelete.push(group[i].id);
    }
    const resolutionsWithoutAgendaId = resolutions.filter((r) => !(r.metadata as { agendaItemId?: string } | null)?.agendaItemId);
    (meeting as { resolutions: unknown }).resolutions = [...resolutionsWithoutAgendaId, ...uniqueResolutions];
    if (idsToDelete.length > 0) {
      await prisma.document.deleteMany({
        where: { id: { in: idsToDelete }, type: DocumentType.RESOLUTION, meetingResolutionId: meeting.id },
      });
    }

    const perm = await checkUserPermissions(session.user.id, "documents_view");
    const isParticipant = meeting.participants.some((p) => p.userId === session.user.id);
    const canDeleteMeeting =
      perm.isChairman || (!!perm.roleName && /зам|заместитель/i.test(perm.roleName));

    const docUpdatedAt = (meeting.agendaDocument as { updatedAt?: Date } | null)?.updatedAt;
    const byModifiedFlag =
      !!docUpdatedAt &&
      !!meeting.agendaModifiedAt &&
      new Date(meeting.agendaModifiedAt) > new Date(docUpdatedAt);
    const byItemDates =
      !!docUpdatedAt &&
      meeting.agendaItems?.length > 0 &&
      meeting.agendaItems.some(
        (item: { updatedAt?: Date }) =>
          item.updatedAt && new Date(item.updatedAt) > new Date(docUpdatedAt)
      );
    const agendaNeedsRegenerate = byModifiedFlag || byItemDates;

    let protocolSentToInbox = false;
    if (meeting.protocolDocument?.id) {
      const copyCount = await prisma.document.count({
        where: {
          type: "PROTOCOL",
          assignedToId: { not: null },
          metadata: { path: ["originalDocumentId"], equals: meeting.protocolDocument!.id },
        },
      });
      protocolSentToInbox = copyCount > 0;
    }

    if (perm.hasAccess && perm.organizationId && meeting.organizationId === perm.organizationId) {
      return NextResponse.json({ meeting, canDeleteMeeting, agendaNeedsRegenerate, protocolSentToInbox });
    }
    if (isParticipant) {
      return NextResponse.json({ meeting, readOnly: true, canDeleteMeeting: false, agendaNeedsRegenerate: false, protocolSentToInbox });
    }

    return NextResponse.json({ error: "Нет доступа к этому заседанию" }, { status: 403 });
  } catch (error: any) {
    console.error("[ppo-head/meetings/[id]] GET error:", error);
    return NextResponse.json(
      {
        error: "Ошибка при получении заседания",
        details: process.env.NODE_ENV === "development" ? error.message : undefined,
      },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/ppo-head/meetings/[id]
 * Обновление заседания
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }

    const perm = await checkUserPermissions(session.user.id, "documents_edit");
    if (!perm.hasAccess || !perm.organizationId) {
      return NextResponse.json({ error: "Нет прав на редактирование заседаний" }, { status: 403 });
    }

    const { id } = await params;

    const meeting = await prisma.meeting.findUnique({
      where: { id },
    });

    if (!meeting) {
      return NextResponse.json({ error: "Заседание не найдено" }, { status: 404 });
    }

    if (meeting.organizationId !== perm.organizationId) {
      return NextResponse.json({ error: "Нет доступа к этому заседанию" }, { status: 403 });
    }

    const body = await request.json();
    const {
      status,
      title,
      scheduledDate,
      scheduledTime,
      location,
      onlineLink,
      format,
      notes,
      presidingOfficerUserId,
      secretaryUserId,
      voteCounterUserIds,
      protocolProceduralData,
      invitedGuests,
    } = body;

    const updateData: any = {};

    if (status) updateData.status = status;
    if (title !== undefined) updateData.title = title;
    if (scheduledDate) updateData.scheduledDate = new Date(scheduledDate);
    if (scheduledTime !== undefined) updateData.scheduledTime = scheduledTime;
    if (location !== undefined) updateData.location = location;
    if (onlineLink !== undefined) updateData.onlineLink = onlineLink;
    if (format) updateData.format = format;
    if (notes !== undefined) updateData.notes = notes;
    if (presidingOfficerUserId !== undefined) updateData.presidingOfficerUserId = presidingOfficerUserId || null;
    if (secretaryUserId !== undefined) updateData.secretaryUserId = secretaryUserId || null;
    if (voteCounterUserIds !== undefined) updateData.voteCounterUserIds = Array.isArray(voteCounterUserIds) ? (voteCounterUserIds.length ? JSON.stringify(voteCounterUserIds) : null) : (voteCounterUserIds ?? null);
    if (protocolProceduralData !== undefined) updateData.protocolProceduralData = protocolProceduralData;
    if (invitedGuests !== undefined) updateData.invitedGuests = invitedGuests;

    // Обновление времени начала/окончания
    if (status === "IN_PROGRESS" && !meeting.actualStartAt) {
      updateData.actualStartAt = new Date();
    }
    if (status === "COMPLETED" && !meeting.actualEndAt) {
      updateData.actualEndAt = new Date();
    }

    const updatedMeeting = await prisma.meeting.update({
      where: { id },
      data: updateData,
      include: {
        organization: { select: { id: true, name: true, chairmanName: true, chairmanJobTitle: true } },
        createdBy: { select: { id: true, firstName: true, lastName: true, middleName: true } },
        agendaDocument: { select: { id: true, regNumber: true, status: true, filePath: true, title: true, createdAt: true } },
        protocolDocument: { select: { id: true, regNumber: true, status: true, filePath: true, title: true, createdAt: true } },
        resolutions: { select: { id: true, regNumber: true, status: true, filePath: true, title: true, metadata: true } },
        extracts: { select: { id: true, regNumber: true, status: true, filePath: true, title: true } },
        participants: {
          include: {
            user: {
              select: { id: true, firstName: true, lastName: true, middleName: true, jobTitle: true, email: true },
            },
          },
          orderBy: [{ role: "asc" }, { createdAt: "asc" }],
        },
        agendaItems: {
          include: {
            speaker: { select: { id: true, firstName: true, lastName: true, middleName: true } },
            votes: { include: { user: { select: { id: true, firstName: true, lastName: true } } } },
          },
          orderBy: { orderNumber: "asc" },
        },
      },
    });

    return NextResponse.json({ meeting: updatedMeeting });
  } catch (error: any) {
    console.error("[ppo-head/meetings/[id]] PATCH error:", error);
    return NextResponse.json(
      {
        error: "Ошибка при обновлении заседания",
        details: process.env.NODE_ENV === "development" ? error.message : undefined,
      },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/ppo-head/meetings/[id]
 * Удаление заседания (в любом статусе)
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }

    const perm = await checkUserPermissions(session.user.id, "documents_edit");
    if (!perm.hasAccess || !perm.organizationId) {
      return NextResponse.json({ error: "Нет прав на удаление заседаний" }, { status: 403 });
    }

    const { id } = await params;

    const meeting = await prisma.meeting.findUnique({
      where: { id },
      select: {
        id: true,
        organizationId: true,
        agendaDocumentId: true,
        protocolDocumentId: true,
      },
    });

    if (!meeting) {
      return NextResponse.json({ error: "Заседание не найдено" }, { status: 404 });
    }

    if (meeting.organizationId !== perm.organizationId) {
      return NextResponse.json({ error: "Нет доступа к этому заседанию" }, { status: 403 });
    }

    const originalDocIds = [meeting.agendaDocumentId, meeting.protocolDocumentId].filter(
      (x): x is string => x != null
    );

    // ID постановлений и выписок заседания (вся исходящая корреспонденция по заседанию)
    const resolutionAndExtractDocs = await prisma.document.findMany({
      where: {
        OR: [{ meetingResolutionId: id }, { meetingExtractId: id }],
      },
      select: { id: true },
    });
    const resolutionAndExtractIds = resolutionAndExtractDocs.map((d) => d.id);
    const allDocumentIds = [...new Set([...originalDocIds, ...resolutionAndExtractIds])];

    // Удаляем групповой чат заседания (если есть); участники и сообщения удалятся по каскаду
    await prisma.chat.deleteMany({
      where: { meetingId: id },
    });

    // Удаляем все уведомления, связанные с заседанием (metadata.meetingId или documentId по документам заседания)
    await prisma.userNotification.deleteMany({
      where: { metadata: { path: ["meetingId"], equals: id } },
    });
    if (allDocumentIds.length > 0) {
      await prisma.userNotification.deleteMany({
        where: {
          OR: allDocumentIds.map((docId) => ({
            metadata: { path: ["documentId"], equals: docId },
          })),
        },
      });
    }

    // Удаляем копии документов заседания во входящих (повестка, протокол, постановления, выписки)
    if (allDocumentIds.length > 0) {
      const copyDocs = await prisma.document.findMany({
        where: {
          assignedToId: { not: null },
          OR: allDocumentIds.map((originalId) => ({
            metadata: { path: ["originalDocumentId"], equals: originalId },
          })),
        },
        select: { id: true },
      });
      const copyIds = copyDocs.map((d) => d.id);
      if (copyIds.length > 0) {
        await prisma.document.deleteMany({
          where: { id: { in: copyIds } },
        });
      }
      await prisma.documentApproval.deleteMany({
        where: { documentId: { in: allDocumentIds } },
      });
      await prisma.documentStatusHistory.deleteMany({
        where: { documentId: { in: allDocumentIds } },
      });
      await prisma.document.deleteMany({
        where: { id: { in: allDocumentIds } },
      });
    }

    await prisma.meeting.delete({
      where: { id },
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("[ppo-head/meetings/[id]] DELETE error:", error);
    return NextResponse.json(
      {
        error: "Ошибка при удалении заседания",
        details: process.env.NODE_ENV === "development" ? error.message : undefined,
      },
      { status: 500 }
    );
  }
}
