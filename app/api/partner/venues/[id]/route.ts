import { NextRequest, NextResponse } from "next/server";
import { prisma, withPrismaRetry } from "@/lib/prisma";
import { ensurePartner } from "@/lib/partner-auth";
import { Prisma } from "@prisma/client";
import { PrismaClientValidationError } from "@prisma/client/runtime/library";
import { deletePartnerVenueBannerStoredFile } from "@/lib/partner-venue-banner-file";
import { isValidPartnerVenueServicePair } from "@/lib/partner-venue-service-taxonomy";

type PatchBody = {
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
  isActive?: unknown;
  remainingSlots?: unknown;
  serviceCategoryCode?: unknown;
  serviceCode?: unknown;
};

function optionalString(v: unknown): string | null | undefined {
  if (v === undefined) return undefined;
  if (v === null) return null;
  if (typeof v !== "string") return undefined;
  const t = v.trim();
  return t.length ? t : null;
}

async function getVenueForPartner(venueId: string, partnerId: string) {
  return withPrismaRetry(() =>
    prisma.partnerVenue.findFirst({
      where: { id: venueId, partnerId },
    })
  );
}

/**
 * GET /api/partner/venues/[id]
 */
export async function GET(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const auth = await ensurePartner();
  if (auth.error) return auth.error;
  const { id: partnerId } = auth.partner!;

  const { id } = await context.params;
  if (!id) {
    return NextResponse.json({ error: "Не указан id" }, { status: 400 });
  }

  try {
    const venue = await getVenueForPartner(id, partnerId);
    if (!venue) {
      return NextResponse.json({ error: "Площадка не найдена" }, { status: 404 });
    }
    return NextResponse.json({ venue });
  } catch (e) {
    console.error("[partner/venues/[id] GET]", e);
    return NextResponse.json({ error: "Не удалось загрузить площадку" }, { status: 500 });
  }
}

/**
 * PATCH /api/partner/venues/[id]
 */
export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const auth = await ensurePartner();
  if (auth.error) return auth.error;
  const { id: partnerId } = auth.partner!;

  const { id } = await context.params;
  if (!id) {
    return NextResponse.json({ error: "Не указан id" }, { status: 400 });
  }

  let body: PatchBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Неверный JSON" }, { status: 400 });
  }

  const existing = await getVenueForPartner(id, partnerId);
  if (!existing) {
    return NextResponse.json({ error: "Площадка не найдена" }, { status: 404 });
  }

  if ("name" in body) {
    if (typeof body.name !== "string") {
      return NextResponse.json({ error: "Некорректное название" }, { status: 400 });
    }
    const name = body.name.trim();
    if (!name) {
      return NextResponse.json({ error: "Укажите название" }, { status: 400 });
    }
  }

  const data: Prisma.PartnerVenueUpdateInput = {};
  if ("name" in body && typeof body.name === "string") {
    data.name = body.name.trim();
  }
  if ("description" in body) data.description = optionalString(body.description) ?? null;
  if ("address" in body) data.address = optionalString(body.address) ?? null;
  if ("city" in body) data.city = optionalString(body.city) ?? null;
  if ("website" in body) data.website = optionalString(body.website) ?? null;
  if ("phone" in body) data.phone = optionalString(body.phone) ?? null;
  if ("email" in body) data.email = optionalString(body.email) ?? null;
  if ("bannerUrl" in body) {
    const oldUrl = existing.bannerUrl ?? null;
    if (body.bannerUrl === null) {
      await deletePartnerVenueBannerStoredFile(oldUrl);
      data.bannerUrl = null;
    } else if (typeof body.bannerUrl === "string") {
      const trimmed = body.bannerUrl.trim() || null;
      if (trimmed !== oldUrl) {
        await deletePartnerVenueBannerStoredFile(oldUrl);
      }
      data.bannerUrl = trimmed;
    }
  }
  if ("bannerAlt" in body) data.bannerAlt = optionalString(body.bannerAlt) ?? null;
  if ("promoCode" in body) data.promoCode = optionalString(body.promoCode) ?? null;
  if ("promoLabel" in body) data.promoLabel = optionalString(body.promoLabel) ?? null;
  if ("conditions" in body) data.conditions = optionalString(body.conditions) ?? null;
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
  if ("isActive" in body) {
    if (typeof body.isActive === "boolean") {
      data.isActive = body.isActive;
    } else if (body.isActive === "true" || body.isActive === "false") {
      data.isActive = body.isActive === "true";
    } else {
      return NextResponse.json({ error: "Некорректное значение поля «Площадка активна»" }, { status: 400 });
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

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ venue: existing });
  }

  try {
    const venue = await withPrismaRetry(() =>
      prisma.partnerVenue.update({
        where: { id },
        data,
      })
    );
    return NextResponse.json({ venue });
  } catch (e) {
    console.error("[partner/venues/[id] PATCH]", e);
    if (e instanceof Prisma.PrismaClientKnownRequestError) {
      return NextResponse.json({ error: "Ошибка сохранения площадки" }, { status: 400 });
    }
    if (e instanceof PrismaClientValidationError) {
      return NextResponse.json(
        {
          error:
            "Клиент Prisma устарел относительно схемы. Выполните «npx prisma generate» и перезапустите dev-сервер (npm run dev).",
        },
        { status: 500 }
      );
    }
    return NextResponse.json({ error: "Не удалось обновить площадку" }, { status: 500 });
  }
}

/**
 * DELETE /api/partner/venues/[id]
 */
export async function DELETE(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const auth = await ensurePartner();
  if (auth.error) return auth.error;
  const { id: partnerId } = auth.partner!;

  const { id } = await context.params;
  if (!id) {
    return NextResponse.json({ error: "Не указан id" }, { status: 400 });
  }

  const existing = await getVenueForPartner(id, partnerId);
  if (!existing) {
    return NextResponse.json({ error: "Площадка не найдена" }, { status: 404 });
  }

  try {
    await deletePartnerVenueBannerStoredFile(existing.bannerUrl);
    await withPrismaRetry(() => prisma.partnerVenue.delete({ where: { id } }));
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[partner/venues/[id] DELETE]", e);
    return NextResponse.json({ error: "Не удалось удалить площадку" }, { status: 500 });
  }
}
