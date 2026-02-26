import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getSubscriptionOrganizationId } from "@/lib/subscription-org";
import { prisma } from "@/lib/prisma";
import { getCompanyByInn } from "@/lib/dadata";

type EntityType = "INDIVIDUAL" | "INDIVIDUAL_ENTREPRENEUR" | "LEGAL_ENTITY";

function normalize(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const s = String(value).trim();
  return s.length > 0 ? s : null;
}

/**
 * GET /api/subscription/billing-profile
 * Получить сохраненный платежный профиль организации председателя
 */
export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }

    const organizationId = await getSubscriptionOrganizationId(session.user.id);
    if (!organizationId) {
      return NextResponse.json({ error: "Доступ запрещен" }, { status: 403 });
    }

    try {
      const profile = await prisma.organizationBillingProfile.findUnique({
        where: { organizationId },
      });
      return NextResponse.json({ profile });
    } catch (e: unknown) {
      const err = e as { message?: string };
      if (err?.message?.includes("OrganizationBillingProfile")) {
        return NextResponse.json({ profile: null, migrationRequired: true });
      }
      throw e;
    }
  } catch (e) {
    console.error("[api/subscription/billing-profile] GET error:", e);
    return NextResponse.json({ error: "Ошибка получения платежного профиля" }, { status: 500 });
  }
}

/**
 * POST /api/subscription/billing-profile
 * Сохранить/обновить платежный профиль организации
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }

    const organizationId = await getSubscriptionOrganizationId(session.user.id);
    if (!organizationId) {
      return NextResponse.json({ error: "Доступ запрещен" }, { status: 403 });
    }

    const body = await request.json().catch(() => ({}));
    const entityType = String(body?.entityType || "") as EntityType;
    if (!["INDIVIDUAL", "INDIVIDUAL_ENTREPRENEUR", "LEGAL_ENTITY"].includes(entityType)) {
      return NextResponse.json({ error: "Некорректный тип плательщика" }, { status: 400 });
    }

    const fullName = normalize(body?.fullName);
    const companyName = normalize(body?.companyName);
    const inn = normalize(body?.inn);
    const legalAddress = normalize(body?.legalAddress);

    if (entityType === "INDIVIDUAL") {
      if (!fullName) {
        return NextResponse.json({ error: "Для физлица укажите ФИО" }, { status: 400 });
      }
    } else {
      if (!companyName) {
        return NextResponse.json({ error: "Для ИП/ЮЛ укажите название" }, { status: 400 });
      }
      if (!inn) {
        return NextResponse.json({ error: "Для ИП/ЮЛ обязателен ИНН" }, { status: 400 });
      }
      if (!legalAddress) {
        return NextResponse.json({ error: "Для ИП/ЮЛ обязателен юридический адрес" }, { status: 400 });
      }
    }

    const data = {
      entityType,
      fullName,
      companyName,
      inn,
      kpp: normalize(body?.kpp),
      ogrn: normalize(body?.ogrn),
      legalAddress,
      checkingAccount: normalize(body?.checkingAccount),
      bankName: normalize(body?.bankName),
      bik: normalize(body?.bik),
      correspondentAccount: normalize(body?.correspondentAccount),
      contactEmail: normalize(body?.contactEmail),
      contactPhone: normalize(body?.contactPhone),
    };

    const profile = await prisma.organizationBillingProfile.upsert({
      where: { organizationId },
      create: {
        organizationId,
        ...data,
      },
      update: data,
    });

    return NextResponse.json({ success: true, profile });
  } catch (e: unknown) {
    const err = e as { message?: string };
    if (err?.message?.includes("OrganizationBillingProfile")) {
      return NextResponse.json(
        { error: "Требуется применить миграцию платежного профиля" },
        { status: 500 }
      );
    }
    console.error("[api/subscription/billing-profile] POST error:", e);
    return NextResponse.json({ error: "Ошибка сохранения платежного профиля" }, { status: 500 });
  }
}

/**
 * POST /api/subscription/billing-profile (action=autofill-by-inn)
 * Автозаполнение реквизитов из DaData по ИНН
 */
export async function PATCH(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }

    const organizationId = await getSubscriptionOrganizationId(session.user.id);
    if (!organizationId) {
      return NextResponse.json({ error: "Доступ запрещен" }, { status: 403 });
    }

    const body = await request.json().catch(() => ({}));
    const action = String(body?.action || "");
    if (action !== "autofill-by-inn") {
      return NextResponse.json({ error: "Некорректное действие" }, { status: 400 });
    }

    const inn = String(body?.inn || "").trim();
    if (!inn) {
      return NextResponse.json({ error: "Укажите ИНН" }, { status: 400 });
    }

    const company = await getCompanyByInn(inn);
    if (!company) {
      return NextResponse.json({ error: "Компания не найдена в DaData" }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      company: {
        inn: company.inn || null,
        ogrn: company.ogrn || null,
        companyName: company.name?.full || null,
        legalAddress: company.address?.value || null,
      },
    });
  } catch (e) {
    console.error("[api/subscription/billing-profile] PATCH error:", e);
    return NextResponse.json({ error: "Ошибка автозаполнения по ИНН" }, { status: 500 });
  }
}

