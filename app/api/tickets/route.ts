import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma, withPrismaRetry } from "@/lib/prisma";
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
    const user = await withPrismaRetry(async () => {
      return await prisma.user.findUnique({
        where: { id: session.user.id },
        select: {
          id: true,
          organizationId: true,
          role: true,
          isPPOHead: true,
          ppoHeadOrganizationId: true,
          viewMode: true, // Режим просмотра (MEMBER или PPO_HEAD)
        },
      });
    });

    // Проверяем, является ли пользователь председателем И находится ли он в режиме председателя
    const isPPOHead = (user?.role === "PPO_HEAD" || user?.isPPOHead === true) && user?.viewMode === "PPO_HEAD";
    const chairmanOrgId = user?.ppoHeadOrganizationId || user?.organizationId;

    // Получаем чаты, в которых пользователь является участником
    const userChats = await withPrismaRetry(async () => {
      return await prisma.chat.findMany({
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
      // Обычный пользователь (в режиме MEMBER) видит ТОЛЬКО свои ЛИЧНЫЕ обращения
      // (БЕЗ organizationId - не адресованные председателю) и обращения из чатов, где он участник
      // КРИТИЧНО: Обращения, адресованные председателю (с organizationId), видят ТОЛЬКО председатели
      const orConditions: any[] = [];

      // Свои ЛИЧНЫЕ обращения (БЕЗ organizationId - не адресованные председателю)
      // Пользователь НЕ должен видеть обращения, адресованные председателю, даже если он их создал
      orConditions.push({
        AND: [
          { userId: session.user.id },
          { organizationId: null }, // ТОЛЬКО личные обращения, не адресованные председателю
        ],
      });

      // Обращения из чатов пользователя (где он является участником)
      // НО только если они не адресованы председателю (без organizationId)
      if (userChatIds.length > 0) {
        orConditions.push({ 
          AND: [
            { chatId: { in: userChatIds } },
            { organizationId: null }, // ТОЛЬКО личные обращения, не адресованные председателю
          ],
        });
      }

      where.OR = orConditions.length > 0 ? orConditions : { userId: 'never-match' }; // Если нет условий, возвращаем пустой результат
    }

    if (status && status !== "all") {
      where.status = status;
    }

    // Получаем обращения, не запрашивая новые поля явно (для обратной совместимости)
    // Prisma автоматически вернет их, если они есть в БД
    // Используем withPrismaRetry для критичных запросов
    const tickets = await withPrismaRetry(async () => {
      return await prisma.ticket.findMany({
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
  } catch (error: any) {
    console.error("[tickets] GET Error retrieving tickets:", error);
    console.error("[tickets] Error details:", {
      code: error?.code,
      message: error?.message,
      name: error?.name,
      stack: error?.stack?.substring(0, 500),
    });
    
    // Проверяем, является ли это ошибкой подключения к БД
    const isConnectionError = 
      error?.code === 'P1001' || // Can't reach database server
      error?.code === 'P1002' || // Database server doesn't accept connections
      error?.code === 'P1008' || // Operations timed out
      error?.code === 'P1017' || // Server has closed the connection
      error?.code === 'P2002' || // Unique constraint violation (может быть связано с проблемами БД)
      error?.message?.includes('timeout') ||
      error?.message?.includes('ECONNREFUSED') ||
      error?.message?.includes('ENOTFOUND') ||
      error?.message?.includes('Connection') ||
      error?.message?.includes('connect');
    
    if (isConnectionError) {
      console.error("[tickets] Database connection error detected, returning 503");
      return NextResponse.json(
        { 
          error: "Сервис временно недоступен. Попробуйте позже.",
          retryAfter: 5, // Подсказка клиенту подождать 5 секунд
        },
        { 
          status: 503,
          headers: {
            'Retry-After': '5',
          },
        }
      );
    }
    
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
    console.log(`[tickets] ========== FINDING CHAIRMAN ==========`);
    console.log(`[tickets] User organizationId: ${user?.organizationId || 'N/A'}`);
    
    if (user?.organizationId) {
      const chairman = await prisma.user.findFirst({
        where: {
          OR: [
            { ppoHeadOrganizationId: user.organizationId },
            { organizationId: user.organizationId, role: "PPO_HEAD" },
            { organizationId: user.organizationId, isPPOHead: true },
          ],
        },
        select: { id: true, firstName: true, lastName: true },
      });
      chairmanId = chairman?.id || null;
      console.log(`[tickets] Found chairman: ${chairman?.id || 'NOT FOUND'} (${chairman?.firstName} ${chairman?.lastName})`);
    } else {
      console.warn(`[tickets] ⚠️ User has no organizationId, cannot find chairman!`);
    }

    // Создаем чат для обращения
    let appealChat = null;
    // Создаем чат если есть председатель (даже если это сам создатель обращения)
    if (chairmanId) {
      console.log(`[tickets] Chairman found, creating chat...`);
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
    } else {
      console.error(`[tickets] ⚠️ Chairman NOT FOUND! Chat will NOT be created for this ticket.`);
      console.error(`[tickets] User: ${session.user.id}, organizationId: ${user?.organizationId || 'N/A'}`);
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

        // Проверяем, что файл действительно сохранен
        const chatFileExists = await fs.access(chatFilePath).then(() => true).catch(() => false);
        if (!chatFileExists) {
          console.error(`[tickets] ❌ Failed to save file to chat directory: ${chatFilePath}`);
        }

        uploadedFiles.push({
          fileName: fileName,
          originalName: file.name,
          filePath: chatRelativePath, // Используем путь для чата
          fileSize: buffer.length,
          mimeType: file.type || "application/octet-stream",
          ticketPath: ticketRelativePath, // Сохраняем путь для тикета
        });

        console.log(`[tickets] ✅ File saved: ${file.name} -> ${chatRelativePath} (${buffer.length} bytes, exists: ${chatFileExists})`);
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
    console.log(`[tickets] ========== INITIAL MESSAGE CREATION ==========`);
    console.log(`[tickets] appealChat exists: ${!!appealChat}, appealChat.id: ${appealChat?.id || 'N/A'}`);
    console.log(`[tickets] chairmanId: ${chairmanId}, session.user.id: ${session.user.id}`);
    
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
        
        // Подготавливаем вложения для сообщения
        let messageAttachments: any = undefined;
        if (uploadedFiles.length > 0) {
          try {
            // Импортируем getFileUrlWithCDN для правильных URL
            const { getFileUrlWithCDN } = await import('@/lib/cdn');
            
            console.log(`[tickets] Preparing ${uploadedFiles.length} attachments:`, uploadedFiles.map(f => ({
              originalName: f.originalName,
              filePath: f.filePath,
              size: f.fileSize,
              mimeType: f.mimeType,
            })));
            
            messageAttachments = {
              create: uploadedFiles.map((file, index) => {
                const isImage = file.mimeType?.startsWith('image/');
                // Используем CDN URL для вложений
                const fileUrl = getFileUrlWithCDN(file.filePath);
                
                console.log(`[tickets] Attachment ${index + 1}:`, {
                  originalName: file.originalName,
                  filePath: file.filePath,
                  fileUrl: fileUrl,
                  type: isImage ? 'image' : 'file',
                  size: file.fileSize,
                });
                
                return {
                  type: isImage ? 'image' : 'file',
                  url: fileUrl, // CDN URL
                  name: file.originalName,
                  size: file.fileSize,
                  mimeType: file.mimeType || 'application/octet-stream',
                };
              }),
            };
            
            console.log(`[tickets] ✅ Prepared ${uploadedFiles.length} attachments for initial message`);
          } catch (attachError) {
            console.error('[tickets] ❌ Error preparing attachments for message:', attachError);
            console.error('[tickets] Error details:', {
              message: attachError instanceof Error ? attachError.message : String(attachError),
              stack: attachError instanceof Error ? attachError.stack : undefined,
              uploadedFilesCount: uploadedFiles.length,
            });
            // Продолжаем без вложений, если есть проблема
          }
        } else {
          console.log(`[tickets] No attachments to add (uploadedFiles.length = ${uploadedFiles.length})`);
        }
        
        // Отправляем начальное сообщение в чат
        // Тип всегда 'text', чтобы сообщение отображалось как обычное сообщение с текстом и вложениями
        const messageData: any = {
          chatId: appealChat.id,
          senderId: session.user.id,
          content: initialMessage,
          messageType: 'text', // Всегда 'text', чтобы отображалось как обычное сообщение
        };

        // Добавляем вложения только если они есть и валидны
        if (messageAttachments) {
          messageData.attachments = messageAttachments;
          console.log(`[tickets] Adding attachments to message data:`, {
            attachmentsCount: messageAttachments.create.length,
            firstAttachment: messageAttachments.create[0],
          });
        } else {
          console.log(`[tickets] No attachments to add to message data`);
        }

        console.log(`[tickets] Creating message with data:`, {
          chatId: messageData.chatId,
          senderId: messageData.senderId,
          contentLength: messageData.content.length,
          messageType: messageData.messageType,
          hasAttachments: !!messageData.attachments,
          attachmentsCount: messageData.attachments?.create?.length || 0,
        });

        // Убеждаемся, что threadRootId явно null (не undefined)
        messageData.threadRootId = null;
        messageData.replyToId = null;

        console.log(`[tickets] Final messageData before create:`, {
          chatId: messageData.chatId,
          senderId: messageData.senderId,
          contentLength: messageData.content.length,
          messageType: messageData.messageType,
          threadRootId: messageData.threadRootId,
          replyToId: messageData.replyToId,
          hasAttachments: !!messageData.attachments,
          attachmentsCount: messageData.attachments?.create?.length || 0,
        });

        // КРИТИЧЕСКОЕ ИСПРАВЛЕНИЕ: Используем транзакцию для гарантии сохранения
        const createdMessage = await prisma.$transaction(async (tx) => {
          // Создаем сообщение
          const message = await tx.chatMessage.create({
            data: messageData,
            include: {
              attachments: {
                select: {
                  id: true,
                  type: true,
                  url: true,
                  name: true,
                  size: true,
                  mimeType: true,
                },
              },
            },
          });
          
          // КРИТИЧЕСКАЯ ПРОВЕРКА: Сразу проверяем в той же транзакции
          const verifyMessage = await tx.chatMessage.findUnique({
            where: { id: message.id },
            select: { id: true, chatId: true, senderId: true, content: true },
          });
          
          if (!verifyMessage) {
            throw new Error(`Message ${message.id} was not found in DB after creation within transaction!`);
          }
          
          // Обновляем чат в той же транзакции
          await tx.chat.update({
            where: { id: appealChat.id },
            data: {
              lastMessageId: message.id,
              lastMessageAt: message.createdAt,
            },
          });
          
          return message;
        });

        // Инвалидируем кэш чата, чтобы новое сообщение сразу отображалось
        try {
          const { invalidateChatCache } = await import('@/lib/chat-redis');
          await invalidateChatCache(appealChat.id);
          console.log(`[tickets] ✅ Chat cache invalidated for chat ${appealChat.id}`);
        } catch (cacheError) {
          console.warn('[tickets] Failed to invalidate chat cache:', cacheError);
          // Не критично, продолжаем
        }

        // Отправляем сообщение через WebSocket для обновления в реальном времени
        try {
          const socketModule = await import('@/server/socket');
          const { emitNewMessage } = socketModule;
          
          // Форматируем сообщение для WebSocket
          const sender = await prisma.user.findUnique({
            where: { id: session.user.id },
            select: {
              id: true,
              firstName: true,
              lastName: true,
              avatarUrl: true,
            },
          });

          if (sender) {
            const wsMessage = {
              id: createdMessage.id,
              chatId: createdMessage.chatId,
              senderId: createdMessage.senderId,
              content: createdMessage.content,
              messageType: createdMessage.messageType,
              createdAt: createdMessage.createdAt,
              sender: {
                id: sender.id,
                firstName: sender.firstName,
                lastName: sender.lastName,
                avatarUrl: sender.avatarUrl,
              },
              attachments: createdMessage.attachments.map(a => ({
                id: a.id,
                type: a.type,
                url: a.url,
                name: a.name,
                size: a.size,
                mimeType: a.mimeType,
              })),
            };

            await emitNewMessage(appealChat.id, wsMessage);
            console.log(`[tickets] ✅ Message emitted via WebSocket to chat ${appealChat.id}`);
          }
        } catch (wsError) {
          console.error('[tickets] Failed to emit message via WebSocket:', wsError);
          // Не критично, продолжаем
        }

        console.log(`[tickets] ✅ Создано начальное сообщение обращения:`, {
          messageId: createdMessage.id,
          messageType: createdMessage.messageType,
          senderId: createdMessage.senderId,
          chatId: appealChat.id,
          contentLength: initialMessage.length,
          contentPreview: initialMessage.substring(0, 100) + '...',
          attachmentsCount: createdMessage.attachments.length,
          attachments: createdMessage.attachments.map(a => ({ 
            id: a.id, 
            type: a.type, 
            name: a.name,
            url: a.url,
            size: a.size,
            mimeType: a.mimeType,
          })),
          threadRootId: createdMessage.threadRootId, // Должно быть null
        });
        
        // КРИТИЧЕСКАЯ ПРОВЕРКА: Убеждаемся, что сообщение действительно сохранено
        const verifyMessage = await prisma.chatMessage.findUnique({
          where: { id: createdMessage.id },
          select: { id: true, content: true, chatId: true, senderId: true },
        });
        
        if (!verifyMessage) {
          console.error(`[tickets] ❌ CRITICAL: Initial message ${createdMessage.id} was not found in DB after creation!`);
        } else {
          console.log(`[tickets] ✅ Initial message verified in DB:`, {
            id: verifyMessage.id,
            contentLength: verifyMessage.content?.length || 0,
            chatId: verifyMessage.chatId,
            senderId: verifyMessage.senderId,
          });
        }

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
      } catch (err: any) {
        // Критическая ошибка - логируем детально
        console.error('[tickets] ❌ КРИТИЧЕСКАЯ ОШИБКА при создании начального сообщения в чат:', {
          error: err?.message,
          code: err?.code,
          meta: err?.meta,
          stack: err?.stack,
          chatId: appealChat.id,
          ticketId: ticket.id,
          publicId: ticket.publicId,
          senderId: session.user.id,
          filesCount: uploadedFiles.length,
        });
        
        // Пытаемся создать сообщение хотя бы с текстом, без вложений
        try {
          const fallbackMessage = await prisma.chatMessage.create({
            data: {
              chatId: appealChat.id,
              senderId: session.user.id,
              content: `**Обращение #${publicId}**\n\n**Тема:** ${title}\n\n**Текст обращения:**\n${content}`,
              messageType: 'text',
            },
          });
          console.log(`[tickets] ✅ Создано резервное сообщение (без вложений): ${fallbackMessage.id}`);
          
          // Обновляем lastMessageId в чате
          await prisma.chat.update({
            where: { id: appealChat.id },
            data: {
              lastMessageId: fallbackMessage.id,
              lastMessageAt: fallbackMessage.createdAt,
            },
          });
        } catch (fallbackError: any) {
          console.error('[tickets] ❌ Не удалось создать даже резервное сообщение:', {
            error: fallbackError?.message,
            code: fallbackError?.code,
          });
          // Это критическая ошибка, но не прерываем создание обращения
        }
      }
    }

    // КРИТИЧЕСКОЕ ИСПРАВЛЕНИЕ: TicketActionLog создаем ПОСЛЕ начального сообщения
    // чтобы начальное сообщение было первым в чате
    // (TicketActionLog будет создан после блока создания начального сообщения)

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
