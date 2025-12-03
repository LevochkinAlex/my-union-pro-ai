import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { sendNotification } from "@/lib/notifications";
import { UserRole } from "@prisma/client";

/**
 * POST /api/tickets/[id]/comments - Создать комментарий к тикету
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json(
        { error: "Не авторизован" },
        { status: 401 }
      );
    }

    const { id: ticketId } = await params;
    const body = await request.json();
    const { content, isInternal } = body;

    if (!content || typeof content !== "string" || content.trim().length === 0) {
      return NextResponse.json(
        { error: "Содержание комментария обязательно" },
        { status: 400 }
      );
    }

    // Получаем тикет
    const ticket = await prisma.ticket.findUnique({
      where: { id: ticketId },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
          },
        },
      },
    });

    if (!ticket) {
      return NextResponse.json(
        { error: "Тикет не найден" },
        { status: 404 }
      );
    }

    // Проверяем права доступа
    const isAdmin = session.user.role === UserRole.SUPER_ADMIN;
    const isTicketOwner = ticket.userId === session.user.id;

    if (!isAdmin && !isTicketOwner) {
      return NextResponse.json(
        { error: "Доступ запрещен" },
        { status: 403 }
      );
    }

    // Внутренние комментарии могут создавать только админы
    if (isInternal && !isAdmin) {
      return NextResponse.json(
        { error: "Только администраторы могут создавать внутренние комментарии" },
        { status: 403 }
      );
    }

    // Создаем комментарий
    const comment = await prisma.ticketComment.create({
      data: {
        ticketId,
        userId: session.user.id,
        content: content.trim(),
        isInternal: isInternal || false,
      },
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            avatarUrl: true,
          },
        },
      },
    });

    // Если комментарий создан админом и не является внутренним, отправляем уведомление владельцу тикета
    if (isAdmin && !isInternal && ticket.userId !== session.user.id) {
      try {
        const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://myunion.pro";
        await sendNotification({
          userId: ticket.userId,
          title: "📩 Получен ответ на ваше обращение",
          message: `По вашему обращению "${ticket.title}" получен ответ.`,
          link: `${baseUrl}/dashboard/tickets/${ticket.id}`,
          data: {
            type: "ticket_response",
            ticketId: ticket.id,
            commentId: comment.id,
          },
        });
        console.log("[tickets/comments] ✅ Уведомление отправлено владельцу тикета");
      } catch (notificationError) {
        console.error("[tickets/comments] ⚠️ Ошибка отправки уведомления:", notificationError);
        // Не прерываем создание комментария из-за ошибки уведомления
      }
    }

    return NextResponse.json({
      success: true,
      comment: {
        id: comment.id,
        content: comment.content,
        isInternal: comment.isInternal,
        createdAt: comment.createdAt,
        user: comment.user,
      },
    });
  } catch (error) {
    console.error("[tickets/comments] Error creating comment:", error);
    return NextResponse.json(
      { error: "Ошибка при создании комментария" },
      { status: 500 }
    );
  }
}

/**
 * GET /api/tickets/[id]/comments - Получить комментарии к тикету
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json(
        { error: "Не авторизован" },
        { status: 401 }
      );
    }

    const { id: ticketId } = await params;

    // Получаем тикет
    const ticket = await prisma.ticket.findUnique({
      where: { id: ticketId },
    });

    if (!ticket) {
      return NextResponse.json(
        { error: "Тикет не найден" },
        { status: 404 }
      );
    }

    // Проверяем права доступа
    const isAdmin = session.user.role === UserRole.SUPER_ADMIN;
    const isTicketOwner = ticket.userId === session.user.id;

    if (!isAdmin && !isTicketOwner) {
      return NextResponse.json(
        { error: "Доступ запрещен" },
        { status: 403 }
      );
    }

    // Получаем комментарии (скрываем внутренние для обычных пользователей)
    const comments = await prisma.ticketComment.findMany({
      where: {
        ticketId,
        ...(isAdmin ? {} : { isInternal: false }), // Админы видят все, пользователи - только публичные
      },
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            avatarUrl: true,
          },
        },
        attachments: {
          select: {
            id: true,
            fileName: true,
            filePath: true,
            fileSize: true,
            mimeType: true,
          },
        },
      },
      orderBy: {
        createdAt: "asc",
      },
    });

    return NextResponse.json({
      success: true,
      comments,
    });
  } catch (error) {
    console.error("[tickets/comments] Error retrieving comments:", error);
    return NextResponse.json(
      { error: "Ошибка при загрузке комментариев" },
      { status: 500 }
    );
  }
}

