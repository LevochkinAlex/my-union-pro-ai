import { NextRequest, NextResponse } from "next/server";
import { prisma, withPrismaRetry } from "@/lib/prisma";
import { ensureSuperAdmin } from "@/lib/admin-auth";
import type { PartnerModerationStatus } from "@prisma/client";
import { Prisma } from "@prisma/client";
import { deletePartnerLogoStoredFile } from "@/lib/partner-logo-file";
import {
  partnerModerationIsApprovedWithoutTimestamp,
  partnerModerationShouldStayDraft,
  partnerModerationStatusNeedsAdminReview,
} from "@/lib/partner-moderation-status";

/** Не кэшировать ответ: статус может смениться при открытии формы */
export const dynamic = "force-dynamic";

function prismaErrorToMessage(e: unknown): string {
  if (e instanceof Prisma.PrismaClientKnownRequestError) {
    if (e.code === "P2025") {
      return "Партнёр не найден.";
    }
    if (e.code === "P2003") {
      return "Указан несуществующий пользователь.";
    }
    if (e.code === "P2002") {
      return "Запись с такими уникальными данными уже существует.";
    }
    return `Ошибка БД (${e.code}). ${e.meta ? JSON.stringify(e.meta) : ""}`.trim();
  }
  if (e instanceof Prisma.PrismaClientValidationError) {
    const msg = e.message;
    const staleClientHint =
      /Unknown argument [`']?(ogrn|kpp|logoUrl|moderationStatus)|Unknown field [`']?(ogrn|kpp|logoUrl|moderationStatus)/i.test(
        msg
      )
        ? " Частая причина — устаревший Prisma Client после обновления схемы: выполните npx prisma generate и перезапустите dev-сервер."
        : "";
    if (process.env.NODE_ENV === "development") {
      return `Некорректные данные для сохранения.${staleClientHint}\n${msg}`;
    }
    return `Некорректные данные для сохранения.${staleClientHint}`;
  }
  if (e instanceof Error) {
    if (process.env.NODE_ENV === "development") {
      return e.message;
    }
  }
  return "Ошибка сохранения партнёра";
}

const partnerLinkedUserSelect = { id: true, email: true } as const;

async function resolveLinkedUserId(raw: unknown): Promise<string | null | undefined> {
  if (raw === undefined) return undefined;
  if (raw === null || raw === "") return null;
  if (typeof raw !== "string") {
    throw new Error("linkedUserId должен быть строкой или null");
  }
  const id = raw.trim();
  if (!id) return null;
  const user = await prisma.user.findUnique({ where: { id }, select: { id: true } });
  if (!user) {
    throw new Error("Пользователь с таким ID не найден");
  }
  return id;
}

/** Явный список: в dev-сборке Next/Turbopack `Object.values(PartnerModerationStatus)` из @prisma/client может быть undefined */
const PARTNER_MODERATION_STATUS_VALUES = [
  "DRAFT",
  "NEW",
  "UNDER_REVIEW",
  "APPROVED",
  "BLOCKED",
  "RETURNED",
] as const satisfies readonly PartnerModerationStatus[];

const MODERATION_STATUSES = new Set<string>(PARTNER_MODERATION_STATUS_VALUES);

type PartnerModerationRow = { moderationStatus: string; moderationApprovedAt: Date | null };

/** SQL: поле есть в БД, но сгенерированный Client может быть старым — Prisma.update тогда падает с Unknown argument */
async function setPartnerModerationStatusInDb(partnerId: string, nextStatus: string): Promise<void> {
  if (!MODERATION_STATUSES.has(nextStatus)) {
    throw new Error("Некорректный moderationStatus");
  }
  if (nextStatus === "APPROVED") {
    await prisma.$executeRawUnsafe(
      `UPDATE "Partner" SET "moderationStatus" = $1::"PartnerModerationStatus", "moderationApprovedAt" = NOW(), "updatedAt" = NOW() WHERE "id" = $2`,
      nextStatus,
      partnerId
    );
  } else {
    await prisma.$executeRawUnsafe(
      `UPDATE "Partner" SET "moderationStatus" = $1::"PartnerModerationStatus", "moderationApprovedAt" = NULL, "updatedAt" = NOW() WHERE "id" = $2`,
      nextStatus,
      partnerId
    );
  }
}

async function readPartnerModerationRowFromDb(partnerId: string): Promise<PartnerModerationRow | null> {
  const rows = await prisma.$queryRawUnsafe<PartnerModerationRow[]>(
    `SELECT "moderationStatus"::text AS "moderationStatus", "moderationApprovedAt" FROM "Partner" WHERE "id" = $1 LIMIT 1`,
    partnerId
  );
  return rows[0] ?? null;
}

function partnerJsonWithModerationRow<T extends { id: string }>(
  partner: T,
  row: PartnerModerationRow | null
): T & { moderationStatus: string; moderationApprovedAt: Date | null } {
  if (!row) {
    return { ...partner, moderationStatus: "DRAFT", moderationApprovedAt: null };
  }
  return { ...partner, moderationStatus: row.moderationStatus, moderationApprovedAt: row.moderationApprovedAt };
}

type Body = {
  name?: string;
  description?: string;
  website?: string;
  logoUrl?: string | null;
  inn?: string;
  ogrn?: string;
  kpp?: string;
  address?: string;
  phone?: string;
  email?: string;
  contactLastName?: string;
  contactFirstName?: string;
  contactMiddleName?: string;
  contactEmail?: string;
  contactPhone?: string;
  contactJobTitle?: string;
  isActive?: boolean;
  linkedUserId?: string | null;
  moderationStatus?: string;
};

/**
 * GET /api/admin/partners/[id]
 */
export async function GET(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const superResult = await ensureSuperAdmin();
  if (superResult.error) return superResult.error;

  const { id } = await context.params;
  if (!id) {
    return NextResponse.json({ error: "Не указан id" }, { status: 400 });
  }

  try {
    let partner = await prisma.partner.findUnique({
      where: { id },
      include: {
        linkedUser: { select: partnerLinkedUserSelect },
        cabinetUser: { select: partnerLinkedUserSelect },
      },
    });
    if (!partner) {
      return NextResponse.json({ error: "Партнёр не найден" }, { status: 404 });
    }

    await prisma.partner.updateMany({
      where: { id, adminPartnerCardFirstSeenAt: null },
      data: { adminPartnerCardFirstSeenAt: new Date() },
    });
    partner =
      (await prisma.partner.findUnique({
        where: { id },
        include: {
          linkedUser: { select: partnerLinkedUserSelect },
          cabinetUser: { select: partnerLinkedUserSelect },
        },
      })) ?? partner;

    const rowBefore = await readPartnerModerationRowFromDb(id).catch(() => null);
    const ms0 =
      rowBefore?.moderationStatus ??
      (partner.moderationStatus as string | null | undefined) ??
      "NEW";
    const approvedAt0 = rowBefore?.moderationApprovedAt ?? null;
    const draftLocked = partnerModerationShouldStayDraft({
      moderationStatus: ms0,
      cabinetInviteSentAt: partner.cabinetInviteSentAt,
      cabinetInviteFirstOpenAt: partner.cabinetInviteFirstOpenAt,
      adminPartnerCardFirstSeenAt: partner.adminPartnerCardFirstSeenAt,
    });
    const needsOpenReview =
      !draftLocked &&
      (partnerModerationStatusNeedsAdminReview(ms0) ||
        partnerModerationIsApprovedWithoutTimestamp(ms0, approvedAt0));

    // Админ открыл страницу редактирования → «На проверке» (дублируется PATCH на клиенте при необходимости)
    if (needsOpenReview) {
      try {
        await setPartnerModerationStatusInDb(id, "UNDER_REVIEW");
        const refreshed = await prisma.partner.findUnique({
          where: { id },
          include: {
            linkedUser: { select: partnerLinkedUserSelect },
            cabinetUser: { select: partnerLinkedUserSelect },
          },
        });
        if (refreshed) partner = refreshed;
      } catch (transitionErr) {
        console.error("[admin/partners/[id] GET] →UNDER_REVIEW failed:", transitionErr);
      }
    }
    const row = await readPartnerModerationRowFromDb(id).catch(() => null);
    const partnerOut = partnerJsonWithModerationRow(partner, row);
    return NextResponse.json(
      { partner: partnerOut },
      { headers: { "Cache-Control": "private, no-store, max-age=0, must-revalidate" } }
    );
  } catch (e) {
    console.error("[admin/partners/[id] GET]", e);
    const detail = e instanceof Error ? e.message : String(e);
    const hint =
      /moderationStatus|moderationApprovedAt|cabinetInviteSentAt|cabinetInviteFirstOpenAt|adminPartnerCardFirstSeenAt|PartnerModerationStatus|P2022|does not exist/i.test(
        detail
      )
        ? " Выполните на сервере: npx prisma migrate deploy"
        : "";
    return NextResponse.json(
      {
        error: `Ошибка загрузки партнёра.${hint}`,
        ...(process.env.NODE_ENV === "development" ? { detail } : {}),
      },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/admin/partners/[id]
 */
export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const superResult = await ensureSuperAdmin();
  if (superResult.error) return superResult.error;

  const { id } = await context.params;
  if (!id) {
    return NextResponse.json({ error: "Не указан id" }, { status: 400 });
  }

  let body: Body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Неверный JSON" }, { status: 400 });
  }

  const str = (v: unknown) => (typeof v === "string" ? v.trim() || null : null);
  const bool = (v: unknown) => (typeof v === "boolean" ? v : undefined);

  const name = typeof body.name === "string" ? body.name.trim() : undefined;
  if (name !== undefined && !name) {
    return NextResponse.json({ error: "Укажите название партнёра" }, { status: 400 });
  }

  let linkedUserIdResolved: string | null | undefined;
  try {
    linkedUserIdResolved = await resolveLinkedUserId(body.linkedUserId);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Некорректный linkedUserId" },
      { status: 400 }
    );
  }

  const data: Prisma.PartnerUpdateInput = {};
  if (name !== undefined) data.name = name;
  if (body.description !== undefined) data.description = str(body.description);
  if (body.website !== undefined) data.website = str(body.website);
  if (body.logoUrl !== undefined) {
    const existing = await prisma.partner.findUnique({
      where: { id },
      select: { logoUrl: true },
    });
    const oldUrl = existing?.logoUrl ?? null;

    if (body.logoUrl === null) {
      await deletePartnerLogoStoredFile(oldUrl);
      data.logoUrl = null;
    } else if (typeof body.logoUrl === "string") {
      const trimmed = body.logoUrl.trim() || null;
      if (trimmed !== oldUrl) {
        await deletePartnerLogoStoredFile(oldUrl);
      }
      data.logoUrl = trimmed;
    }
  }
  if (body.inn !== undefined) data.inn = str(body.inn);
  if (body.ogrn !== undefined) data.ogrn = str(body.ogrn);
  if (body.kpp !== undefined) data.kpp = str(body.kpp);
  if (body.address !== undefined) data.address = str(body.address);
  if (body.phone !== undefined) data.phone = str(body.phone);
  if (body.email !== undefined) data.email = str(body.email);
  if (body.contactLastName !== undefined) data.contactLastName = str(body.contactLastName);
  if (body.contactFirstName !== undefined) data.contactFirstName = str(body.contactFirstName);
  if (body.contactMiddleName !== undefined) data.contactMiddleName = str(body.contactMiddleName);
  if (body.contactEmail !== undefined) data.contactEmail = str(body.contactEmail);
  if (body.contactPhone !== undefined) data.contactPhone = str(body.contactPhone);
  if (body.contactJobTitle !== undefined) data.contactJobTitle = str(body.contactJobTitle);
  if (body.isActive !== undefined) {
    const b = bool(body.isActive);
    if (b !== undefined) data.isActive = b;
  }
  if (linkedUserIdResolved !== undefined) {
    data.linkedUser = linkedUserIdResolved
      ? { connect: { id: linkedUserIdResolved } }
      : { disconnect: true };
  }

  let moderationAppliedViaRaw = false;
  if (body.moderationStatus !== undefined) {
    if (typeof body.moderationStatus !== "string" || !MODERATION_STATUSES.has(body.moderationStatus)) {
      return NextResponse.json({ error: "Некорректный moderationStatus" }, { status: 400 });
    }

    let applyModeration = true;
    if (body.moderationStatus === "UNDER_REVIEW") {
      const gatePartner = await prisma.partner.findUnique({
        where: { id },
        select: {
          moderationStatus: true,
          cabinetInviteSentAt: true,
          cabinetInviteFirstOpenAt: true,
          adminPartnerCardFirstSeenAt: true,
        },
      });
      if (gatePartner && partnerModerationShouldStayDraft(gatePartner)) {
        applyModeration = false;
      }
    }

    if (applyModeration) {
      try {
        await setPartnerModerationStatusInDb(id, body.moderationStatus);
        moderationAppliedViaRaw = true;
      } catch (e) {
        console.error("[admin/partners/[id] PATCH] moderationStatus SQL:", e);
        return NextResponse.json({ error: prismaErrorToMessage(e) }, { status: 500 });
      }
    }
  }

  if (Object.keys(data).length === 0) {
    if (!moderationAppliedViaRaw && body.moderationStatus === undefined) {
      return NextResponse.json({ error: "Нет полей для обновления" }, { status: 400 });
    }
    const partnerOnly = await prisma.partner.findUnique({
      where: { id },
      include: {
        linkedUser: { select: partnerLinkedUserSelect },
        cabinetUser: { select: partnerLinkedUserSelect },
      },
    });
    if (!partnerOnly) {
      return NextResponse.json({ error: "Партнёр не найден" }, { status: 404 });
    }
    const rowOnly = await readPartnerModerationRowFromDb(id).catch(() => null);
    return NextResponse.json({
      partner: partnerJsonWithModerationRow(partnerOnly, rowOnly),
    });
  }

  try {
    const partner = await withPrismaRetry(() =>
      prisma.partner.update({
        where: { id },
        data,
        include: {
          linkedUser: { select: partnerLinkedUserSelect },
          cabinetUser: { select: partnerLinkedUserSelect },
        },
      })
    );
    const rowAfter = await readPartnerModerationRowFromDb(id).catch(() => null);
    return NextResponse.json({
      partner: partnerJsonWithModerationRow(partner, rowAfter),
    });
  } catch (e) {
    console.error("[admin/partners/[id] PATCH]", e);
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2025") {
      return NextResponse.json({ error: "Партнёр не найден" }, { status: 404 });
    }
    return NextResponse.json({ error: prismaErrorToMessage(e) }, { status: 500 });
  }
}

/**
 * DELETE /api/admin/partners/[id]
 * Полное удаление карточки партнёра: площадки (PartnerVenue), учётная запись кабинета (User с partnerRecordId),
 * затем запись Partner. Связанный только через linkedUserId пользователь не удаляется.
 */
export async function DELETE(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const superResult = await ensureSuperAdmin();
  if (superResult.error) return superResult.error;

  const { id: partnerId } = await context.params;
  if (!partnerId) {
    return NextResponse.json({ error: "Не указан id" }, { status: 400 });
  }

  const partner = await prisma.partner.findUnique({
    where: { id: partnerId },
    select: { id: true },
  });
  if (!partner) {
    return NextResponse.json({ error: "Партнёр не найден" }, { status: 404 });
  }

  try {
    await withPrismaRetry(() =>
      prisma.$transaction(async (tx) => {
        await tx.partnerVenue.deleteMany({ where: { partnerId } });
        await tx.user.deleteMany({ where: { partnerRecordId: partnerId } });
        await tx.partner.delete({ where: { id: partnerId } });
      })
    );
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[admin/partners/[id] DELETE]", e);
    const msg =
      e instanceof Prisma.PrismaClientKnownRequestError
        ? `Ошибка БД (${e.code}). Возможно, у пользователя кабинета есть связанные данные, которые нужно удалить вручную.`
        : prismaErrorToMessage(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
