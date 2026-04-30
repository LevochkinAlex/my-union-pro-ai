import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { PV_APPLICATION_STATUS } from "@/lib/partner-venue-application-status";
import {
  countOccupyingApplicationsRaw,
  countOccupyingByVenueIdsRaw,
  getApplicationByVenueAndApplicantRaw,
} from "@/lib/partner-venue-application-raw";
import { prisma, withPrismaRetry } from "@/lib/prisma";
import {
  mergeParticipationModeOnVenue,
  mergeParticipationModesOnVenues,
} from "@/lib/partner-venue-participation-db";
import { partnerVenueHasApplicationSlotCap } from "@/lib/partner-venue-slot-cap";
import { getPartnerVenueIdsSlaOverdueFromCatalog } from "@/lib/partner-venue-sla";

/**
 * GET /api/partner-venues/public?search=&city=&page=1&limit=20
 * Публичный список активных площадок партнёров (для каталога скидок).
 * Доступ: любой авторизованный пользователь.
 */
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);

    const venueId = searchParams.get("venueId")?.trim();
    if (venueId) {
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
              description: true,
              website: true,
              logoUrl: true,
              email: true,
              contactEmail: true,
            },
          },
        },
      });
      if (!venue) {
        return NextResponse.json({ error: "Площадка не найдена" }, { status: 404 });
      }
      const slaHiddenIds = await getPartnerVenueIdsSlaOverdueFromCatalog(prisma);
      if (slaHiddenIds.includes(venue.id)) {
        return NextResponse.json({ error: "Площадка не найдена" }, { status: 404 });
      }
      const venueHydrated = await mergeParticipationModeOnVenue(prisma, venue);

      const [applicationsCount, currentUserApp] = await Promise.all([
        countOccupyingApplicationsRaw(prisma, venue.id),
        getApplicationByVenueAndApplicantRaw(prisma, venue.id, session.user.id),
      ]);
      const currentUserHasApplication = Boolean(
        currentUserApp && currentUserApp.status !== PV_APPLICATION_STATUS.CANCELLED
      );

      const cap = venue.remainingSlots;
      const applicationSlotsCapped = partnerVenueHasApplicationSlotCap(cap);
      const remainingApplicationSlots = applicationSlotsCapped
        ? Math.max(0, cap - applicationsCount)
        : null;

      return NextResponse.json({
        venue: {
          ...venueHydrated,
          applicationsCount,
          currentUserHasApplication,
          applicationSlotsCapped,
          remainingApplicationSlots,
        },
      });
    }

    const search = searchParams.get("search")?.trim() || "";
    const city = searchParams.get("city")?.trim() || "";
    const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
    const limit = Math.min(50, Math.max(1, parseInt(searchParams.get("limit") || "20", 10)));
    const skip = (page - 1) * limit;

    const where: any = {
      isActive: true,
      partner: { isActive: true, moderationStatus: "APPROVED", moderationApprovedAt: { not: null } },
    };

    if (city) {
      where.city = { contains: city, mode: "insensitive" };
    }

    if (search) {
      const words = search.split(/\s+/).filter(Boolean);
      if (words.length > 0) {
        const ilike = (field: string, value: string) => ({
          [field]: { contains: value, mode: "insensitive" as const },
        });
        const orForWord = (word: string) => ({
          OR: [
            ilike("name", word),
            ilike("description", word),
            ilike("promoLabel", word),
            { partner: ilike("name", word) },
          ],
        });
        where.AND = words.map((w) => orForWord(w));
      }
    }

    const slaHiddenIds = await getPartnerVenueIdsSlaOverdueFromCatalog(prisma);
    if (slaHiddenIds.length > 0) {
      where.id = { notIn: slaHiddenIds };
    }

    const [venues, total] = await Promise.all([
      prisma.partnerVenue.findMany({
        where,
        orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }],
        skip,
        take: limit,
        include: {
          partner: {
            select: {
              id: true,
              name: true,
              description: true,
              website: true,
              logoUrl: true,
            },
          },
        },
      }),
      prisma.partnerVenue.count({ where }),
    ]);

    const venuesHydrated = await withPrismaRetry(() =>
      mergeParticipationModesOnVenues(prisma, venues)
    );

    const venueIds = venuesHydrated.map((v) => v.id);
    const countsByVenue =
      venueIds.length > 0 ? await countOccupyingByVenueIdsRaw(prisma, venueIds) : new Map<string, number>();

    const venuesWithSlots = venuesHydrated.map((v) => {
      const cap = v.remainingSlots;
      const used = countsByVenue.get(v.id) ?? 0;
      const applicationSlotsCapped = partnerVenueHasApplicationSlotCap(cap);
      const remainingApplicationSlots = applicationSlotsCapped ? Math.max(0, cap - used) : null;
      return { ...v, applicationsCount: used, applicationSlotsCapped, remainingApplicationSlots };
    });

    return NextResponse.json({
      venues: venuesWithSlots,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    });
  } catch (e) {
    console.error("[partner-venues/public] GET error:", e);
    return NextResponse.json({ error: "Ошибка загрузки площадок" }, { status: 500 });
  }
}
