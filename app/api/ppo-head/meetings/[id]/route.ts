import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getOrgHead } from "@/lib/ppo-head-utils";

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
          select: { id: true, regNumber: true, status: true, filePath: true, title: true },
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
        groupChat: { select: { id: true } },
      },
    });

    if (!meeting) {
      return NextResponse.json({ error: "Заседание не найдено" }, { status: 404 });
    }

    const orgHead = await getOrgHead(session.user.id);
    const isParticipant = meeting.participants.some((p) => p.userId === session.user.id);

    if (orgHead && meeting.organizationId === orgHead.organizationId) {
      return NextResponse.json({ meeting });
    }
    if (isParticipant) {
      return NextResponse.json({ meeting, readOnly: true });
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

    const orgHead = await getOrgHead(session.user.id);

    if (!orgHead) {
      return NextResponse.json({ error: "Нет доступа" }, { status: 403 });
    }

    const { id } = await params;

    const meeting = await prisma.meeting.findUnique({
      where: { id },
    });

    if (!meeting) {
      return NextResponse.json({ error: "Заседание не найдено" }, { status: 404 });
    }

    if (meeting.organizationId !== orgHead.organizationId) {
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
        participants: {
          include: {
            user: {
              select: { id: true, firstName: true, lastName: true, middleName: true },
            },
          },
        },
        agendaItems: true,
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

    const orgHead = await getOrgHead(session.user.id);

    if (!orgHead) {
      return NextResponse.json({ error: "Нет доступа" }, { status: 403 });
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

    if (meeting.organizationId !== orgHead.organizationId) {
      return NextResponse.json({ error: "Нет доступа к этому заседанию" }, { status: 403 });
    }

    const originalDocIds = [meeting.agendaDocumentId, meeting.protocolDocumentId].filter(
      (x): x is string => x != null
    );

    // Удаляем копии документов заседания во входящих у участников (metadata.originalDocumentId = повестка/протокол)
    if (originalDocIds.length > 0) {
      const copyDocs = await prisma.document.findMany({
        where: {
          assignedToId: { not: null },
          OR: originalDocIds.map((originalId) => ({
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
      // Согласования по оригинальным повестке/протоколу
      await prisma.documentApproval.deleteMany({
        where: { documentId: { in: originalDocIds } },
      });
      // Удаляем сами документы повестки и протокола (связь с Meeting обнулится при delete за счёт FK)
      await prisma.document.deleteMany({
        where: { id: { in: originalDocIds } },
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
