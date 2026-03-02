import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getPPOHead } from "@/lib/ppo-head-utils";

/**
 * POST /api/ppo-head/members/[id]/exclude
 * Исключить члена профсоюза
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } | Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }

    // Проверяем, что пользователь является Председателем
    const chairman = await getPPOHead(session.user.id);

    if (!chairman) {
      return NextResponse.json(
        { error: "Доступ запрещен или организация не назначена" },
        { status: 403 }
      );
    }

    const resolvedParams = await Promise.resolve(params);
    const memberId = resolvedParams.id;

    // Получаем члена профсоюза
    const member = await prisma.user.findUnique({
      where: { id: memberId },
      select: {
        id: true,
        organizationId: true,
        membershipStatus: true,
        firstName: true,
        lastName: true,
      },
    });

    if (!member) {
      return NextResponse.json(
        { error: "Член профсоюза не найден" },
        { status: 404 }
      );
    }

    // Проверяем, что член принадлежит организации председателя
    if (member.organizationId !== chairman.organizationId) {
      return NextResponse.json(
        { error: "Этот пользователь не принадлежит вашей организации" },
        { status: 403 }
      );
    }

    // Проверяем, что член одобрен (активен)
    if (member.membershipStatus !== "APPROVED") {
      return NextResponse.json(
        { error: "Можно исключить только активных членов профсоюза" },
        { status: 400 }
      );
    }

    // Получаем причину из body (опционально)
    let reason = "";
    try {
      const body = await request.json();
      reason = body.reason || "";
    } catch {
      // Если тело запроса пустое, продолжаем без причины
    }

    // Обновляем статус на "EXCLUDED", закрываем доступ как до валидации (role PENDING_MEMBER),
    // сбрасываем учёт в профсоюзе; organizationId не трогаем — при смене места работы пользователь
    // сам обновит организацию, тогда его увидит председатель нового ППО в списке на валидацию
    await prisma.user.update({
      where: { id: memberId },
      data: {
        membershipStatus: "EXCLUDED",
        unionMembershipStatus: "REMOVED",
        role: "PENDING_MEMBER",
        membershipExcludedAt: new Date(),
        membershipExclusionReason: reason || null,
      },
    });

    console.log(`[ppo-head/members] Member excluded: ${memberId} by ${chairman.id}`);

    return NextResponse.json({
      success: true,
      message: `Член профсоюза ${member.lastName} ${member.firstName} исключён`,
    });
  } catch (error: any) {
    console.error("[ppo-head/members] Exclude error:", error);
    return NextResponse.json(
      {
        error: "Ошибка при исключении члена профсоюза",
        details: process.env.NODE_ENV === "development" ? error.message : undefined,
      },
      { status: 500 }
    );
  }
}

