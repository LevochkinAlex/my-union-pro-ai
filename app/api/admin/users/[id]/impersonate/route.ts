import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
/**
 * Вход от имени пользователя (impersonation)
 * POST /api/admin/users/[id]/impersonate
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } | Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);

    // Проверяем, что пользователь - супер-админ
    if (!session?.user?.id || session.user.role !== "SUPER_ADMIN") {
      return NextResponse.json(
        { error: "Только супер-админ может входить от имени пользователя" },
        { status: 403 }
      );
    }

    const resolvedParams = await params;
    const targetUserId = resolvedParams.id;

    // Проверяем, что целевой пользователь существует
    const targetUser = await prisma.user.findUnique({
      where: { id: targetUserId },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
        membershipStatus: true,
        avatarUrl: true,
        partnerRecordId: true,
        partnerRecord: { select: { moderationStatus: true } },
      },
    });

    if (!targetUser) {
      return NextResponse.json(
        { error: "Пользователь не найден" },
        { status: 404 }
      );
    }

    if (
      targetUser.role === "PARTNER" &&
      targetUser.partnerRecord?.moderationStatus === "BLOCKED"
    ) {
      return NextResponse.json(
        {
          success: false,
          error: "Кабинет партнёра заблокирован (например, ликвидация по данным ЕГРЮЛ). Вход от имени недоступен.",
        },
        { status: 403 }
      );
    }

    // Возвращаем данные для создания сессии с impersonation
    // Мы будем использовать специальный токен для impersonation
    return NextResponse.json({
      success: true,
      targetUser: {
        id: targetUser.id,
        email: targetUser.email,
        firstName: targetUser.firstName,
        lastName: targetUser.lastName,
        role: targetUser.role,
        membershipStatus: targetUser.membershipStatus,
        avatarUrl: targetUser.avatarUrl,
      },
      originalAdminId: session.user.id,
    });
  } catch (error) {
    console.error("[impersonate] Error:", error);
    return NextResponse.json(
      {
        success: false,
        error: "Ошибка при входе от имени пользователя",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}

