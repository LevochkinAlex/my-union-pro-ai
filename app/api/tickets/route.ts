import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { generateAppealPublicId, formatAppealId } from "@/lib/appeal-id";
import { saveTicketToKnowledgeBase } from "@/lib/user-knowledge-base";
// Chat creation is done inline for appeal chats

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

    const where: any = {
      userId: session.user.id,
    };

    if (status && status !== "all") {
      where.status = status;
    }

    const tickets = await prisma.ticket.findMany({
      where,
      include: {
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
        chatId: ticket.chatId,
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
      // Ищем Председателя по нескольким критериям:
      // 1. ppoHeadOrganizationId === organizationId (PPO Head для этой организации)
      // 2. role === PPO_HEAD и organizationId === organizationId
      // 3. isPPOHead === true и organizationId === organizationId
      const chairman = await prisma.user.findFirst({
        where: {
          OR: [
            { ppoHeadOrganizationId: user.organizationId },
            { 
              organizationId: user.organizationId,
              role: "PPO_HEAD",
            },
            {
              organizationId: user.organizationId,
              isPPOHead: true,
            },
          ],
        },
        select: { id: true },
      });
      chairmanId = chairman?.id || null;
    }

    // Создаем тикет сначала (без chatId)
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
      },
    });

    // Создаем ОТДЕЛЬНЫЙ чат для обращения (тип GROUP для обхода unique constraint)
    // Чат обращения - это отдельная переписка от имени организации
    let chatId: string | null = null;
    if (chairmanId && chairmanId !== session.user.id) {
      // Создаем чат типа GROUP для обращения (позволяет иметь несколько чатов между пользователями)
      const chat = await prisma.chat.create({
        data: {
          type: "GROUP", // GROUP позволяет несколько чатов между теми же участниками
          name: `Обращение #${publicId}`,
          description: title,
          createdById: session.user.id,
          isPublic: false, // Закрытый чат
          participants: {
            create: [
              { userId: session.user.id, role: "member" },
              { userId: chairmanId, role: "admin" },
            ],
          },
        },
      });
      chatId = chat.id;

      // Связываем тикет с чатом
      await prisma.ticket.update({
        where: { id: ticket.id },
        data: { chatId: chat.id },
      });

      // Создаем первое сообщение в чате с текстом обращения
      await prisma.chatMessage.create({
        data: {
          chatId: chat.id,
          senderId: session.user.id,
          content: `📋 **${title}**\n\n${content.replace(/<[^>]*>/g, "")}`,
        },
      });

      // Обновляем lastMessage в чате
      await prisma.chat.update({
        where: { id: chat.id },
        data: {
          lastMessageAt: new Date(),
          lastMessage: `📋 ${title}`,
        },
      });
    }

    // Логируем создание обращения
    await prisma.ticketActionLog.create({
      data: {
        ticketId: ticket.id,
        userId: session.user.id,
        actionType: "created",
        description: `Создано обращение: ${title}`,
        metadata: {
          type,
          priority,
        },
      },
    });

    // Обрабатываем файлы, если они есть
    if (files && files.length > 0) {
      const fs = await import("fs/promises");
      const path = await import("path");
      const uploadDir = path.join(process.cwd(), "public", "uploads", "tickets");

      // Создаем директорию, если её нет
      try {
        await fs.mkdir(uploadDir, { recursive: true });
      } catch (error) {
        // Директория уже существует
      }

      const attachments = [];

      for (const file of files) {
        // Проверяем тип файла (запрещаем исполняемые скрипты)
        const dangerousExtensions = [".exe", ".bat", ".cmd", ".sh", ".ps1", ".js", ".jar", ".app"];
        const fileExtension = path.extname(file.name).toLowerCase();
        
        if (dangerousExtensions.includes(fileExtension)) {
          continue; // Пропускаем опасные файлы
        }

        const buffer = Buffer.from(await file.arrayBuffer());
        const fileName = `${Date.now()}-${file.name}`;
        const filePath = path.join(uploadDir, fileName);
        const relativePath = `/uploads/tickets/${fileName}`;

        await fs.writeFile(filePath, buffer);

        attachments.push({
          ticketId: ticket.id,
          fileName: file.name,
          filePath: relativePath,
          fileSize: buffer.length,
          mimeType: file.type || "application/octet-stream",
        });
      }

      if (attachments.length > 0) {
        await prisma.ticketAttachment.createMany({
          data: attachments,
        });
      }
    }

    // Сохраняем тикет в базу знаний пользователя (асинхронно, не блокируем ответ)
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
        attachmentsCount: files?.length || 0,
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

