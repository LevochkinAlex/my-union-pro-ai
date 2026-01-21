import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
// import { sendChatMessage } from "@/lib/chat-server-utils"; // TODO: Переделать на Matrix API
import { sendUserNotification } from "@/lib/notifications";

/**
 * POST /api/tickets/[id]/rate - Оценить полезность ответа по обращению
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

    const { id } = await params;
    const body = await request.json();
    const { rating, comment } = body;

    // Валидация рейтинга
    if (!rating || rating < 1 || rating > 5) {
      return NextResponse.json(
        { error: "Рейтинг должен быть от 1 до 5" },
        { status: 400 }
      );
    }

    // Получаем обращение
    const ticket = await prisma.ticket.findUnique({
      where: { id },
      include: {
        user: {
          select: { id: true, firstName: true, lastName: true },
        },
        organization: {
          include: {
            members: {
              where: { role: "PPO_HEAD" },
              take: 1,
              select: { id: true },
            },
          },
        },
      },
    });

    if (!ticket) {
      return NextResponse.json(
        { error: "Обращение не найдено" },
        { status: 404 }
      );
    }

    // Проверяем, что обращение принадлежит пользователю
    if (ticket.userId !== session.user.id) {
      return NextResponse.json(
        { error: "Вы можете оценить только свои обращения" },
        { status: 403 }
      );
    }

    // Проверяем, что обращение в статусе RESOLVED или CLOSED
    if (!["RESOLVED", "CLOSED"].includes(ticket.status)) {
      return NextResponse.json(
        { error: "Можно оценить только решенные или закрытые обращения" },
        { status: 400 }
      );
    }

    // Проверяем, не была ли уже выставлена оценка
    if (ticket.helpfulRating) {
      return NextResponse.json(
        { error: "Вы уже оценили это обращение" },
        { status: 400 }
      );
    }

    // Обновляем обращение с рейтингом
    const updatedTicket = await prisma.ticket.update({
      where: { id },
      data: {
        helpfulRating: rating,
        helpfulRatingComment: comment?.trim() || null,
        helpfulRatingAt: new Date(),
      },
    });

    // Логируем действие
    await prisma.ticketActionLog.create({
      data: {
        ticketId: id,
        userId: session.user.id,
        actionType: "rated",
        description: `Выставлена оценка полезности: ${rating}/5${comment ? `. Комментарий: ${comment}` : ""}`,
        metadata: {
          rating,
          comment: comment || null,
        },
      },
    });

    // TODO: Отправляем сообщение в тред обращения через Matrix API
    if (ticket.chatId) {
      const ratingStars = "⭐".repeat(rating);
      let message = `📊 Оценка полезности ответа: ${ratingStars} (${rating}/5)`;
      if (comment) {
        message += `\n\nКомментарий: ${comment}`;
      }
      // await sendMatrixMessage(...);
    }

    // Уведомляем Председателя об оценке
    const chairmanId = ticket.organization?.members?.[0]?.id;
    if (chairmanId) {
      const userName = [ticket.user.firstName, ticket.user.lastName].filter(Boolean).join(" ");
      await sendUserNotification({
        userId: chairmanId,
        type: "ticket_rated",
        title: "Оценка обращения",
        body: `${userName || "Пользователь"} оценил ответ по обращению #${ticket.publicId} на ${rating}/5`,
        url: `/dashboard/appeals/${ticket.id}`,
      });
    }

    return NextResponse.json({
      success: true,
      message: "Спасибо за вашу оценку!",
      ticket: {
        id: updatedTicket.id,
        helpfulRating: updatedTicket.helpfulRating,
        helpfulRatingComment: updatedTicket.helpfulRatingComment,
        helpfulRatingAt: updatedTicket.helpfulRatingAt,
      },
    });
  } catch (error: any) {
    console.error("[tickets] POST rate error:", error);
    return NextResponse.json(
      {
        error: "Ошибка при сохранении оценки",
        details: process.env.NODE_ENV === "development" ? error.message : undefined,
      },
      { status: 500 }
    );
  }
}

