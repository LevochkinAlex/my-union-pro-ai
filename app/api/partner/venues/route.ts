import { NextRequest, NextResponse } from "next/server";
import { prisma, withPrismaRetry } from "@/lib/prisma";
import { ensurePartner } from "@/lib/partner-auth";
import { Prisma } from "@prisma/client";

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
      })
    );
    return NextResponse.json({ venues });
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

  try {
    const venue = await withPrismaRetry(() => prisma.partnerVenue.create({ data }));
    return NextResponse.json({ venue });
  } catch (e) {
    console.error("[partner/venues POST]", e);
    if (e instanceof Prisma.PrismaClientKnownRequestError) {
      return NextResponse.json({ error: "Ошибка сохранения площадки" }, { status: 400 });
    }
    return NextResponse.json({ error: "Не удалось создать площадку" }, { status: 500 });
  }
}
