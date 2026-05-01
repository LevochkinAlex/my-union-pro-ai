import { NextRequest, NextResponse } from "next/server";
import { prisma, withPrismaRetry } from "@/lib/prisma";
import { ensurePartner } from "@/lib/partner-auth";
import { Prisma } from "@prisma/client";
import { isValidPartnerVenueServicePair } from "@/lib/partner-venue-service-taxonomy";
import {
  isPartnerVenueParticipationValue,
  type PartnerVenueParticipationValue,
} from "@/lib/partner-venue-participation";
import {
  mergeParticipationModeOnVenue,
  mergeParticipationModesOnVenues,
  setPartnerVenueParticipationModeRaw,
} from "@/lib/partner-venue-participation-db";
import { partnerVenuePartnerApiSelect } from "@/lib/partner-venue-partner-api-select";

type CreateBody = {
  name?: unknown;
  description?: unknown;
  address?: unknown;
  city?: unknown;
  website?: unknown;
  phone?: unknown;
  email?: unknown;
  bannerUrl?: unknown;
  bannerAlt?: unknown;
  promoCode?: unknown;
  promoLabel?: unknown;
  conditions?: unknown;
  eventAt?: unknown;
  remainingSlots?: unknown;
  serviceCategoryCode?: unknown;
  serviceCode?: unknown;
  participationMode?: unknown;
};

function optionalString(v: unknown): string | null | undefined {
  if (v === undefined) return undefined;
  if (v === null) return null;
  if (typeof v !== "string") return undefined;
  const t = v.trim();
  return t.length ? t : null;
}

function assignOptionalString(
  target: Prisma.PartnerVenueCreateInput,
  key: keyof Prisma.PartnerVenueCreateInput,
  v: unknown
) {
  const parsed = optionalString(v);
  if (parsed !== undefined) {
    (target as Record<string, unknown>)[key] = parsed;
  }
}

/**
 * GET /api/partner/venues — список площадок текущего партнёра
 */
export async function GET() {
  const auth = await ensurePartner();
  if (auth.error) return auth.error;
  const { id: partnerId } = auth.partner!;

  try {
    const venues = await withPrismaRetry(() =>
      prisma.partnerVenue.findMany({
        where: { partnerId },
        orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }],
        select: partnerVenuePartnerApiSelect,
      })
    );
    const hydrated = await withPrismaRetry(() =>
      mergeParticipationModesOnVenues(prisma, venues)
    );
    return NextResponse.json({ venues: hydrated });
  } catch (e) {
    console.error("[partner/venues GET]", e);
    return NextResponse.json({ error: "Не удалось загрузить площадки" }, { status: 500 });
  }
}

/**
 * POST /api/partner/venues — создать площадку
 */
export async function POST(request: NextRequest) {
  const auth = await ensurePartner();
  if (auth.error) return auth.error;
  const { id: partnerId } = auth.partner!;

  let body: CreateBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Неверный JSON" }, { status: 400 });
  }

  const nameRaw = body.name;
  const name = typeof nameRaw === "string" ? nameRaw.trim() : "";
  if (!name) {
    return NextResponse.json({ error: "Укажите название" }, { status: 400 });
  }

  const data: Prisma.PartnerVenueCreateInput = {
    partner: { connect: { id: partnerId } },
    name,
  };
  assignOptionalString(data, "description", body.description);
  assignOptionalString(data, "address", body.address);
  assignOptionalString(data, "city", body.city);
  assignOptionalString(data, "website", body.website);
  assignOptionalString(data, "phone", body.phone);
  assignOptionalString(data, "email", body.email);
  assignOptionalString(data, "bannerUrl", body.bannerUrl);
  assignOptionalString(data, "bannerAlt", body.bannerAlt);
  assignOptionalString(data, "promoCode", body.promoCode);
  assignOptionalString(data, "promoLabel", body.promoLabel);
  assignOptionalString(data, "conditions", body.conditions);

  if ("eventAt" in body) {
    if (body.eventAt === null || body.eventAt === "") {
      data.eventAt = null;
    } else if (typeof body.eventAt === "string") {
      const trimmed = body.eventAt.trim();
      if (!trimmed) {
        data.eventAt = null;
      } else {
        const d = new Date(trimmed);
        if (Number.isNaN(d.getTime())) {
          return NextResponse.json({ error: "Некорректная дата и время" }, { status: 400 });
        }
        data.eventAt = d;
      }
    } else {
      return NextResponse.json({ error: "Некорректная дата и время" }, { status: 400 });
    }
  }

  if ("remainingSlots" in body) {
    if (body.remainingSlots === null || body.remainingSlots === "") {
      data.remainingSlots = null;
    } else if (typeof body.remainingSlots === "number" && Number.isInteger(body.remainingSlots)) {
      if (body.remainingSlots < 1 || body.remainingSlots > 999) {
        return NextResponse.json({ error: "«Осталось мест»: укажите число от 001 до 999 или неограничено" }, { status: 400 });
      }
      data.remainingSlots = body.remainingSlots;
    } else if (typeof body.remainingSlots === "string") {
      const t = body.remainingSlots.trim();
      if (!t) {
        data.remainingSlots = null;
      } else {
        const n = parseInt(t, 10);
        if (!Number.isFinite(n) || n < 1 || n > 999) {
          return NextResponse.json({ error: "«Осталось мест»: укажите число от 001 до 999 или неограничено" }, { status: 400 });
        }
        data.remainingSlots = n;
      }
    } else {
      return NextResponse.json({ error: "Некорректное значение поля «Осталось мест»" }, { status: 400 });
    }
  }

  if ("serviceCategoryCode" in body || "serviceCode" in body) {
    if (!("serviceCategoryCode" in body) || !("serviceCode" in body)) {
      return NextResponse.json(
        { error: "Поля serviceCategoryCode и serviceCode нужно передавать вместе" },
        { status: 400 }
      );
    }
    const norm = (v: unknown): string | null | "bad" => {
      if (v === null || v === undefined) return null;
      if (typeof v !== "string") return "bad";
      const t = v.trim();
      return t.length ? t : null;
    };
    const cat = norm(body.serviceCategoryCode);
    const srv = norm(body.serviceCode);
    if (cat === "bad" || srv === "bad") {
      return NextResponse.json({ error: "Некорректная категория или услуга" }, { status: 400 });
    }
    if (!isValidPartnerVenueServicePair(cat, srv)) {
      return NextResponse.json(
        { error: "Выберите корректную пару «категория услуг» и «услуга» или очистите оба поля" },
        { status: 400 }
      );
    }
    data.serviceCategoryCode = cat;
    data.serviceCode = srv;
  }

  let participationModeCreate: PartnerVenueParticipationValue | undefined;
  if ("participationMode" in body) {
    const v = body.participationMode;
    if (v === null || v === undefined || v === "") {
      participationModeCreate = "PROMO_CODE";
    } else if (typeof v === "string" && isPartnerVenueParticipationValue(v.trim())) {
      participationModeCreate = v.trim() as PartnerVenueParticipationValue;
    } else {
      return NextResponse.json(
        { error: "Некорректное значение поля «Участие»: выберите «По промокоду» или «По заявке»" },
        { status: 400 }
      );
    }
  }

  try {
    const venue = await withPrismaRetry(() => prisma.partnerVenue.create({ data }));
    if (participationModeCreate !== undefined) {
      await withPrismaRetry(() =>
        setPartnerVenueParticipationModeRaw(prisma, venue.id, participationModeCreate)
      );
    }
    const venueOut = await mergeParticipationModeOnVenue(prisma, venue);
    return NextResponse.json({ venue: venueOut });
  } catch (e) {
    console.error("[partner/venues POST]", e);
    if (e instanceof Prisma.PrismaClientKnownRequestError) {
      return NextResponse.json({ error: "Ошибка сохранения площадки" }, { status: 400 });
    }
    return NextResponse.json({ error: "Не удалось создать площадку" }, { status: 500 });
  }
}
