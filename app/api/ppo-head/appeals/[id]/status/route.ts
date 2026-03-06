import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import type { TicketStatus } from "@prisma/client";
import { checkUserPermissions } from "@/lib/staff-permissions";
import { sendUserNotification } from "@/lib/notifications";

const ALLOWED_STATUSES = ["PENDING", "IN_PROGRESS", "RESOLVED"] as const;

/**
 * PATCH /api/ppo-head/appeals/[id]/status
 * Смена статуса обращения председателем / сотрудником.
 * При переходе в IN_PROGRESS можно передать message — текст уходит в чат и уведомлением обратившемуся.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }

    const { id } = await params;
    const body = await request.json();
    const status = body?.status as string;
    const message = (body?.message as string)?.trim() || null;

    if (!status || !ALLOWED_STATUSES.includes(status as any)) {
      return NextResponse.json(
        { error: "Укажите статус: PENDING, IN_PROGRESS или RESOLVED" },
        { status: 400 }
      );
    }

    if (status === "IN_PROGRESS" && !message) {
      return NextResponse.json(
        { error: "При переводе в работу укажите сообщение для обратившегося" },
        { status: 400 }
      );
    }

    const publicIdNormalized = typeof id === "string" ? id.replace(/-/g, "") : id;
    const ticket = await prisma.ticket.findFirst({
      where: { OR: [{ publicId: publicIdNormalized }, { id }] },
      select: {
        id: true,
        publicId: true,
        title: true,
        status: true,
        organizationId: true,
        chatId: true,
        userId: true,
      },
    });

    if (!ticket) {
      return NextResponse.json({ error: "Обращение не найдено" }, { status: 404 });
    }

    const perm = await checkUserPermissions(session.user.id, "appeals_manage");
    if (!perm.hasAccess || perm.organizationId !== ticket.organizationId) {
      return NextResponse.json(
        {
          error: "Только председатель или сотрудник с правом управления обращениями может менять статус",
          requiredPermission: "appeals_manage",
          denyReason: perm.denyReason || "MISSING_PERMISSION",
        },
        { status: 403 }
      );
    }

    if (ticket.status === "CLOSED" || ticket.status === "REJECTED") {
      return NextResponse.json(
        { error: "Нельзя изменить статус закрытого или отклонённого обращения" },
        { status: 400 }
      );
    }

    const updated = await prisma.ticket.update({
      where: { id: ticket.id },
      data: {
        status: status as TicketStatus,
        ...(status === "IN_PROGRESS" ? { lastResponseAt: new Date() } : {}),
        ...(status === "RESOLVED" ? { resolved: true, resolvedAt: new Date(), isOverdue: false } : {}),
      },
    });

    // Отправляем сообщение в чат обращения
    if (ticket.chatId && message) {
      try {
        const statusLabel =
          status === "IN_PROGRESS" ? "В работе" : status === "RESOLVED" ? "Решено" : status;
        const chatContent = `📋 Статус обращения изменён на «${statusLabel}»\n\n${message}`;

        await prisma.chatMessage.create({
          data: {
            chatId: ticket.chatId,
            senderId: session.user.id,
            content: chatContent,
            messageType: "text",
          },
        });

        const lastMessage = await prisma.chatMessage.findFirst({
          where: { chatId: ticket.chatId },
          orderBy: { createdAt: "desc" },
        });
        if (lastMessage) {
          await prisma.chat.update({
            where: { id: ticket.chatId },
            data: { lastMessageId: lastMessage.id, lastMessageAt: lastMessage.createdAt },
          });
        }
      } catch (chatErr) {
        console.error("[ppo-head/appeals/status] Chat message error:", chatErr);
      }
    }

    // Уведомление обратившемуся
    if (ticket.userId !== session.user.id && message) {
      try {
        const statusLabel =
          status === "IN_PROGRESS" ? "В работе" : status === "RESOLVED" ? "Решено" : status;
        await sendUserNotification({
          userId: ticket.userId,
          type: "ticket_response",
          title: `Обращение #${ticket.publicId} — ${statusLabel}`,
          body: message.substring(0, 200),
          url: `/dashboard/appeals/${ticket.id}`,
          metadata: { ticketId: ticket.id, publicId: ticket.publicId },
        });
      } catch (notifErr) {
        console.error("[ppo-head/appeals/status] Notification error:", notifErr);
      }
    }

    // Лог действия (описание с русским названием статуса для отображения в чате)
    const statusLabelForLog =
      status === "IN_PROGRESS" ? "В работе" : status === "RESOLVED" ? "Решено" : status === "PENDING" ? "Ожидание" : status === "REJECTED" ? "Отклонено" : status === "CLOSED" ? "Закрыто" : status;
    await prisma.ticketActionLog.create({
      data: {
        ticketId: ticket.id,
        userId: session.user.id,
        actionType: "status_changed",
        description: `Статус изменён на «${statusLabelForLog}»${message ? `. Сообщение: ${message.substring(0, 200)}` : ""}`,
        oldValue: ticket.status,
        newValue: status,
      },
    }).catch(() => {});

    return NextResponse.json({
      success: true,
      ticket: { id: updated.id, publicId: updated.publicId, status: updated.status },
    });
  } catch (error: any) {
    console.error("[ppo-head/appeals/status] Error:", error);
    return NextResponse.json(
      { error: "Ошибка смены статуса", details: error?.message },
      { status: 500 }
    );
  }
}
