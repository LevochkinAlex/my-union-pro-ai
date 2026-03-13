import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

function ensureSuperAdmin(session: { user?: { id?: string; role?: string } } | null) {
  if (!session?.user?.id) {
    return { error: NextResponse.json({ error: "Не авторизован" }, { status: 401 }) };
  }
  if (session.user?.role !== "SUPER_ADMIN") {
    return { error: NextResponse.json({ error: "Доступ запрещен" }, { status: 403 }) };
  }
  return { error: null };
}

/**
 * GET /api/admin/subscription/invoices
 * Список выставленных счетов-оферт для суперадминов.
 * Параметры: organizationId, offerNumber, limit, skip
 */
export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  const err = ensureSuperAdmin(session);
  if (err.error) return err.error;

  const { searchParams } = new URL(request.url);
  const organizationId = searchParams.get("organizationId");
  const offerNumber = searchParams.get("offerNumber");
  const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") || "50", 10)));
  const skip = Math.max(0, parseInt(searchParams.get("skip") || "0", 10));

  const where: Record<string, unknown> = {};
  if (organizationId) where.organizationId = organizationId;
  if (offerNumber && offerNumber.trim()) {
    where.offerNumber = { contains: offerNumber.trim(), mode: "insensitive" };
  }

  const [invoices, total] = await Promise.all([
    prisma.issuedInvoice.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: limit,
      skip,
      include: {
        organization: { select: { id: true, name: true, type: true } },
      },
    }),
    prisma.issuedInvoice.count({ where }),
  ]);

  const items = invoices.map((inv) => ({
    id: inv.id,
    organizationId: inv.organizationId,
    organizationName: inv.organization?.name ?? null,
    offerNumber: inv.offerNumber,
    amountRub: inv.amountRub,
    period: inv.period,
    periodLabel: inv.period === "half_year" ? "6 месяцев" : inv.period === "year" ? "12 месяцев" : inv.period,
    memberLimit: inv.memberLimit,
    tariffLabel: inv.tariffLabel,
    createdAt: inv.createdAt.toISOString(),
  }));

  return NextResponse.json({
    invoices: items,
    total,
    limit,
    skip,
  });
}
