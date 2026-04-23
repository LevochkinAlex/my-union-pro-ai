import { NextRequest, NextResponse } from "next/server";
import { prisma, withPrismaRetry } from "@/lib/prisma";
import { ensureSuperAdmin } from "@/lib/admin-auth";
import { Prisma } from "@prisma/client";
import {
  arePartnerRequisitesValid,
  isLooseEmailValid,
  isPartnerInnComplete,
} from "@/lib/partner-requisites";

function prismaErrorToMessage(e: unknown): string {
  if (e instanceof Prisma.PrismaClientKnownRequestError) {
    if (e.code === "P2021") {
      return "Таблица Partner в базе не создана. Выполните в проекте: npx prisma db push (или prisma migrate deploy).";
    }
    if (e.code === "P2002") {
      return "Запись с такими уникальными данными уже существует.";
    }
    return `Ошибка БД (${e.code}). ${e.meta ? JSON.stringify(e.meta) : ""}`.trim();
  }
  if (e instanceof Prisma.PrismaClientValidationError) {
    const msg = e.message;
    const staleClientHint =
      /Unknown argument [`']?(ogrn|kpp)|Unknown field [`']?(ogrn|kpp)/i.test(msg)
        ? " Частая причина — устаревший Prisma Client после обновления схемы: выполните npx prisma generate и перезапустите dev-сервер."
        : "";
    if (process.env.NODE_ENV === "development") {
      return `Некорректные данные для сохранения.${staleClientHint}\n${msg}`;
    }
    return `Некорректные данные для сохранения.${staleClientHint}`;
  }
  if (e instanceof Prisma.PrismaClientInitializationError || e instanceof Prisma.PrismaClientRustPanicError) {
    return "Нет подключения к базе данных. Проверьте DATABASE_URL и доступность сервера БД.";
  }
  if (e instanceof Error) {
    const msg = e.message;
    if (/closed|connection|ECONNREFUSED|timeout/i.test(msg)) {
      return "Соединение с базой данных разорвано. Повторите попытку.";
    }
    if (process.env.NODE_ENV === "development") {
      return msg;
    }
  }
  return "Ошибка сохранения партнёра";
}

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

/**
 * GET /api/admin/partners?search=...&page=1&limit=20
 */
export async function GET(request: NextRequest) {
  const superResult = await ensureSuperAdmin();
  if (superResult.error) return superResult.error;

  const { searchParams } = new URL(request.url);
  const search = searchParams.get("search")?.trim() || "";
  const page = Math.max(1, parseInt(searchParams.get("page") || String(DEFAULT_PAGE), 10));
  const limit = Math.min(
    MAX_LIMIT,
    Math.max(1, parseInt(searchParams.get("limit") || String(DEFAULT_LIMIT), 10))
  );
  const skip = (page - 1) * limit;

  const searchWhere: Prisma.PartnerWhereInput | undefined = search
    ? {
        OR: [
          { name: { contains: search, mode: "insensitive" } },
          { inn: { contains: search, mode: "insensitive" } },
          { ogrn: { contains: search, mode: "insensitive" } },
          { kpp: { contains: search, mode: "insensitive" } },
          { email: { contains: search, mode: "insensitive" } },
          { phone: { contains: search, mode: "insensitive" } },
          { contactEmail: { contains: search, mode: "insensitive" } },
          { contactPhone: { contains: search, mode: "insensitive" } },
          { contactLastName: { contains: search, mode: "insensitive" } },
          { contactFirstName: { contains: search, mode: "insensitive" } },
          { linkedUser: { email: { contains: search, mode: "insensitive" } } },
          { cabinetUser: { email: { contains: search, mode: "insensitive" } } },
        ],
      }
    : undefined;

  try {
    const [partners, total] = await Promise.all([
      prisma.partner.findMany({
        where: searchWhere,
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
        include: {
          linkedUser: { select: { id: true, email: true } },
          cabinetUser: { select: { id: true, email: true } },
        },
      }),
      prisma.partner.count({ where: searchWhere }),
    ]);

    const totalPages = Math.max(1, Math.ceil(total / limit));

    return NextResponse.json({
      partners,
      total,
      page,
      totalPages,
      limit,
    });
  } catch (e) {
    console.error("[admin/partners GET]", e);
    return NextResponse.json({ error: "Ошибка загрузки партнёров" }, { status: 500 });
  }
}

type Body = {
  name?: string;
  description?: string;
  website?: string;
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
};

/**
 * POST /api/admin/partners
 */
export async function POST(request: NextRequest) {
  const superResult = await ensureSuperAdmin();
  if (superResult.error) return superResult.error;

  let body: Body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Неверный JSON" }, { status: 400 });
  }

  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (!name) {
    return NextResponse.json({ error: "Укажите название партнёра" }, { status: 400 });
  }

  const innRaw = typeof body.inn === "string" ? body.inn.replace(/\D/g, "") : "";
  const ogrnRaw = typeof body.ogrn === "string" ? body.ogrn.replace(/\D/g, "") : "";
  const kppRaw = typeof body.kpp === "string" ? body.kpp.replace(/\D/g, "") : "";
  if (!isPartnerInnComplete(innRaw) || !arePartnerRequisitesValid(innRaw, ogrnRaw, kppRaw)) {
    return NextResponse.json(
      {
        error:
          "Укажите ИНН (10 или 12 цифр). ОГРН и КПП — либо пусто, либо полная длина (ОГРН 13/15, КПП 9 цифр).",
      },
      { status: 400 }
    );
  }

  const emailIn = typeof body.email === "string" ? body.email.trim() : "";
  if (!isLooseEmailValid(emailIn)) {
    return NextResponse.json({ error: "Укажите корректный email (реквизиты юр. лица)" }, { status: 400 });
  }
  const emailNormalized = emailIn.toLowerCase();

  const str = (v: unknown) => (typeof v === "string" ? v.trim() || null : null);
  const bool = (v: unknown) => (typeof v === "boolean" ? v : true);

  let linkedUserId: string | null | undefined;
  if (body.linkedUserId !== undefined && body.linkedUserId !== null && body.linkedUserId !== "") {
    if (typeof body.linkedUserId !== "string") {
      return NextResponse.json({ error: "Некорректный linkedUserId" }, { status: 400 });
    }
    const uid = body.linkedUserId.trim();
    if (uid) {
      const u = await prisma.user.findUnique({ where: { id: uid }, select: { id: true } });
      if (!u) {
        return NextResponse.json({ error: "Пользователь с таким ID не найден" }, { status: 400 });
      }
      linkedUserId = uid;
    }
  } else if (body.linkedUserId === null || body.linkedUserId === "") {
    linkedUserId = undefined;
  }

  try {
    const partner = await withPrismaRetry(() =>
      prisma.partner.create({
        data: {
          name,
          description: str(body.description),
          website: str(body.website),
          inn: innRaw,
          ogrn: ogrnRaw || null,
          kpp: kppRaw || null,
          address: str(body.address),
          phone: str(body.phone),
          email: emailNormalized,
          contactLastName: str(body.contactLastName),
          contactFirstName: str(body.contactFirstName),
          contactMiddleName: str(body.contactMiddleName),
          contactEmail: str(body.contactEmail),
          contactPhone: str(body.contactPhone),
          contactJobTitle: str(body.contactJobTitle),
          isActive: bool(body.isActive),
          moderationStatus: "DRAFT",
          ...(linkedUserId ? { linkedUser: { connect: { id: linkedUserId } } } : {}),
        },
        include: {
          linkedUser: { select: { id: true, email: true } },
          cabinetUser: { select: { id: true, email: true } },
        },
      })
    );

    return NextResponse.json({ partner });
  } catch (e) {
    console.error("[admin/partners POST]", e);
    const message = prismaErrorToMessage(e);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
