import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { generateAppealPublicId, formatAppealId } from "@/lib/appeal-id";
import { saveTicketToKnowledgeBase } from "@/lib/user-knowledge-base";
import { sendUserNotification } from "@/lib/notifications";

/**
 * GET /api/tickets - Получить тикеты пользователя
 */
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json(
        { error: "Не авторизован" },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status");

    // Получаем информацию о пользователе и его организации
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: {
        id: true,
        organizationId: true,
        role: true,
        isPPOHead: true,
        ppoHeadOrganizationId: true,
      },
    });

    // Проверяем, является ли пользователь председателем
    const isPPOHead = user?.role === "PPO_HEAD" || user?.isPPOHead === true;
    const chairmanOrgId = user?.ppoHeadOrganizationId || user?.organizationId;

    // Получаем чаты, в которых пользователь является участником
    const userChats = await prisma.chat.findMany({
      where: {
        participants: {
          some: {
            userId: session.user.id,
            leftAt: null,
          },
        },
      },
      select: {
        id: true,
      },
    });

    const userChatIds = userChats.map(chat => chat.id);

    // Формируем условия фильтрации
    // Если пользователь председатель - показываем все обращения из его организации
    // Иначе показываем обращения, созданные пользователем, связанные с чатами или из той же организации
    const where: any = {};

    if (isPPOHead && chairmanOrgId) {
      // Председатель видит все обращения из своей организации
      where.organizationId = chairmanOrgId;
    } else {
      // Обычный пользователь видит свои обращения, обращения из чатов и из своей организации
      // Также показываем обращения без organizationId, если они созданы пользователем или связаны с чатами
      const orConditions: any[] = [
        { userId: session.user.id }, // Свои обращения
      ];

      // Обращения из чатов пользователя
      if (userChatIds.length > 0) {
        orConditions.push({ chatId: { in: userChatIds } });
      }

      // Обращения из той же организации
      if (user?.organizationId) {
        orConditions.push({ organizationId: user.organizationId });
      }

      // Обращения без organizationId, если они созданы пользователем (для старых обращений)
      orConditions.push({
        AND: [
          { userId: session.user.id },
          { organizationId: null },
        ],
      });

      where.OR = orConditions;
    }

    if (status && status !== "all") {
      where.status = status;
    }

    const tickets = await prisma.ticket.findMany({
      where,
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            middleName: true,
            email: true,
          },
        },
        attachments: {
          select: {
            id: true,
            fileName: true,
            fileSize: true,
            mimeType: true,
          },
        },
        comments: {
          select: {
            id: true,
            createdAt: true,
          },
          orderBy: {
            createdAt: "desc",
          },
          take: 1,
        },
        _count: {
          select: {
            comments: true,
            attachments: true,
          },
        },
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    return NextResponse.json({
      success: true,
      tickets: tickets.map((ticket: any) => ({
        id: ticket.id,
        publicId: formatAppealId(ticket.publicId),
        type: ticket.type,
        status: ticket.status,
        priority: ticket.priority,
        title: ticket.title,
        content: ticket.content,
        createdAt: ticket.createdAt,
        updatedAt: ticket.updatedAt,
        attachmentsCount: ticket._count.attachments,
        commentsCount: ticket._count.comments,
        lastCommentAt: ticket.comments[0]?.createdAt || null,
        chatId: ticket.chatId,
        // Информация о создателе обращения
        createdBy: {
          id: ticket.user.id,
          firstName: ticket.user.firstName,
          lastName: ticket.user.lastName,
          middleName: ticket.user.middleName,
          email: ticket.user.email,
        },
        // Является ли текущий пользователь создателем обращения
        isOwner: ticket.userId === session.user.id,
        // Информация о сроках ответа (проверяем наличие полей для обратной совместимости)
        responseDeadline: ticket.responseDeadline ? new Date(ticket.responseDeadline).toISOString() : null,
        lastResponseAt: ticket.lastResponseAt ? new Date(ticket.lastResponseAt).toISOString() : null,
        lastUserResponseAt: ticket.lastUserResponseAt ? new Date(ticket.lastUserResponseAt).toISOString() : null,
        userResponseDeadline: ticket.userResponseDeadline ? new Date(ticket.userResponseDeadline).toISOString() : null,
        isOverdue: ticket.isOverdue ?? false,
        autoClosedAt: ticket.autoClosedAt ? new Date(ticket.autoClosedAt).toISOString() : null,
      })),
    });
  } catch (error) {
    console.error("[tickets] Error retrieving tickets:", error);
    return NextResponse.json(
      { error: "Ошибка при загрузке тикетов" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/tickets - Создать новый тикет
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json(
        { error: "Не авторизован" },
        { status: 401 }
      );
    }

    const formData = await request.formData();
    const type = formData.get("type") as string;
    const priority = formData.get("priority") as string;
    const title = formData.get("title") as string;
    const content = formData.get("content") as string;
    const files = formData.getAll("files") as File[];

    if (!type || !title || !content) {
      return NextResponse.json(
        { error: "Тип, заголовок и содержание обязательны" },
        { status: 400 }
      );
    }

    // Генерируем уникальный 8-значный публичный ID
    let publicId: string;
    let isUnique = false;
    let attempts = 0;
    const maxAttempts = 10;

    while (!isUnique && attempts < maxAttempts) {
      publicId = generateAppealPublicId();
      const existing = await prisma.ticket.findUnique({
        where: { publicId },
      });
      if (!existing) {
        isUnique = true;
      }
      attempts++;
    }

    if (!isUnique) {
      return NextResponse.json(
        { error: "Не удалось сгенерировать уникальный ID" },
        { status: 500 }
      );
    }

    // Получаем пользователя с организацией
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: {
        id: true,
        organizationId: true,
        firstName: true,
        lastName: true,
      },
    });

    // Находим Председателя организации
    let chairmanId: string | null = null;
    if (user?.organizationId) {
      const chairman = await prisma.user.findFirst({
        where: {
          OR: [
            { ppoHeadOrganizationId: user.organizationId },
            { organizationId: user.organizationId, role: "PPO_HEAD" },
            { organizationId: user.organizationId, isPPOHead: true },
          ],
        },
        select: { id: true },
      });
      chairmanId = chairman?.id || null;
    }

    // Создаем чат для обращения
    let appealChat = null;
    // Создаем чат если есть председатель (даже если это сам создатель обращения)
    if (chairmanId) {
      // Проверяем, не существует ли уже чат для этого обращения
      appealChat = await prisma.chat.findFirst({
        where: {
          name: `Обращение #${publicId!}: ${title}`,
          type: 'GROUP',
        },
        include: {
          participants: {
            where: { leftAt: null },
            select: { userId: true },
          },
        },
      });

      if (!appealChat) {
        // Создаем новый Chat для обращения
        // Председатель всегда админ и создатель чата
        // Создаем массив участников
        const participantsToCreate: Array<{
          userId: string;
          role: "admin" | "member";
          invitedById: string;
        }> = [
          {
            userId: chairmanId,
            role: "admin", // Председатель - админ треда
            invitedById: session.user.id,
          },
        ];
        
        // Добавляем создателя обращения как участника (если это не председатель)
        if (chairmanId !== session.user.id) {
          participantsToCreate.push({
            userId: session.user.id,
            role: "member",
            invitedById: session.user.id,
          });
        }
        
        appealChat = await prisma.chat.create({
          data: {
            type: "GROUP",
            name: `Обращение #${publicId!}: ${title}`,
            description: `Тред обращения от пользователя`,
            createdById: chairmanId, // Председатель - создатель чата
            isPublic: false,
            participants: {
              create: participantsToCreate,
            },
          },
          include: {
            participants: {
              where: { leftAt: null },
              include: {
                user: {
                  select: {
                    id: true,
                    firstName: true,
                    lastName: true,
                    middleName: true,
                    avatarUrl: true,
                  },
                },
              },
            },
          },
        });
        console.log(`[tickets] ✅ Создан Chat для обращения: ${appealChat.id}, участников: ${appealChat.participants.length} (председатель: ${chairmanId}, создатель: ${session.user.id})`);
      } else {
        // Чат уже существует, проверяем участников
        const existingUserIds = appealChat.participants.map(p => p.userId);
        const missingParticipants = [
          // Председатель всегда должен быть админом
          ...(!existingUserIds.includes(chairmanId) ? [{ userId: chairmanId, role: "admin" }] : []),
          // Создатель обращения как участник (если это не председатель)
          ...(chairmanId !== session.user.id && !existingUserIds.includes(session.user.id) ? [{ userId: session.user.id, role: "member" }] : []),
        ];

        if (missingParticipants.length > 0) {
          await prisma.chatParticipant.createMany({
            data: missingParticipants.map(p => ({
              chatId: appealChat!.id,
              userId: p.userId,
              role: p.role,
              invitedById: session.user.id,
            })),
          });
          console.log(`[tickets] ✅ Добавлены участники в Chat обращения: ${appealChat.id}`);
        }
      }
    }

    // Создаем тикет с chatId
    // Устанавливаем дедлайн ответа председателя (72 часа с момента создания)
    const responseDeadline = new Date();
    responseDeadline.setHours(responseDeadline.getHours() + 72);

    // Пытаемся создать с новыми полями, если не получится - создаем без них (для обратной совместимости)
    let ticket;
    try {
      ticket = await prisma.ticket.create({
        data: {
          userId: session.user.id,
          publicId: publicId!,
          type: type as any,
          priority: (priority as any) || "MEDIUM",
          status: "PENDING",
          title,
          content,
          organizationId: user?.organizationId || null,
          chatId: appealChat?.id || null,
          responseDeadline, // Дедлайн для ответа председателя (72 часа)
          isOverdue: false,
        },
      });
    } catch (error: any) {
      // Если поля не существуют в БД (миграция не применена), создаем без них
      if (error?.code === 'P2002' || error?.message?.includes('column') || error?.message?.includes('does not exist')) {
        console.log("[tickets] Deadline fields not available in DB, creating ticket without them");
        ticket = await prisma.ticket.create({
          data: {
            userId: session.user.id,
            publicId: publicId!,
            type: type as any,
            priority: (priority as any) || "MEDIUM",
            status: "PENDING",
            title,
            content,
            organizationId: user?.organizationId || null,
            chatId: appealChat?.id || null,
          },
        });
      } else {
        throw error;
      }
    }

    // Обрабатываем файлы
    const uploadedFiles: Array<{
      fileName: string;
      originalName: string;
      filePath: string;
      fileSize: number;
      mimeType: string;
      ticketPath?: string; // Путь для тикета
    }> = [];

    if (files && files.length > 0) {
      const fs = await import("fs/promises");
      const path = await import("path");
      // Сохраняем файлы в директорию для чатов, чтобы они были доступны в чате
      const chatUploadDir = path.join(process.cwd(), "public", "uploads", "chat");
      const ticketUploadDir = path.join(process.cwd(), "public", "uploads", "tickets");

      try {
        await fs.mkdir(chatUploadDir, { recursive: true });
        await fs.mkdir(ticketUploadDir, { recursive: true });
      } catch (error) {
        // Директория уже существует
      }

      for (const file of files) {
        const dangerousExtensions = [".exe", ".bat", ".cmd", ".sh", ".ps1", ".js", ".jar", ".app"];
        const fileExtension = path.extname(file.name).toLowerCase();
        
        if (dangerousExtensions.includes(fileExtension)) {
          continue;
        }

        const buffer = Buffer.from(await file.arrayBuffer());
        const fileName = `${Date.now()}-${file.name}`;
        
        // Сохраняем в обе директории: для тикета и для чата
        const chatFilePath = path.join(chatUploadDir, fileName);
        const ticketFilePath = path.join(ticketUploadDir, fileName);
        const chatRelativePath = `/uploads/chat/${fileName}`;
        const ticketRelativePath = `/uploads/tickets/${fileName}`;

        await fs.writeFile(chatFilePath, buffer);
        await fs.writeFile(ticketFilePath, buffer); // Дублируем для тикета

        uploadedFiles.push({
          fileName: fileName,
          originalName: file.name,
          filePath: chatRelativePath, // Используем путь для чата
          fileSize: buffer.length,
          mimeType: file.type || "application/octet-stream",
          ticketPath: ticketRelativePath, // Сохраняем путь для тикета
        });
      }

      if (uploadedFiles.length > 0) {
        await prisma.ticketAttachment.createMany({
          data: uploadedFiles.map(f => ({
            ticketId: ticket.id,
            fileName: f.originalName,
            filePath: (f as any).ticketPath, // Для тикета используем путь тикета
            fileSize: f.fileSize,
            mimeType: f.mimeType,
          })),
        });
      }
    }

    // Если чат создан, отправляем начальное сообщение с текстом обращения
    if (appealChat) {
      try {
        // Форматируем дату создания
        const createdAt = new Date();
        const dateStr = createdAt.toLocaleDateString('ru-RU', {
          day: '2-digit',
          month: '2-digit',
          year: 'numeric',
        });
        const timeStr = createdAt.toLocaleTimeString('ru-RU', {
          hour: '2-digit',
          minute: '2-digit',
        });
        
        // Создаем начальное сообщение с полной информацией об обращении
        let initialMessage = `**Обращение #${publicId}**\n\n`;
        initialMessage += `**Тема:** ${title}\n\n`;
        initialMessage += `**Текст обращения:**\n${content}\n\n`;
        initialMessage += `**Дата и время создания:** ${dateStr} в ${timeStr}`;
        
        // Отправляем начальное сообщение в чат
        // Тип всегда 'text', чтобы сообщение отображалось как обычное сообщение с текстом и вложениями
        const createdMessage = await prisma.chatMessage.create({
          data: {
            chatId: appealChat.id,
            senderId: session.user.id,
            content: initialMessage,
            messageType: 'text', // Всегда 'text', чтобы отображалось как обычное сообщение
            attachments: uploadedFiles.length > 0 ? {
              create: uploadedFiles.map(file => {
                const isImage = file.mimeType?.startsWith('image/');
                return {
                  type: isImage ? 'image' : 'file',
                  url: file.filePath, // Путь уже правильный для чата
                  name: file.originalName,
                  size: file.fileSize,
                  mimeType: file.mimeType || 'application/octet-stream',
                };
              }),
            } : undefined,
          },
        });

        // Обновляем lastMessageId в чате
        await prisma.chat.update({
          where: { id: appealChat.id },
          data: {
            lastMessageId: createdMessage.id,
            lastMessageAt: createdMessage.createdAt,
          },
        });

        console.log(`[tickets] ✅ Создано начальное сообщение обращения: ${createdMessage.id}, тип: ${createdMessage.messageType}, вложений: ${uploadedFiles.length}, senderId: ${createdMessage.senderId}, chatId: ${appealChat.id}`);

        // Отправляем уведомления участникам чата (кроме создателя обращения)
        try {
          const participants = await prisma.chatParticipant.findMany({
            where: {
              chatId: appealChat.id,
              userId: { not: session.user.id },
              leftAt: null,
            },
            include: {
              user: {
                select: {
                  id: true,
                  firstName: true,
                  lastName: true,
                },
              },
            },
          });

          if (participants.length > 0) {
            const senderName = `${user?.firstName || ''} ${user?.lastName || ''}`.trim() || 'Пользователь';
            const notificationContent = title.length > 100 ? title.substring(0, 100) + '...' : title;
            const notificationUrl = `/dashboard/chat?chatId=${appealChat.id}`;

            await Promise.allSettled(
              participants.map(async (participant) => {
                try {
                  await sendUserNotification({
                    userId: participant.userId,
                    type: 'ticket_response',
                    title: `Новое обращение: ${title}`,
                    body: notificationContent,
                    url: notificationUrl,
                    senderName: senderName,
                    metadata: {
                      chatId: appealChat.id,
                      messageId: createdMessage.id,
                      ticketId: ticket.id,
                      ticketPublicId: ticket.publicId,
                    },
                  });
                } catch (err) {
                  console.error(`[tickets] Error sending notification to user ${participant.userId}:`, err);
                }
              })
            );
          }
        } catch (notifError) {
          console.error('[tickets] Error sending notifications:', notifError);
          // Не прерываем создание обращения, если не удалось отправить уведомления
        }
      } catch (err) {
        console.error('[tickets] Error sending initial message to chat:', err);
        // Не прерываем создание обращения, если не удалось отправить сообщение
      }
    }

    // Логируем создание
    await prisma.ticketActionLog.create({
      data: {
        ticketId: ticket.id,
        userId: session.user.id,
        actionType: "created",
        description: `Создано обращение: ${title}`,
        metadata: {
          type,
          priority,
          filesCount: uploadedFiles.length,
        },
      },
    });

    // Сохраняем в базу знаний
    saveTicketToKnowledgeBase(
      session.user.id,
      ticket.id,
      title,
      content,
      type,
      ticket.status,
      {
        publicId: ticket.publicId,
        priority: ticket.priority,
        attachmentsCount: uploadedFiles.length,
      }
    ).catch((error) => {
      console.error("[tickets] Error saving ticket to knowledge base:", error);
    });

    return NextResponse.json({
      success: true,
      ticket: {
        id: ticket.id,
        publicId: formatAppealId(ticket.publicId),
        type: ticket.type,
        status: ticket.status,
        priority: ticket.priority,
        title: ticket.title,
        createdAt: ticket.createdAt,
        chatId: ticket.chatId,
      },
    });
  } catch (error) {
    console.error("[tickets] Error creating ticket:", error);
    return NextResponse.json(
      { error: "Ошибка при создании тикета" },
      { status: 500 }
    );
  }
}
