import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendUserNotification } from "@/lib/notifications";
import { sendEmail } from "@/lib/email";
import { RENEWAL_REMINDER_DAYS } from "@/lib/constants/tariffs";

const CRON_SECRET = process.env.CRON_SECRET;

function validateCronRequest(request: NextRequest): boolean {
  if (!CRON_SECRET) return false;
  if (request.headers.get("authorization") === `Bearer ${CRON_SECRET}`) return true;
  return new URL(request.url).searchParams.get("secret") === CRON_SECRET;
}

/**
 * GET /api/cron/subscription-reminders
 * За 7 дней до окончания подписки: push и email председателю с ссылкой на продление
 */
export async function GET(request: NextRequest) {
  if (!CRON_SECRET) {
    return NextResponse.json({ error: "Cron not configured" }, { status: 500 });
  }
  if (!validateCronRequest(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date();
  const in7Days = new Date(now);
  in7Days.setDate(in7Days.getDate() + RENEWAL_REMINDER_DAYS);

  try {
    const subs = await prisma.organizationSubscription.findMany({
      where: {
        status: { in: ["ACTIVE", "TRIAL"] },
        OR: [
          { periodEndsAt: { gte: now, lte: in7Days } },
          { trialEndsAt: { gte: now, lte: in7Days } },
        ],
      },
      include: {
        organization: {
          select: {
            id: true,
            name: true,
            type: true,
            ppoChairman: {
              select: {
                id: true,
                email: true,
                firstName: true,
                lastName: true,
              },
            },
          },
        },
      },
    });

    let sent = 0;
    const baseUrl =
      (typeof process.env.NEXTAUTH_URL === "string" && process.env.NEXTAUTH_URL) ||
      (typeof process.env.VERCEL_URL === "string" ? `https://${process.env.VERCEL_URL}` : null) ||
      "https://localhost:3004";
    const subscriptionUrl = baseUrl.startsWith("http") ? `${baseUrl}/dashboard/subscription` : `https://${baseUrl}/dashboard/subscription`;

    for (const sub of subs) {
      const org = sub.organization;
      const chairman = org?.ppoChairman;
      const chairmanId = chairman?.id;
      if (!chairmanId || !org) continue;

      const endDate = sub.trialEndsAt ?? sub.periodEndsAt;
      const daysLeft = endDate ? Math.ceil((endDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)) : 0;
      const title = "Напоминание: подписка заканчивается";
      const body = `Подписка организации «${org.name}» заканчивается через ${daysLeft} дн. Продлите тариф в личном кабинете.`;

      await sendUserNotification({
        userId: chairmanId,
        type: "mass_notification",
        title,
        body,
        url: subscriptionUrl,
      });
      sent++;

      if (chairman.email) {
        try {
          const text = body + "\n\nПродлить подписку: " + subscriptionUrl;
          await sendEmail({
            to: chairman.email,
            subject: title,
            html: `<p>${body.replace(/\n/g, "<br/>")}</p><p><a href="${subscriptionUrl}">Продлить подписку</a></p>`,
            text,
          });
        } catch (e) {
          console.warn("[subscription-reminders] Email send failed for", chairmanId, e);
        }
      }
    }


    return NextResponse.json({ ok: true, remindersSent: sent, checked: subs.length });
  } catch (e) {
    console.error("[cron/subscription-reminders]", e);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
