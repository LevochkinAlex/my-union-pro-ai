import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { checkUserPermissions } from "@/lib/staff-permissions";

/**
 * GET /api/ppo-head/organization
 * Данные организации председателя (в т.ч. totalEmployees)
 */
export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }

    const perm = await checkUserPermissions(session.user.id, "settings_view");
    if (!perm.hasAccess || !perm.organizationId) {
      return NextResponse.json({ error: "Нет доступа" }, { status: 403 });
    }

    const organization = await prisma.organization.findUnique({
      where: { id: perm.organizationId },
      select: { id: true, name: true, totalEmployees: true },
    });

    if (!organization) {
      return NextResponse.json({ error: "Организация не найдена" }, { status: 404 });
    }

    return NextResponse.json({ organization });
  } catch (error: unknown) {
    console.error("[ppo-head/organization] GET error:", error);
    return NextResponse.json(
      { error: "Ошибка при получении данных организации" },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/ppo-head/organization
 * Обновить число работников организации (totalEmployees)
 */
export async function PATCH(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }

    const perm = await checkUserPermissions(session.user.id, "settings_view");
    if (!perm.hasAccess || !perm.organizationId) {
      return NextResponse.json({ error: "Нет доступа" }, { status: 403 });
    }

    const body = await request.json();
    const { totalEmployees } = body;

    const value =
      totalEmployees === undefined || totalEmployees === null || totalEmployees === ""
        ? null
        : Math.max(0, parseInt(String(totalEmployees), 10) || 0);

    await prisma.organization.update({
      where: { id: perm.organizationId },
      data: { totalEmployees: value },
    });

    return NextResponse.json({
      success: true,
      totalEmployees: value,
    });
  } catch (error: unknown) {
    console.error("[ppo-head/organization] PATCH error:", error);
    return NextResponse.json(
      { error: "Ошибка при обновлении данных организации" },
      { status: 500 }
    );
  }
}
