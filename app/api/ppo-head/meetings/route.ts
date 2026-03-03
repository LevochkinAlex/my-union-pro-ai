import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getOrgHead } from "@/lib/ppo-head-utils";
import { MeetingType, MeetingStatus, MeetingFormat } from "@prisma/client";

/**
 * GET /api/ppo-head/meetings
 * Получение списка заседаний организации
 */
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }

    const currentUser = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { membershipStatus: true, unionMembershipStatus: true },
    });
    if (
      currentUser?.membershipStatus === "EXCLUDED" ||
      currentUser?.unionMembershipStatus === "REMOVED"
    ) {
      return NextResponse.json(
        { error: "Доступ закрыт: вы исключены из профсоюза" },
        { status: 403 }
      );
    }

    const orgHead = await getOrgHead(session.user.id);
    const organizationId = orgHead?.organizationId ?? null;
    const isOrgHead = !!orgHead;

    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status") as MeetingStatus | null;
    const type = searchParams.get("type") as MeetingType | null;
    const year = searchParams.get("year");

    // Председатель: заседания организации + созданные им. Участник (зам., член профкома): заседания, где он участник, или созданные им
    const where: any = organizationId
      ? { OR: [{ organizationId }, { createdById: session.user.id }] }
      : {
          OR: [
            { createdById: session.user.id },
            { participants: { some: { userId: session.user.id } } },
          ],
        };

    if (status) {
      where.status = status;
    }

    if (type) {
      where.type = type;
    }

    if (year) {
      const yearInt = parseInt(year);
      where.scheduledDate = {
        gte: new Date(yearInt, 0, 1),
        lt: new Date(yearInt + 1, 0, 1),
      };
    }

    const meetings = await prisma.meeting.findMany({
      where,
      include: {
        createdBy: {
          select: { id: true, firstName: true, lastName: true },
        },
        agendaDocument: {
          select: { id: true, regNumber: true, status: true, filePath: true },
        },
        protocolDocument: {
          select: { id: true, regNumber: true, status: true, filePath: true },
        },
        groupChat: { select: { id: true } },
        _count: {
          select: {
            participants: true,
            agendaItems: true,
            resolutions: true,
            extracts: true,
          },
        },
      },
      orderBy: [
        { scheduledDate: "desc" },
        { createdAt: "desc" },
      ],
    });

    return NextResponse.json({ meetings, isOrgHead });
  } catch (error: any) {
    const errMsg = error?.message ?? String(error);
    const errStack = error?.stack;
    console.error("[ppo-head/meetings] GET error:", errMsg, errStack);
    return NextResponse.json(
      {
        error: "Ошибка при получении заседаний",
        details: errMsg || undefined,
        stack: process.env.NODE_ENV === "development" ? errStack : undefined,
      },
      { status: 500 }
    );
  }
}

/**
 * POST /api/ppo-head/meetings
 * Создание нового заседания
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }

    const orgHead = await getOrgHead(session.user.id);

    if (!orgHead) {
      return NextResponse.json({ error: "Нет доступа" }, { status: 403 });
    }

    const body = await request.json();
    const {
      type = "COMMITTEE",
      format = "OFFLINE",
      title,
      scheduledDate,
      scheduledTime,
      location,
      onlineLink,
      participantIds = [],
      externalParticipants = [],
      agendaItems = [],
    } = body;

    if (!scheduledDate) {
      return NextResponse.json(
        { error: "Укажите дату заседания" },
        { status: 400 }
      );
    }

    // Генерация номера заседания в году
    const year = new Date(scheduledDate).getFullYear();
    const meetingsInYear = await prisma.meeting.count({
      where: {
        organizationId: orgHead.organizationId,
        scheduledDate: {
          gte: new Date(year, 0, 1),
          lt: new Date(year + 1, 0, 1),
        },
      },
    });
    const meetingNumber = String(meetingsInYear + 1);

    // Подготовка списка участников (исключаем дубликаты по userId)
    const addedUserIds = new Set<string>();
    
    const participantsToCreate: any[] = [
      // Председатель (всегда добавляется первым)
      {
        userId: session.user.id,
        role: "CHAIRMAN",
        attendance: "PRESENT",
        canVote: true,
      },
    ];
    addedUserIds.add(session.user.id);
    
    // Члены профкома (выборный орган; секретарь избирается на шаге протокола) (исключаем только тех, кто уже добавлен)
    const uniqueParticipantIds = participantIds.filter(
      (userId: string) => !addedUserIds.has(userId)
    );
    
    uniqueParticipantIds.forEach((userId: string) => {
      participantsToCreate.push({
        userId,
        role: "MEMBER" as const,
        attendance: "INVITED" as const,
        canVote: true,
      });
      addedUserIds.add(userId);
    });
    
    // Внешние участники
    externalParticipants.forEach((ext: any) => {
      participantsToCreate.push({
        externalName: ext.name,
        externalPosition: ext.position,
        role: "INVITED" as const, // Приглашённый (без права голоса)
        attendance: "INVITED" as const,
        canVote: false,
      });
    });

    // Создание заседания с участниками и пунктами повестки
    const meeting = await prisma.meeting.create({
      data: {
        organizationId: orgHead.organizationId,
        type: type as MeetingType,
        status: MeetingStatus.DRAFT,
        format: format as MeetingFormat,
        number: meetingNumber,
        title: title || `Заседание профкома №${meetingNumber}`,
        scheduledDate: new Date(scheduledDate),
        scheduledTime,
        location,
        onlineLink,
        createdById: session.user.id,
        // Добавление участников
        participants: {
          create: participantsToCreate,
        },
        // Добавление пунктов повестки
        agendaItems: {
          create: agendaItems.map((item: any, index: number) => ({
            orderNumber: index + 1,
            title: item.title || `Вопрос ${index + 1}`,
            description: item.description,
            speakerId: item.speakerId || null,
            speakerName: item.speakerName || null,
            speakerPosition: item.speakerPosition?.trim() || null,
            coSpeakerId: item.coSpeakerId || null,
            coSpeakerName: item.coSpeakerName || null,
            heardText: item.title || `Вопрос ${index + 1}`,
            attachments: Array.isArray(item.attachments) && item.attachments.length > 0
              ? JSON.stringify(item.attachments)
              : null,
          })),
        },
      },
      include: {
        participants: {
          include: {
            user: {
              select: { id: true, firstName: true, lastName: true, middleName: true, jobTitle: true },
            },
          },
        },
        agendaItems: true,
      },
    });

    return NextResponse.json({ meeting }, { status: 201 });
  } catch (error: any) {
    console.error("[ppo-head/meetings] POST error:", error);
    return NextResponse.json(
      {
        error: "Ошибка при создании заседания",
        details: process.env.NODE_ENV === "development" ? error.message : undefined,
      },
      { status: 500 }
    );
  }
}
