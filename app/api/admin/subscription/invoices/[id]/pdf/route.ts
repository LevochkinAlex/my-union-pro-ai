import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { generateSubscriptionInvoicePdf } from "@/lib/subscription-invoice-pdf";
import { getRatesForMemberCount, type TariffPeriod } from "@/lib/constants/tariffs";

function ensureSuperAdmin(session: { user?: { id?: string; role?: string } } | null) {
  if (!session?.user?.id) {
    return { error: NextResponse.json({ error: "Не авторизован" }, { status: 401 }) };
  }
  if (session.user?.role !== "SUPER_ADMIN") {
    return { error: NextResponse.json({ error: "Доступ запрещен" }, { status: 403 }) };
  }
  return { error: null };
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  const err = ensureSuperAdmin(session);
  if (err.error) return err.error;

  const { id } = await context.params;
  const invoice = await prisma.issuedInvoice.findUnique({
    where: { id },
    include: {
      organization: {
        select: { id: true, name: true },
      },
    },
  });

  if (!invoice) {
    return NextResponse.json({ error: "Счёт не найден" }, { status: 404 });
  }

  const profile = await prisma.organizationBillingProfile.findUnique({
    where: { organizationId: invoice.organizationId },
  });
  if (!profile) {
    return NextResponse.json(
      { error: "Для организации отсутствует платежный профиль для восстановления PDF счета" },
      { status: 400 }
    );
  }

  const period = (invoice.period === "half_year" || invoice.period === "year"
    ? invoice.period
    : "year") as TariffPeriod;
  const rates = getRatesForMemberCount(invoice.memberLimit);
  const ratePerUserPerMonth = period === "half_year" ? rates.sixMonthRate : rates.yearRate;

  const pdfBuffer = await generateSubscriptionInvoicePdf({
    offerNumber: invoice.offerNumber,
    issuedAt: invoice.createdAt,
    amountRub: invoice.amountRub,
    period,
    memberLimit: invoice.memberLimit,
    tariffLabel: invoice.tariffLabel,
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

  return new NextResponse(new Uint8Array(pdfBuffer), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="schet-oferta-${invoice.offerNumber}.pdf"`,
      "Content-Length": String(pdfBuffer.length),
    },
  });
}
