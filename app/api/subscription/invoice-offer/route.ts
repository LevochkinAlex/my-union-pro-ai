import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getSubscriptionOrganizationId } from "@/lib/subscription-org";
import { prisma } from "@/lib/prisma";
import {
  calculateAmountForMemberCountPeriod,
  getPriceForPeriod,
  getRatesForMemberCount,
  getTariffByKey,
  type TariffPeriod,
} from "@/lib/constants/tariffs";
import { syncInvoiceToOneC } from "@/lib/one-c-integration";
import { generateSubscriptionInvoicePdf } from "@/lib/subscription-invoice-pdf";


/**
 * POST /api/subscription/invoice-offer
 * Генерация счет-оферты PDF по выбранному тарифу/периоду и сохраненному платежному профилю
 * Body: { tariffKey?, customMembers?, period }
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
    const tariffKey = String(body?.tariffKey || "").trim();
    const customMembersRaw = body?.customMembers;
    const customMembers =
      typeof customMembersRaw === "number"
        ? customMembersRaw
        : parseInt(String(customMembersRaw ?? ""), 10);
    const period = String(body?.period || "year") as TariffPeriod;
    if (period !== "half_year" && period !== "year") {
      return NextResponse.json({ error: "Доступны только периоды 6 или 12 месяцев" }, { status: 400 });
    }

    let memberLimit: number;
    let tariffLabel: string;
    let ratePerUserPerMonth: number;
    let amountRub: number;

    if (Number.isFinite(customMembers) && customMembers > 0) {
      memberLimit = Math.floor(customMembers);
      const rates = getRatesForMemberCount(memberLimit);
      ratePerUserPerMonth = period === "half_year" ? rates.sixMonthRate : rates.yearRate;
      tariffLabel = `Индивидуальный (${memberLimit} пользователей)`;
      amountRub = calculateAmountForMemberCountPeriod(memberLimit, period);
    } else {
      if (!tariffKey) {
        return NextResponse.json({ error: "Укажите тариф или количество пользователей" }, { status: 400 });
      }
      const tariff = getTariffByKey(tariffKey);
      if (!tariff || tariff.isUnlimited || !tariff.memberLimit) {
        return NextResponse.json({ error: "Некорректный тариф для счета-оферты" }, { status: 400 });
      }
      memberLimit = tariff.memberLimit;
      tariffLabel = tariff.label;
      ratePerUserPerMonth = period === "half_year" ? tariff.pricePerUserPerMonth : tariff.pricePerUserPerYear;
      amountRub = getPriceForPeriod(tariff, period);
    }

    const [profile, organization] = await Promise.all([
      prisma.organizationBillingProfile.findUnique({
        where: { organizationId },
      }),
      prisma.organization.findUnique({
        where: { id: organizationId },
        select: { id: true, name: true, inn: true },
      }),
    ]);
    if (!profile) {
      return NextResponse.json(
        { error: "Сначала заполните платежный профиль для счета-оферты" },
        { status: 400 }
      );
    }

    const today = new Date();
    const offerNumber = `MYU-${today.getFullYear()}${String(today.getMonth() + 1).padStart(2, "0")}-${Math.floor(1000 + Math.random() * 9000)}`;

    await prisma.issuedInvoice.create({
      data: {
        organizationId,
        offerNumber,
        amountRub: Math.round(amountRub),
        period,
        memberLimit,
        tariffLabel,
        createdById: session.user.id,
      },
    });

    const oneCSync = await syncInvoiceToOneC({
      offerNumber,
      amountRub: Math.round(amountRub),
      period,
      memberLimit,
      tariffLabel,
      issuedAt: today,
      organization: {
        id: organizationId,
        name: organization?.name || "Организация",
        inn: organization?.inn || null,
      },
      payer: {
        entityType: profile.entityType,
        fullName: profile.fullName,
        companyName: profile.companyName,
        inn: profile.inn,
        kpp: profile.kpp,
        ogrn: profile.ogrn,
        legalAddress: profile.legalAddress,
        checkingAccount: profile.checkingAccount,
        bankName: profile.bankName,
        bik: profile.bik,
        correspondentAccount: profile.correspondentAccount,
        contactEmail: profile.contactEmail,
        contactPhone: profile.contactPhone,
      },
    });
    if (oneCSync.status === "failed") {
      console.warn("[invoice-offer] Failed to sync with 1C:", oneCSync.message);
    }

    const pdfBuffer = await generateSubscriptionInvoicePdf({
      offerNumber,
      issuedAt: today,
      amountRub,
      period,
      memberLimit,
      tariffLabel,
      ratePerUserPerMonth,
      buyer: {
        entityType: profile.entityType,
        fullName: profile.fullName,
        companyName: profile.companyName,
        inn: profile.inn,
        kpp: profile.kpp,
        legalAddress: profile.legalAddress,
        checkingAccount: profile.checkingAccount,
        bankName: profile.bankName,
        bik: profile.bik,
        correspondentAccount: profile.correspondentAccount,
      },
    });

    const filename = `schet-oferta-${offerNumber}.pdf`;
    const pdfBytes = new Uint8Array(pdfBuffer);
    return new NextResponse(pdfBytes, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Content-Length": String(pdfBuffer.length),
        "X-MyUnion-1C-Sync": oneCSync.status,
      },
    });
  } catch (e: unknown) {
    const err = e as { message?: string };
    if (err?.message?.includes("OrganizationBillingProfile")) {
      return NextResponse.json(
        { error: "Требуется применить миграцию платежного профиля" },
        { status: 500 }
      );
    }
    console.error("[api/subscription/invoice-offer] POST error:", e);
    return NextResponse.json({ error: "Ошибка генерации счета-оферты" }, { status: 500 });
  }
}

