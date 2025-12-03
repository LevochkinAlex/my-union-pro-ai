import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

/**
 * Восстановление сессии админа после impersonation
 * POST /api/admin/impersonate/restore
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    // Проверяем, что пользователь находится в режиме impersonation
    if (!session?.user?.isImpersonating || !session.user.originalAdminId) {
      return NextResponse.json(
        { error: "Вы не находитесь в режиме impersonation" },
        { status: 400 }
      );
    }

    const adminId = session.user.originalAdminId;

    // Получаем данные админа
    const adminUser = await prisma.user.findUnique({
      where: { id: adminId },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
        membershipStatus: true,
        avatarUrl: true,
      },
    });

    if (!adminUser) {
      return NextResponse.json(
        { error: "Админ не найден" },
        { status: 404 }
      );
    }

    if (adminUser.role !== "SUPER_ADMIN") {
      return NextResponse.json(
        { error: "Пользователь не является супер-админом" },
        { status: 403 }
      );
    }

    // Возвращаем данные для восстановления сессии
    // Сессия будет обновлена через специальный механизм NextAuth
    return NextResponse.json({
      success: true,
      adminUser: {
        id: adminUser.id,
        email: adminUser.email,
        firstName: adminUser.firstName,
        lastName: adminUser.lastName,
        role: adminUser.role,
        membershipStatus: adminUser.membershipStatus,
        avatarUrl: adminUser.avatarUrl,
      },
    });
  } catch (error) {
    console.error("[impersonate/restore] Error:", error);
    return NextResponse.json(
      {
        success: false,
        error: "Ошибка при восстановлении сессии админа",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}

