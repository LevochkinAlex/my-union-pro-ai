import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { formatAppealId } from "@/lib/appeal-id";
import { sendChatMessage } from "@/lib/chat-server-utils";
import { DEMO_MEMBER_USER_ID } from "@/lib/demo-constants";
import { getDemoMemberTicketById } from "@/lib/demo";

/**
 * GET /api/tickets/[id] - Получить тикет по ID
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

    const { id } = await params;

    // Демо-член профсоюза: мок-обращение по id
    if (session.user.id === DEMO_MEMBER_USER_ID) {
      const demoTicket = getDemoMemberTicketById(id);
      if (demoTicket) {
        return NextResponse.json({ success: true, ticket: demoTicket });
      }
      return NextResponse.json({ error: "Тикет не найден" }, { status: 404 });
    }

    // Поддержка и внутреннего id (cuid), и publicId (8 цифр) — из URL/чата может прийти любой
    const publicIdNormalized = id.replace(/-/g, "");
    const ticket = await prisma.ticket.findFirst({
      where: {
        OR: [{ id }, { publicId: publicIdNormalized }],
      },
      include: {
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
    });

    if (!ticket) {
      return NextResponse.json(
        { error: "Тикет не найден" },
        { status: 404 }
      );
    }

    // Проверяем, что тикет принадлежит пользователю, пользователь - Председатель организации,
    // или пользователь является участником чата обращения
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { role: true, organizationId: true },
    });

    const isOwner = ticket.userId === session.user.id;
    const isPPOHead = user?.role === "PPO_HEAD" && ticket.organizationId === user?.organizationId;

    // Проверяем, является ли пользователь участником чата обращения
    let isChatParticipant = false;
    if (ticket.chatId) {
      const chat = await prisma.chat.findUnique({
        where: { id: ticket.chatId },
        select: {
          participants: {
            where: {
              leftAt: null,
            },
            select: { userId: true },
          },
        },
      });
      
      isChatParticipant = !!(
        chat?.participants?.some(p => p.userId === session.user.id) ||
        (chat?.participants && chat.participants.length > 0)
      );
    }

    if (!isOwner && !isPPOHead && !isChatParticipant) {
      return NextResponse.json(
        { error: "Доступ запрещен" },
        { status: 403 }
      );
    }

    return NextResponse.json({
      success: true,
      ticket: {
        id: ticket.id,
        publicId: formatAppealId(ticket.publicId),
        type: ticket.type,
        status: ticket.status,
        priority: ticket.priority,
        title: ticket.title,
        content: ticket.content,
        createdAt: ticket.createdAt,
        updatedAt: ticket.updatedAt,
        attachments: ticket.attachments,
        chatId: ticket.chatId,
        userId: ticket.userId,
        organizationId: ticket.organizationId,
        rejectionReason: ticket.rejectionReason,
        helpfulRating: ticket.helpfulRating,
        helpfulRatingComment: ticket.helpfulRatingComment,
        helpfulRatingAt: ticket.helpfulRatingAt,
        isChairmanView: isPPOHead,
      },
    });
  } catch (error) {
    console.error("[tickets] Error retrieving ticket:", error);
    return NextResponse.json(
      { error: "Ошибка при загрузке тикета" },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/tickets/[id] - Обновить тикет (для владельца)
 */
export async function PUT(
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

    const { id } = await params;
    const body = await request.json();
    const { title, content } = body;

    if (!title || !content) {
      return NextResponse.json(
        { error: "Заголовок и содержание обязательны" },
        { status: 400 }
      );
    }

    const ticket = await prisma.ticket.findUnique({
      where: { id },
    });

    if (!ticket) {
      return NextResponse.json(
        { error: "Тикет не найден" },
        { status: 404 }
      );
    }

    // Проверяем, что тикет принадлежит пользователю
    if (ticket.userId !== session.user.id) {
      return NextResponse.json(
        { error: "Доступ запрещен" },
        { status: 403 }
      );
    }

    // Проверяем, что тикет можно редактировать (только в статусе PENDING)
    if (ticket.status !== "PENDING") {
      return NextResponse.json(
        { error: "Обращение можно редактировать только в статусе 'Ожидание'" },
        { status: 400 }
      );
    }

    // Обновляем тикет
    const updatedTicket = await prisma.ticket.update({
      where: { id },
      data: {
        title,
        content,
      },
    });

    // Логируем действие
    await prisma.ticketActionLog.create({
      data: {
        ticketId: ticket.id,
        userId: session.user.id,
        actionType: "updated",
        description: `Обращение отредактировано`,
        oldValue: JSON.stringify({ title: ticket.title, content: ticket.content }),
        newValue: JSON.stringify({ title, content }),
      },
    });

    // Отправляем сообщение в чат обращения
    if (ticket.chatId) {
      try {
        const updateMessage = `📝 Обращение отредактировано`;
        await fetch(`${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3004'}/api/chat/${ticket.chatId}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Internal-Token': process.env.INTERNAL_API_TOKEN || '',
          },
          body: JSON.stringify({
            content: updateMessage,
            senderUserId: session.user.id,
          }),
        }).catch(err => {
          console.error('[tickets] Error sending update message:', err);
        });
      } catch (err) {
        console.error('[tickets] Error:', err);
      }
    }

    return NextResponse.json({
      success: true,
      ticket: {
        id: updatedTicket.id,
        publicId: formatAppealId(updatedTicket.publicId),
        title: updatedTicket.title,
        content: updatedTicket.content,
        updatedAt: updatedTicket.updatedAt,
      },
    });
  } catch (error) {
    console.error("[tickets] Error updating ticket:", error);
    return NextResponse.json(
      { error: "Ошибка при обновлении тикета" },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/tickets/[id] - Удалить тикет (для владельца)
 */
export async function DELETE(
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

    const { id } = await params;

    const ticket = await prisma.ticket.findUnique({
      where: { id },
    });

    if (!ticket) {
      return NextResponse.json(
        { error: "Тикет не найден" },
        { status: 404 }
      );
    }

    // Проверяем, что тикет принадлежит пользователю
    if (ticket.userId !== session.user.id) {
      return NextResponse.json(
        { error: "Доступ запрещен" },
        { status: 403 }
      );
    }

    // Проверяем, что тикет можно удалить (только в статусе PENDING или REJECTED)
    if (!["PENDING", "REJECTED"].includes(ticket.status)) {
      return NextResponse.json(
        { error: "Обращение можно удалить только в статусе 'Ожидание' или 'Отклонено'" },
        { status: 400 }
      );
    }

    // Логируем действие перед удалением
    await prisma.ticketActionLog.create({
      data: {
        ticketId: ticket.id,
        userId: session.user.id,
        actionType: "deleted",
        description: `Обращение удалено пользователем: ${ticket.title}`,
        oldValue: JSON.stringify({ title: ticket.title, content: ticket.content }),
      },
    });

    // Удаляем связанный чат, если он существует
    if (ticket.chatId) {
      try {
        // Удаляем всех участников из чата
        await prisma.chatParticipant.updateMany({
          where: { chatId: ticket.chatId },
          data: { leftAt: new Date() },
        });
        
        // Удаляем чат (каскадно удалятся сообщения и участники)
        await prisma.chat.delete({
          where: { id: ticket.chatId },
        });
        
        console.log(`[tickets] ✅ Удален чат обращения: ${ticket.chatId}`);
      } catch (chatError) {
        console.error('[tickets] Error deleting chat:', chatError);
        // Продолжаем удаление обращения даже если не удалось удалить чат
      }
    }

    // Удаляем тикет (каскадно удалятся attachments и comments)
    await prisma.ticket.delete({
      where: { id },
    });

    return NextResponse.json({
      success: true,
      message: "Обращение успешно удалено",
    });
  } catch (error) {
    console.error("[tickets] Error deleting ticket:", error);
    return NextResponse.json(
      { error: "Ошибка при удалении тикета" },
      { status: 500 }
    );
  }
}

