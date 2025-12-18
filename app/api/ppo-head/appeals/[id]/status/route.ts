import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getPPOHead } from "@/lib/ppo-head-utils";
import { sendUserNotification } from "@/lib/notifications";

// Статусы с их названиями для системных сообщений
const STATUS_NAMES: Record<string, string> = {
  PENDING: "Ожидает рассмотрения",
  IN_PROGRESS: "В работе",
  RESOLVED: "Решено",
  CLOSED: "Закрыто",
  REJECTED: "Отклонено",
};

// Эмодзи для статусов
const STATUS_EMOJI: Record<string, string> = {
  PENDING: "⏳",
  IN_PROGRESS: "🔄",
  RESOLVED: "✅",
  CLOSED: "📁",
  REJECTED: "❌",
};

/**
 * PUT /api/ppo-head/appeals/[id]/status
 * Изменить статус обращения
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } | Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }

    // Проверяем, что пользователь является Председателем
    const chairman = await getPPOHead(session.user.id);

    if (!chairman) {
      return NextResponse.json(
        { error: "Доступ запрещен или организация не назначена" },
        { status: 403 }
      );
    }

    const resolvedParams = await Promise.resolve(params);
    const ticketId = resolvedParams.id;
    const { status, comment } = await request.json();

    if (!status) {
      return NextResponse.json(
        { error: "Укажите новый статус" },
        { status: 400 }
      );
    }

    // Проверяем допустимость статуса
    const validStatuses = ["PENDING", "IN_PROGRESS", "RESOLVED", "CLOSED"];
    if (!validStatuses.includes(status)) {
      return NextResponse.json(
        { error: "Недопустимый статус" },
        { status: 400 }
      );
    }

    // Получаем обращение
    const ticket = await prisma.ticket.findUnique({
      where: { id: ticketId },
      include: {
        user: true,
      },
    });

    if (!ticket) {
      return NextResponse.json(
        { error: "Обращение не найдено" },
        { status: 404 }
      );
    }

    if (ticket.organizationId !== chairman.organizationId) {
      return NextResponse.json(
        { error: "Доступ запрещен" },
        { status: 403 }
      );
    }

    const oldStatus = ticket.status;
    
    // Не обновляем если статус не изменился
    if (oldStatus === status) {
      return NextResponse.json({ success: true, unchanged: true });
    }

    // Обновляем статус обращения
    await prisma.ticket.update({
      where: { id: ticketId },
      data: { status },
    });

    // Логируем действие
    await prisma.ticketActionLog.create({
      data: {
        ticketId,
        userId: chairman.id,
        actionType: "status_changed",
        description: `Статус изменен: ${STATUS_NAMES[oldStatus] || oldStatus} → ${STATUS_NAMES[status] || status}`,
        oldValue: oldStatus,
        newValue: status,
        metadata: comment ? { comment } : undefined,
      },
    });

    // Отправляем системное сообщение в чат
    if (ticket.chatId) {
      const emoji = STATUS_EMOJI[status] || "📌";
      let systemMessage = `${emoji} **Статус обращения изменен**\n\n`;
      systemMessage += `${STATUS_NAMES[oldStatus] || oldStatus} → ${STATUS_NAMES[status] || status}`;
      
      if (comment) {
        systemMessage += `\n\n💬 Комментарий: ${comment}`;
      }

      await prisma.chatMessage.create({
        data: {
          chatId: ticket.chatId,
          senderId: chairman.id,
          content: systemMessage,
        },
      });

      // Обновляем lastMessage в чате
      await prisma.chat.update({
        where: { id: ticket.chatId },
        data: {
          lastMessageAt: new Date(),
          lastMessage: `${emoji} Статус: ${STATUS_NAMES[status] || status}`,
        },
      });
    }

    // Отправляем уведомление пользователю
    try {
      const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://myunion.pro";
      await sendUserNotification({
        userId: ticket.userId,
        type: "ticket_response",
        title: `${STATUS_EMOJI[status] || "📌"} Статус обращения изменен`,
        body: `Обращение #${ticket.publicId}: ${STATUS_NAMES[status] || status}`,
        url: `${baseUrl}/dashboard/appeals/${ticket.id}`,
        senderName: "Профсоюз",
      });
    } catch (notificationError) {
      console.error("[ppo-head/appeals/status] Notification error:", notificationError);
    }

    return NextResponse.json({ 
      success: true,
      oldStatus,
      newStatus: status,
    });
  } catch (error: any) {
    console.error("[ppo-head/appeals/status] PUT error:", error);
    return NextResponse.json(
      {
        error: "Ошибка при изменении статуса",
        details: process.env.NODE_ENV === "development" ? error.message : undefined,
      },
      { status: 500 }
    );
  }
}

