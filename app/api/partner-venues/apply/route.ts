import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PV_APPLICATION_STATUS } from "@/lib/partner-venue-application-status";
import {
  countOccupyingApplicationsRaw,
  getApplicationByVenueAndApplicantRaw,
} from "@/lib/partner-venue-application-raw";
import { Prisma } from "@prisma/client";
import { mergeParticipationModeOnVenue } from "@/lib/partner-venue-participation-db";
import {
  resolvePartnerVenueNotificationEmail,
  sendPartnerVenueApplicationEmail,
} from "@/lib/partner-venue-application-email";
import { partnerVenueHasApplicationSlotCap } from "@/lib/partner-venue-slot-cap";
import { partnerVenueHasSlaCatalogBlock } from "@/lib/partner-venue-sla";

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const venueId = typeof body.venueId === "string" ? body.venueId.trim() : "";
    if (!venueId) {
      return NextResponse.json({ error: "Не указана площадка" }, { status: 400 });
    }

    const applicant = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { id: true, partnerRecordId: true },
    });
    if (!applicant) {
      return NextResponse.json({ error: "Пользователь не найден" }, { status: 404 });
    }

    const venue = await prisma.partnerVenue.findFirst({
      where: {
        id: venueId,
        isActive: true,
        partner: { isActive: true, moderationStatus: "APPROVED", moderationApprovedAt: { not: null } },
      },
      include: {
        partner: {
          select: {
            id: true,
            name: true,
            email: true,
            contactEmail: true,
          },
        },
      },
    });

    if (!venue) {
      return NextResponse.json({ error: "Площадка не найдена" }, { status: 404 });
    }

    if (await partnerVenueHasSlaCatalogBlock(venue.id)) {
      return NextResponse.json(
        {
          error:
            "Площадка временно недоступна: просрочена обработка заявок (неоткрытые «Новая» дольше 48 ч или «В работе» дольше 72 ч). Обратитесь к партнёру позже.",
        },
        { status: 403 }
      );
    }

    if (applicant.partnerRecordId && applicant.partnerRecordId === venue.partnerId) {
      return NextResponse.json({ error: "Нельзя подать заявку на собственную площадку" }, { status: 403 });
    }

    const venueHydrated = await mergeParticipationModeOnVenue(prisma, venue);
    if (String(venueHydrated.participationMode) !== "APPLICATION") {
      return NextResponse.json({ error: "Площадка не принимает заявки" }, { status: 400 });
    }

    const to = resolvePartnerVenueNotificationEmail({
      email: venue.email,
      partner: {
        contactEmail: venue.partner.contactEmail,
        email: venue.partner.email,
      },
    });
    if (!to) {
      return NextResponse.json(
        { error: "У партнёра не указан email для уведомлений" },
        { status: 400 }
      );
    }

    const cap = venue.remainingSlots;
    if (partnerVenueHasApplicationSlotCap(cap)) {
      const used = await countOccupyingApplicationsRaw(prisma, venue.id);
      if (used >= cap) {
        return NextResponse.json(
          { error: "Лимит заявок для этой площадки исчерпан." },
          { status: 400 }
        );
      }
    }

    try {
      await prisma.partnerVenueApplication.create({
        data: {
          partnerVenueId: venue.id,
          applicantUserId: applicant.id,
        },
      });
    } catch (e: unknown) {
      const code = (e as { code?: string })?.code;
      if (code === "P2002") {
        const existing = await getApplicationByVenueAndApplicantRaw(prisma, venue.id, applicant.id);
        if (existing?.status === PV_APPLICATION_STATUS.CANCELLED) {
          if (partnerVenueHasApplicationSlotCap(cap)) {
            const used = await countOccupyingApplicationsRaw(prisma, venue.id);
            if (used >= cap) {
              return NextResponse.json(
                { error: "Лимит заявок для этой площадки исчерпан." },
                { status: 400 }
              );
            }
          }
          await prisma.$executeRaw(
            Prisma.sql`
              UPDATE "PartnerVenueApplication"
              SET status = 'NEW'::"PartnerVenueApplicationStatus",
                  "inProgressAt" = NULL,
                  "slaReminder24hSentAt" = NULL,
                  "slaReminder2hSentAt" = NULL
              WHERE id = ${existing.id}
            `
          );
          const { sent } = await sendPartnerVenueApplicationEmail(to, {
            venueId: venue.id,
            venueName: venue.name,
          });
          const applicationsCount = await countOccupyingApplicationsRaw(prisma, venue.id);
          const remainingApplicationSlots = partnerVenueHasApplicationSlotCap(cap)
            ? Math.max(0, cap - applicationsCount)
            : null;
          return NextResponse.json({
            ok: true,
            reopened: true,
            emailSent: sent,
            message: sent
              ? "Заявка снова отправлена, партнёру ушло уведомление на email."
              : "Заявка восстановлена. Письмо партнёру не удалось отправить (проверьте настройки почты на сервере).",
            applicationsCount,
            remainingApplicationSlots,
          });
        }
        return NextResponse.json({ error: "Вы уже подали заявку по этой площадке" }, { status: 409 });
      }
      if (code === "P2021") {
        console.error("[partner-venues/apply] Missing table (run prisma migrate deploy):", e);
        return NextResponse.json(
          {
            error:
              "База данных не обновлена: нет таблицы заявок. Выполните prisma migrate deploy и повторите попытку.",
          },
          { status: 503 }
        );
      }
      throw e;
    }

    const { sent } = await sendPartnerVenueApplicationEmail(to, {
      venueId: venue.id,
      venueName: venue.name,
    });

    const applicationsCount = await countOccupyingApplicationsRaw(prisma, venue.id);
    const remainingApplicationSlots = partnerVenueHasApplicationSlotCap(cap)
      ? Math.max(0, cap - applicationsCount)
      : null;

    return NextResponse.json({
      ok: true,
      emailSent: sent,
      message: sent
        ? "Заявка отправлена, партнёру ушло уведомление на email."
        : "Заявка сохранена. Письмо партнёру не удалось отправить (проверьте настройки почты на сервере).",
      applicationsCount,
      remainingApplicationSlots,
    });
  } catch (e) {
    console.error("[partner-venues/apply] POST:", e);
    return NextResponse.json({ error: "Не удалось отправить заявку" }, { status: 500 });
  }
}
