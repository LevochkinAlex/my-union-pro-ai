import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

/**
 * POST /api/admin/fix-chairman
 * Исправляет привязку председателей к их организациям
 * (устанавливает organizationId = ppoHeadOrganizationId и membershipStatus = APPROVED)
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }

    // Проверяем права доступа (только SUPER_ADMIN)
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { role: true },
    });

    if (user?.role !== "SUPER_ADMIN") {
      return NextResponse.json({ error: "Доступ запрещен" }, { status: 403 });
    }

    // Находим всех председателей без привязки к организации
    const chairmen = await prisma.user.findMany({
      where: {
        isPPOHead: true,
        ppoHeadOrganizationId: { not: null },
        OR: [
          { organizationId: null },
          { membershipStatus: { not: "APPROVED" } },
        ],
      },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        organizationId: true,
        ppoHeadOrganizationId: true,
        membershipStatus: true,
      },
    });

    if (chairmen.length === 0) {
      return NextResponse.json({
        success: true,
        message: "Все председатели уже привязаны к организациям",
        fixed: 0,
      });
    }

    // Исправляем каждого председателя
    const fixed = [];
    for (const chairman of chairmen) {
      await prisma.user.update({
        where: { id: chairman.id },
        data: {
          organizationId: chairman.ppoHeadOrganizationId,
          membershipStatus: "APPROVED",
        },
      });
      fixed.push({
        id: chairman.id,
        email: chairman.email,
        name: `${chairman.lastName} ${chairman.firstName}`,
        previousOrganizationId: chairman.organizationId,
        newOrganizationId: chairman.ppoHeadOrganizationId,
        previousMembershipStatus: chairman.membershipStatus,
      });
    }

    return NextResponse.json({
      success: true,
      message: `Исправлено ${fixed.length} председателей`,
      fixed,
    });
  } catch (error: any) {
    console.error("[admin/fix-chairman] Error:", error);
    return NextResponse.json(
      {
        error: "Ошибка при исправлении председателей",
        details: process.env.NODE_ENV === "development" ? error.message : undefined,
      },
      { status: 500 }
    );
  }
}

