import { NextRequest, NextResponse } from "next/server";
import { prisma, withPrismaRetry } from "@/lib/prisma";
import { ensureSuperAdmin } from "@/lib/admin-auth";
import { Prisma } from "@prisma/client";

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
    return "Некорректные данные для сохранения.";
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

type Body = {
  name?: string;
  description?: string;
  website?: string;
  inn?: string;
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
    const partner = await prisma.partner.findUnique({
      where: { id },
      include: {
        linkedUser: { select: partnerLinkedUserSelect },
        cabinetUser: { select: partnerLinkedUserSelect },
      },
    });
    if (!partner) {
      return NextResponse.json({ error: "Партнёр не найден" }, { status: 404 });
    }
    return NextResponse.json({ partner });
  } catch (e) {
    console.error("[admin/partners/[id] GET]", e);
    return NextResponse.json({ error: "Ошибка загрузки партнёра" }, { status: 500 });
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
  if (body.inn !== undefined) data.inn = str(body.inn);
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

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "Нет полей для обновления" }, { status: 400 });
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
    return NextResponse.json({ partner });
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
