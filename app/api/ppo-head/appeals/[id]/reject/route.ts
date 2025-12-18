import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { sendPushNotification } from "@/lib/push-notifications";
import { sendEmail } from "@/lib/email";
import { sendChatMessage } from "@/lib/chat-utils";
import { getPPOHead } from "@/lib/ppo-head-utils";

/**
 * POST /api/ppo-head/appeals/[id]/reject
 * Отклонить обращение с указанием причины
 */
export async function POST(
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
    const { reason } = await request.json();

    if (!reason || !reason.trim()) {
      return NextResponse.json(
        { error: "Укажите причину отклонения" },
        { status: 400 }
      );
    }

    // Получаем обращение
    const ticket = await prisma.ticket.findUnique({
      where: { id: ticketId },
      include: {
        user: true,
        organization: true,
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

    // Обновляем статус обращения
    await prisma.ticket.update({
      where: { id: ticketId },
      data: {
        status: "REJECTED",
        rejectionReason: reason.trim(),
      },
    });

    // Логируем действие
    await prisma.ticketActionLog.create({
      data: {
        ticketId,
        userId: chairman.id,
        actionType: "rejected",
        description: `Обращение отклонено. Причина: ${reason.trim()}`,
        oldValue: ticket.status,
        newValue: "REJECTED",
        metadata: {
          rejectionReason: reason.trim(),
        },
      },
    });

    // Отправляем сообщение в чат, если он существует
    if (ticket.chatId) {
      const rejectionMessage = `Ваше обращение отклонено.\n\nПричина: ${reason.trim()}`;
      await sendChatMessage(ticket.chatId, chairman.id, rejectionMessage);
    }

    // Отправляем уведомления
    if (ticket.user.pushNotificationsEnabled) {
      try {
        await sendPushNotification(ticket.userId, {
          title: "Обращение отклонено",
          body: `Ваше обращение #${ticket.publicId} отклонено. Причина: ${reason.trim()}`,
          url: `/dashboard/appeals/${ticket.id}`,
        });
      } catch (pushError) {
        console.error("[ppo-head/appeals] Push notification error:", pushError);
      }
    }

    if (ticket.user.emailAppealNotifications && ticket.user.email) {
      try {
        await sendEmail({
          to: ticket.user.email,
          subject: `Обращение #${ticket.publicId} отклонено`,
          text: `Ваше обращение #${ticket.publicId} отклонено. Причина: ${reason}`,
          html: `
            <h2>Ваше обращение отклонено</h2>
            <p>Ваше обращение <strong>#${ticket.publicId}</strong> было отклонено.</p>
            <p><strong>Причина:</strong> ${reason.trim()}</p>
            <p><a href="${process.env.NEXT_PUBLIC_APP_URL}/dashboard/appeals/${ticket.id}">Посмотреть обращение</a></p>
          `,
        });
      } catch (emailError) {
        console.error("[ppo-head/appeals] Email notification error:", emailError);
      }
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("[ppo-head/appeals] POST reject error:", error);
    return NextResponse.json(
      {
        error: "Ошибка при отклонении обращения",
        details: process.env.NODE_ENV === "development" ? error.message : undefined,
      },
      { status: 500 }
    );
  }
}

