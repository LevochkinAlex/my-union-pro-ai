import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getPPOHead } from "@/lib/ppo-head-utils";
import { prisma } from "@/lib/prisma";

/**
 * GET /api/subscription/payments
 * История платежей организации председателя
 */
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }

    const chairman = await getPPOHead(session.user.id);
    if (!chairman) {
      return NextResponse.json(
        { error: "Доступ запрещен или организация не назначена" },
        { status: 403 }
      );
    }

    const { searchParams } = new URL(request.url);
    const limit = Math.min(50, Math.max(1, parseInt(searchParams.get("limit") || "20", 10)));
    const skip = Math.max(0, parseInt(searchParams.get("skip") || "0", 10));

    const [payments, total] = await Promise.all([
      prisma.organizationPayment.findMany({
        where: { organizationId: chairman.organizationId },
        orderBy: { createdAt: "desc" },
        take: limit,
        skip,
        select: {
          id: true,
          amountCents: true,
          currency: true,
          periodStart: true,
          periodEnd: true,
          status: true,
          createdAt: true,
          externalId: true,
          metadata: true,
        },
      }),
      prisma.organizationPayment.count({
        where: { organizationId: chairman.organizationId },
      }),
    ]);

    return NextResponse.json({
      payments: payments.map((p) => ({
        id: p.id,
        amountCents: p.amountCents,
        amountRub: (p.amountCents / 100).toFixed(2),
        currency: p.currency,
        periodStart: p.periodStart.toISOString(),
        periodEnd: p.periodEnd.toISOString(),
        status: p.status,
        createdAt: p.createdAt.toISOString(),
        externalId: p.externalId,
        metadata: p.metadata,
      })),
      total,
      limit,
      skip,
    });
  } catch (e) {
    console.error("[api/subscription/payments] GET error:", e);
    return NextResponse.json(
      { error: "Ошибка при получении платежей" },
      { status: 500 }
    );
  }
}
