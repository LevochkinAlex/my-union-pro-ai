import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendUserNotification } from "@/lib/notifications";

const CRON_SECRET = process.env.CRON_SECRET;

/**
 * Проверяет авторизацию cron запроса
 */
function validateCronRequest(request: NextRequest): boolean {
  const authHeader = request.headers.get("authorization");
  if (authHeader === `Bearer ${CRON_SECRET}`) {
    return true;
  }

  const url = new URL(request.url);
  const secretParam = url.searchParams.get("secret");
  if (secretParam === CRON_SECRET) {
    return true;
  }

  const vercelCron = request.headers.get("x-vercel-cron");
  if (vercelCron === "true") {
    return true;
  }

  return false;
}

/**
 * GET /api/cron/check-ticket-deadlines
 * Проверяет сроки ответа на обращения и отправляет уведомления
 * Вызывается каждый час или ежедневно в 9:00 МСК
 */
export async function GET(request: NextRequest) {
  const startTime = Date.now();

  if (!CRON_SECRET) {
    console.error("[cron/check-ticket-deadlines] CRON_SECRET not configured");
    return NextResponse.json({ error: "Cron not configured" }, { status: 500 });
  }

  if (!validateCronRequest(request)) {
    console.warn("[cron/check-ticket-deadlines] Unauthorized cron request");
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  console.log("[cron/check-ticket-deadlines] Starting ticket deadline check...");

  try {
    const now = new Date();
    const moscowTime = new Date(now.toLocaleString("en-US", { timeZone: "Europe/Moscow" }));
    const isMorningCheck = moscowTime.getHours() === 9; // Проверка в 9:00 МСК

    let checkedCount = 0;
    let overdueCount = 0;
    let reminderSentCount = 0;
    let autoClosedCount = 0;
    const errors: string[] = [];

    // 1. Проверяем просроченные обращения (дедлайн ответа председателя истек)
    const overdueTickets = await prisma.ticket.findMany({
      where: {
        status: { in: ["PENDING", "IN_PROGRESS"] },
        responseDeadline: {
          lte: now, // Дедлайн истек
        },
        isOverdue: false, // Еще не помечено как просроченное
      },
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            organizationId: true,
          },
        },
        organization: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    console.log(`[cron/check-ticket-deadlines] Found ${overdueTickets.length} overdue tickets`);

    // Помечаем как просроченные и отправляем уведомления председателям
    for (const ticket of overdueTickets) {
      try {
        checkedCount++;

        // Находим председателя организации
        let chairmanId: string | null = null;
        if (ticket.organizationId) {
          // Ищем председателя ППО по organizationId
          const chairman = await prisma.user.findFirst({
            where: {
              OR: [
                { ppoHeadOrganizationId: ticket.organizationId },
                { organizationId: ticket.organizationId, role: "PPO_HEAD" },
                { organizationId: ticket.organizationId, isPPOHead: true },
              ],
            },
            select: { id: true },
          });
          chairmanId = chairman?.id || null;
        }

        // Помечаем как просроченное
        await prisma.ticket.update({
          where: { id: ticket.id },
          data: {
            isOverdue: true,
            overdueReportedAt: now,
          },
        });

        overdueCount++;

        // Отправляем уведомление председателю
        if (chairmanId) {
          try {
            const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://myunion.pro";
            await sendUserNotification({
              userId: chairmanId,
              type: "ticket_response",
              title: `⚠️ Просрочено обращение #${ticket.publicId}`,
              body: `Обращение "${ticket.title}" просрочено. Требуется срочный ответ.`,
              url: `${baseUrl}/dashboard/appeals/ppo-head?id=${ticket.publicId}`,
              metadata: {
                ticketId: ticket.id,
                publicId: ticket.publicId,
                isOverdue: true,
              },
            });
          } catch (notifError) {
            console.error(`[cron/check-ticket-deadlines] Failed to notify chairman for ticket ${ticket.id}:`, notifError);
          }
        }
      } catch (error) {
        errors.push(`Ticket ${ticket.id}: ${error}`);
      }
    }

    // 2. Ежедневные напоминания в 9:00 МСК для всех открытых обращений
    if (isMorningCheck) {
      const openTickets = await prisma.ticket.findMany({
        where: {
          status: { in: ["PENDING", "IN_PROGRESS"] },
          // Не отправляем напоминание, если уже отправляли сегодня
          OR: [
            { lastReminderSentAt: null },
            { lastReminderSentAt: { lt: new Date(now.getTime() - 23 * 60 * 60 * 1000) } }, // Более 23 часов назад
          ],
        },
        include: {
          user: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
              organizationId: true,
            },
          },
          organization: {
            select: {
              id: true,
              name: true,
            },
          },
        },
      });

      console.log(`[cron/check-ticket-deadlines] Sending daily reminders for ${openTickets.length} tickets`);

      for (const ticket of openTickets) {
        try {
          // Находим председателя организации
          let chairmanId: string | null = null;
          if (ticket.organizationId) {
            // Ищем председателя ППО по organizationId
            const chairman = await prisma.user.findFirst({
              where: {
                OR: [
                  { ppoHeadOrganizationId: ticket.organizationId },
                  { organizationId: ticket.organizationId, role: "PPO_HEAD" },
                  { organizationId: ticket.organizationId, isPPOHead: true },
                ],
              },
              select: { id: true },
            });
            chairmanId = chairman?.id || null;
          }

          if (chairmanId) {
            const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://myunion.pro";
            const isOverdue = ticket.isOverdue || (ticket.responseDeadline && ticket.responseDeadline < now);
            const deadlineText = ticket.responseDeadline
              ? `Дедлайн: ${ticket.responseDeadline.toLocaleDateString("ru-RU")} ${ticket.responseDeadline.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })}`
              : "";

            await sendUserNotification({
              userId: chairmanId,
              type: "ticket_response",
              title: isOverdue
                ? `🔴 Срочно: Просрочено обращение #${ticket.publicId}`
                : `📋 Напоминание: Обращение #${ticket.publicId}`,
              body: isOverdue
                ? `Обращение "${ticket.title}" просрочено и требует немедленного ответа. ${deadlineText}`
                : `Требуется ответ на обращение "${ticket.title}". ${deadlineText}`,
              url: `${baseUrl}/dashboard/appeals/ppo-head?id=${ticket.publicId}`,
              metadata: {
                ticketId: ticket.id,
                publicId: ticket.publicId,
                isOverdue,
              },
            });

            // Обновляем дату последнего напоминания
            await prisma.ticket.update({
              where: { id: ticket.id },
              data: {
                lastReminderSentAt: now,
              },
            });

            reminderSentCount++;
          }
        } catch (error) {
          errors.push(`Reminder for ticket ${ticket.id}: ${error}`);
        }
      }
    }

    // 3. Автоматическое закрытие обращений, если пользователь не ответил в течение 72 часов после ответа председателя
    const ticketsToAutoClose = await prisma.ticket.findMany({
      where: {
        status: { in: ["PENDING", "IN_PROGRESS"] },
        lastResponseAt: { not: null }, // Председатель ответил
        userResponseDeadline: {
          lte: now, // Дедлайн ответа пользователя истек
        },
        autoClosedAt: null, // Еще не закрыто автоматически
      },
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
      },
    });

    console.log(`[cron/check-ticket-deadlines] Found ${ticketsToAutoClose.length} tickets to auto-close`);

    for (const ticket of ticketsToAutoClose) {
      try {
        // Автоматически закрываем обращение
        await prisma.ticket.update({
          where: { id: ticket.id },
          data: {
            status: "CLOSED",
            resolved: true,
            resolvedAt: now,
            autoClosedAt: now,
            // Не устанавливаем helpfulRating, так как пользователь не ответил
          },
        });

        // Отправляем сообщение в чат, если есть
        if (ticket.chatId) {
          try {
            await prisma.chatMessage.create({
              data: {
                chatId: ticket.chatId,
                senderId: ticket.userId, // От имени пользователя (система)
                content: "Обращение автоматически закрыто, так как не было получено ответа от пользователя в течение 72 часов после ответа председателя.",
                messageType: "text",
              },
            });
          } catch (chatError) {
            console.error(`[cron/check-ticket-deadlines] Failed to send auto-close message to chat ${ticket.chatId}:`, chatError);
          }
        }

        autoClosedCount++;
      } catch (error) {
        errors.push(`Auto-close ticket ${ticket.id}: ${error}`);
      }
    }

    const duration = Date.now() - startTime;
    console.log(`[cron/check-ticket-deadlines] Completed in ${duration}ms:`, {
      checked: checkedCount,
      overdue: overdueCount,
      reminders: reminderSentCount,
      autoClosed: autoClosedCount,
      errors: errors.length,
    });

    return NextResponse.json({
      success: true,
      checked: checkedCount,
      overdue: overdueCount,
      reminders: reminderSentCount,
      autoClosed: autoClosedCount,
      errors: errors.slice(0, 10),
      duration,
    });
  } catch (error) {
    console.error("[cron/check-ticket-deadlines] Error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
