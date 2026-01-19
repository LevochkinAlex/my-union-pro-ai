import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { generateAppealPublicId, formatAppealId } from "@/lib/appeal-id";
import { createAppealThread } from "@/lib/matrix-threads";
import { saveTicketToKnowledgeBase } from "@/lib/user-knowledge-base";
import { createGroupChat } from "@/lib/chat-service";

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

    // Получаем ID чатов, в которых пользователь является участником
    const userChats = await prisma.chat.findMany({
      where: {
        OR: [
          // Старая схема PRIVATE чатов
          { participants: { some: { userId: session.user.id, leftAt: null } } },
          // Новая схема через ChatParticipant
          {
            participants: {
              some: {
                userId: session.user.id,
                leftAt: null,
              },
            },
          },
        ],
      },
      select: {
        id: true,
      },
    });

    const userChatIds = userChats.map((chat) => chat.id);

    // Обращения, созданные пользователем ИЛИ связанные с чатами, в которых пользователь участвует
    const where: any = {
      OR: [
        { userId: session.user.id },
        ...(userChatIds.length > 0 ? [{ chatId: { in: userChatIds } }] : []),
      ],
    };

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
      tickets: tickets.map((ticket) => ({
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
        // chatId: ticket.chatId, // Тикеты теперь связаны через matrixRoomId
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

    // Сначала создаем Matrix тред, чтобы получить matrixRoomId
    let matrixRoomId: string | null = null;
    if (chairmanId && chairmanId !== session.user.id) {
      let messageContent = `📋 **${title}**\n\n${content.replace(/<[^>]*>/g, "")}`;
      
      const threadInfo = await createAppealThread(
        `Обращение #${publicId!}: ${title}`,
        messageContent,
        session.user.id,
        chairmanId
      );

      if (threadInfo) {
        matrixRoomId = threadInfo.roomId;
        
        // Создаем Chat запись в БД для треда обращения
        // Проверяем, не существует ли уже чат с таким matrixRoomId
        let appealChat = await prisma.chat.findUnique({
          where: { matrixRoomId },
          include: {
            participants: {
              where: { leftAt: null },
              select: { userId: true },
            },
          },
        });

        if (!appealChat) {
          // Создаем новый Chat для обращения
          appealChat = await prisma.chat.create({
            data: {
              type: "GROUP",
              name: `Обращение #${publicId!}: ${title}`,
              description: `Тред обращения от пользователя`,
              matrixRoomId,
              createdById: session.user.id,
              isPublic: false,
              participants: {
                create: [
                  {
                    userId: session.user.id,
                    role: "member",
                    invitedById: session.user.id,
                  },
                  ...(chairmanId !== session.user.id ? [{
                    userId: chairmanId,
                    role: "admin", // Председатель - админ треда
                    invitedById: session.user.id,
                  }] : []),
                ],
              },
            },
            include: {
              participants: {
                where: { leftAt: null },
                select: { userId: true },
              },
            },
          });
          console.log(`[tickets] ✅ Создан Chat для обращения: ${appealChat.id} (matrixRoomId: ${matrixRoomId})`);
        } else {
          // Чат уже существует, проверяем участников
          const existingUserIds = appealChat.participants.map(p => p.userId);
          const missingParticipants = [
            ...(existingUserIds.includes(session.user.id) ? [] : [{ userId: session.user.id, role: "member" }]),
            ...(chairmanId !== session.user.id && !existingUserIds.includes(chairmanId) ? [{ userId: chairmanId, role: "admin" }] : []),
          ];

          if (missingParticipants.length > 0) {
            await prisma.chatParticipant.createMany({
              data: missingParticipants.map(p => ({
                chatId: appealChat.id,
                userId: p.userId,
                role: p.role,
                invitedById: session.user.id,
              })),
            });
            console.log(`[tickets] ✅ Добавлены участники в Chat обращения: ${appealChat.id}`);
          }
        }
      }
    }

    // Создаем тикет с matrixRoomId
    const ticket = await prisma.ticket.create({
      data: {
        userId: session.user.id,
        publicId: publicId!,
        type: type as any,
        priority: (priority as any) || "MEDIUM",
        status: "PENDING",
        title,
        content,
        organizationId: user?.organizationId || null,
        matrixRoomId,
      },
    });

    // Обрабатываем файлы
    const uploadedFiles: Array<{
      fileName: string;
      originalName: string;
      filePath: string;
      fileSize: number;
      mimeType: string;
    }> = [];

    if (files && files.length > 0) {
      const fs = await import("fs/promises");
      const path = await import("path");
      const uploadDir = path.join(process.cwd(), "public", "uploads", "tickets");

      try {
        await fs.mkdir(uploadDir, { recursive: true });
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
        const filePath = path.join(uploadDir, fileName);
        const relativePath = `/uploads/tickets/${fileName}`;

        await fs.writeFile(filePath, buffer);

        uploadedFiles.push({
          fileName: fileName,
          originalName: file.name,
          filePath: relativePath,
          fileSize: buffer.length,
          mimeType: file.type || "application/octet-stream",
        });
      }

      if (uploadedFiles.length > 0) {
        await prisma.ticketAttachment.createMany({
          data: uploadedFiles.map(f => ({
            ticketId: ticket.id,
            fileName: f.originalName,
            filePath: f.filePath,
            fileSize: f.fileSize,
            mimeType: f.mimeType,
          })),
        });
      }
    }

    // Если тред создан и есть файлы, отправляем информацию о файлах в тред
    if (matrixRoomId && uploadedFiles.length > 0) {
      // Получаем токен создателя для отправки сообщения в тред
      const creator = await prisma.user.findUnique({
        where: { id: session.user.id },
        select: { matrixAccessToken: true },
      });

      if (creator?.matrixAccessToken) {
        const filesList = uploadedFiles.map((f, i) => `${i + 1}. ${f.originalName}`).join('\n');
        const filesMessage = `📎 **Прикрепленные файлы:**\n${filesList}`;
        
        // Отправляем сообщение в тред (reply к корневому сообщению)
        const { replyToThread } = await import('@/lib/matrix-threads');
        // Получаем thread root event ID из первого сообщения в комнате
        const { getMatrixMessages } = await import('@/lib/matrix-messages');
        const messages = await getMatrixMessages(creator.matrixAccessToken, matrixRoomId, 1);
        if (messages.length > 0) {
          await replyToThread(
            creator.matrixAccessToken,
            matrixRoomId,
            messages[0].eventId,
            filesMessage
          );
        }
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
        // chatId: ticket.chatId, // Тикеты теперь связаны через matrixRoomId
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
