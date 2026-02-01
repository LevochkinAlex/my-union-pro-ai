import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getPPOHead } from "@/lib/ppo-head-utils";
import { activateTrial } from "@/lib/subscription";
import { prisma } from "@/lib/prisma";

/**
 * POST /api/subscription/trial
 * Активировать 14-дневный тест без карты для организации председателя
 */
export async function POST() {
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

    const sub = await prisma.organizationSubscription.findUnique({
      where: { organizationId: chairman.organizationId },
    });

    // Не даём повторный триал, если уже был
    if (sub?.trialEndsAt && sub.trialEndsAt > new Date()) {
      return NextResponse.json(
        { error: "Пробный период уже активен" },
        { status: 400 }
      );
    }

    if (sub?.status === "ACTIVE" && sub?.periodEndsAt && sub.periodEndsAt > new Date()) {
      return NextResponse.json(
        { error: "У организации уже есть активная подписка" },
        { status: 400 }
      );
    }

    await activateTrial(chairman.organizationId);

    const updated = await prisma.organizationSubscription.findUnique({
      where: { organizationId: chairman.organizationId },
    });

    return NextResponse.json({
      success: true,
      subscription: {
        status: updated?.status,
        trialEndsAt: updated?.trialEndsAt?.toISOString() ?? null,
      },
    });
  } catch (e) {
    console.error("[api/subscription/trial] POST error:", e);
    return NextResponse.json(
      { error: "Ошибка при активации пробного периода" },
      { status: 500 }
    );
  }
}
