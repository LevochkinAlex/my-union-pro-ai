import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getOrgHead } from "@/lib/ppo-head-utils";
import { sendMassNotification } from "@/lib/notifications";

/**
 * POST /api/ppo-head/meetings/[id]/notify-participants
 * Отправка уведомлений участникам заседания
 */
export async function POST(
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

    const resolvedParams = await params;
    const meetingId = resolvedParams.id;
    const { type } = await request.json();

    // Получаем заседание с участниками
    const meeting = await prisma.meeting.findFirst({
      where: {
        id: meetingId,
        organizationId: orgHead.organizationId,
      },
      include: {
        participants: {
          where: {
            userId: { not: null },
          },
          include: {
            user: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                email: true,
              },
            },
          },
        },
        agendaDocument: {
          select: { id: true, filePath: true, regNumber: true },
        },
        protocolDocument: {
          select: { id: true, filePath: true, regNumber: true },
        },
        organization: {
          select: { name: true },
        },
      },
    });

    if (!meeting) {
      return NextResponse.json({ error: "Заседание не найдено" }, { status: 404 });
    }

    // Получаем userIds участников
    // Сначала пытаемся исключить организатора, но если других участников нет,
    // то включаем всех участников (включая организатора, если он тоже участник)
    const allParticipantUserIds = meeting.participants
      .filter(p => p.user)
      .map(p => p.user!.id);
    
    const participantUserIds = meeting.participants
      .filter(p => p.user && p.user.id !== session.user.id)
      .map(p => p.user!.id);

    // Если нет других участников кроме организатора, но есть участники вообще,
    // используем всех участников (включая организатора)
    const finalParticipantUserIds = participantUserIds.length > 0 
      ? participantUserIds 
      : allParticipantUserIds;

    if (finalParticipantUserIds.length === 0) {
      return NextResponse.json({
        error: "Нет участников для уведомления",
      }, { status: 400 });
    }

    // Форматируем дату
    const meetingDate = new Date(meeting.scheduledDate).toLocaleDateString("ru-RU", {
      day: "numeric",
      month: "long",
      year: "numeric",
    });

    let notificationTitle = "";
    let notificationBody = "";
    let notificationUrl = `/dashboard/documents/meetings/${meetingId}`;

    if (type === "agenda_review") {
      notificationTitle = `Повестка дня: Заседание №${meeting.number}`;
      notificationBody = `Вы приглашены на заседание ${meetingDate}. Ознакомьтесь с повесткой дня.`;
      
      // Назначаем повестку всем участникам для ознакомления (если еще не назначена)
      if (meeting.agendaDocument) {
        // Используем тех же участников, которым отправляем уведомления
        const participantsWithUserId = finalParticipantUserIds;
        
        if (participantsWithUserId.length > 0) {
          // Проверяем, какие участники еще не имеют назначенной повестки
          // Ищем документы, которые являются копиями этой повестки и назначены участникам
          const existingAssigned = await prisma.document.findMany({
            where: {
              OR: [
                { id: meeting.agendaDocument.id }, // Оригинальный документ
                {
                  metadata: {
                    path: ["originalDocumentId"],
                    equals: meeting.agendaDocument.id,
                  },
                },
              ],
              assignedToId: { in: participantsWithUserId },
            },
            select: { assignedToId: true },
          });
          
          const assignedUserIds = new Set(existingAssigned.map(d => d.assignedToId).filter(Boolean));
          const usersToAssign = participantsWithUserId.filter(userId => !assignedUserIds.has(userId));
          
          if (usersToAssign.length > 0) {
            // Получаем полную информацию о документе повестки
            const agendaDoc = await prisma.document.findUnique({
              where: { id: meeting.agendaDocument.id },
              select: {
                title: true,
                content: true,
                regNumber: true,
                filePath: true,
                fileName: true,
              },
            });
            
            if (agendaDoc) {
              // Создаем копии повестки для участников, которым она еще не назначена
              await Promise.all(
                usersToAssign.map(userId =>
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
                      userId: session.user.id,
                      organizationId: meeting.organizationId,
                      assignedToId: userId,
                      assignedAt: new Date(),
                      metadata: {
                        meetingId: meeting.id,
                        meetingNumber: meeting.number,
                        meetingDate: meeting.scheduledDate.toISOString(),
                        isCopy: true,
                        originalDocumentId: meeting.agendaDocument.id,
                      },
                    },
                  })
                )
              );
              
              console.log(`[notify-participants] Повестка назначена ${usersToAssign.length} участникам`);
            }
          }
        }
      }
      
      // Обновляем статус заседания на "Запланировано"
      await prisma.meeting.update({
        where: { id: meetingId },
        data: { status: "SCHEDULED" },
      });
    } else if (type === "protocol_review") {
      notificationTitle = `Протокол заседания №${meeting.number}`;
      notificationBody = `Протокол заседания от ${meetingDate} готов для ознакомления.`;
      
      // Назначаем протокол всем участникам для ознакомления (если еще не назначен)
      if (meeting.protocolDocument) {
        // Используем тех же участников, которым отправляем уведомления
        const participantsWithUserId = finalParticipantUserIds;
        
        if (participantsWithUserId.length > 0) {
          // Проверяем, какие участники еще не имеют назначенного протокола
          // Ищем документы, которые являются копиями этого протокола и назначены участникам
          const existingAssigned = await prisma.document.findMany({
            where: {
              OR: [
                { id: meeting.protocolDocument.id }, // Оригинальный документ
                {
                  metadata: {
                    path: ["originalDocumentId"],
                    equals: meeting.protocolDocument.id,
                  },
                },
              ],
              assignedToId: { in: participantsWithUserId },
            },
            select: { assignedToId: true },
          });
          
          const assignedUserIds = new Set(existingAssigned.map(d => d.assignedToId).filter(Boolean));
          const usersToAssign = participantsWithUserId.filter(userId => !assignedUserIds.has(userId));
          
          if (usersToAssign.length > 0) {
            // Создаем копии протокола для участников, которым он еще не назначен
            await Promise.all(
              usersToAssign.map(userId =>
                prisma.document.create({
                  data: {
                    type: "PROTOCOL",
                    status: "GENERATED",
                    category: "INTERNAL",
                    title: meeting.protocolDocument.regNumber 
                      ? `Протокол заседания профкома ${meeting.protocolDocument.regNumber} от ${meetingDate}`
                      : `Протокол заседания №${meeting.number}`,
                    regNumber: meeting.protocolDocument.regNumber 
                      ? `${meeting.protocolDocument.regNumber}-${userId.slice(0, 4)}`
                      : null,
                    regDate: new Date(),
                    filePath: meeting.protocolDocument.filePath,
                    fileName: meeting.protocolDocument.filePath?.split("/").pop() || null,
                    userId: session.user.id,
                    organizationId: meeting.organizationId,
                    assignedToId: userId,
                    assignedAt: new Date(),
                    metadata: {
                      meetingId: meeting.id,
                      meetingNumber: meeting.number,
                      meetingDate: meeting.scheduledDate.toISOString(),
                      isCopy: true,
                      originalDocumentId: meeting.protocolDocument.id,
                    },
                  },
                })
              )
            );
            
            console.log(`[notify-participants] Протокол назначен ${usersToAssign.length} участникам`);
          }
        }
      }
    } else if (type === "meeting_reminder") {
      notificationTitle = `Напоминание: Заседание №${meeting.number}`;
      notificationBody = `Заседание состоится ${meetingDate}${meeting.scheduledTime ? ` в ${meeting.scheduledTime}` : ""}.`;
    } else if (type === "meeting_started") {
      notificationTitle = `Заседание №${meeting.number} началось`;
      notificationBody = meeting.onlineLink
        ? `Присоединяйтесь по ссылке: ${meeting.onlineLink}`
        : `Место проведения: ${meeting.location || "Не указано"}`;
    }

    // Отправляем уведомления
    await sendMassNotification({
      userIds: finalParticipantUserIds,
      title: notificationTitle,
      body: notificationBody,
      url: notificationUrl,
      type: `meeting_${type}`,
    });

    return NextResponse.json({
      success: true,
      message: `Уведомления отправлены ${finalParticipantUserIds.length} участникам`,
      sentCount: finalParticipantUserIds.length,
    });
  } catch (error: any) {
    console.error("[meetings/notify-participants] POST error:", error);
    return NextResponse.json(
      {
        error: "Ошибка при отправке уведомлений",
        details: process.env.NODE_ENV === "development" ? error.message : undefined,
      },
      { status: 500 }
    );
  }
}
