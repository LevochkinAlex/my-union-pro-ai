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

    const orgHead = await getOrgHead(session.user.id);

    if (!orgHead) {
      return NextResponse.json({ error: "Нет доступа" }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status") as MeetingStatus | null;
    const type = searchParams.get("type") as MeetingType | null;
    const year = searchParams.get("year");

    const where: any = {
      organizationId: orgHead.organizationId,
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

    return NextResponse.json({ meetings });
  } catch (error: any) {
    console.error("[ppo-head/meetings] GET error:", error);
    return NextResponse.json(
      {
        error: "Ошибка при получении заседаний",
        details: process.env.NODE_ENV === "development" ? error.message : undefined,
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
      secretaryId,
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
    
    // Секретарь (если указан и еще не добавлен как председатель)
    if (secretaryId && !addedUserIds.has(secretaryId)) {
      participantsToCreate.push({
        userId: secretaryId,
        role: "SECRETARY" as const,
        attendance: "INVITED" as const,
        canVote: true,
      });
      addedUserIds.add(secretaryId);
    }
    
    // Члены профкома (исключаем только тех, кто уже добавлен)
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
            // Докладчик - может быть из базы или внешний
            speakerId: item.speakerId || null,
            speakerName: item.speakerName || null,
            // Если выбран пользователь из базы, получим его позицию при необходимости
            heardText: item.title || `Вопрос ${index + 1}`, // По умолчанию = title
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
