import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { ensureSuperAdmin } from "@/lib/admin-auth";
import { invalidateUsersCache } from "@/lib/cache-invalidation";

/**
 * POST /api/admin/users/[id]/validate
 * Валидация пользователя (одобрение или отклонение)
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } | Promise<{ id: string }> }
) {
  try {
    const { error } = await ensureSuperAdmin();
    if (error) {
      return error;
    }

    const resolvedParams = await Promise.resolve(params);
    const userId = resolvedParams.id;

    if (!userId) {
      return NextResponse.json(
        { error: "ID пользователя не указан" },
        { status: 400 }
      );
    }

    const body = await request.json();
    const { status, comment } = body;

    if (!status || (status !== "APPROVED" && status !== "REJECTED")) {
      return NextResponse.json(
        { error: "Неверный статус. Используйте APPROVED или REJECTED" },
        { status: 400 }
      );
    }

    // Получаем пользователя
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        role: true,
        membershipStatus: true,
      },
    });

    if (!user) {
      return NextResponse.json(
        { error: "Пользователь не найден" },
        { status: 404 }
      );
    }

    // Обновляем статус
    const updateData: any = {};

    if (status === "APPROVED") {
      // Одобряем пользователя
      updateData.membershipStatus = "APPROVED";
      updateData.role = "MEMBER";
    } else {
      // Отклоняем пользователя
      updateData.membershipStatus = "REJECTED";
    }

    await prisma.user.update({
      where: { id: userId },
      data: updateData,
    });

    // Инвалидируем кеш
    await invalidateUsersCache();

    return NextResponse.json({
      success: true,
      message: status === "APPROVED" ? "Пользователь одобрен" : "Пользователь отклонен",
    });
  } catch (error) {
    console.error("[admin/users/validate] Error:", error);
    return NextResponse.json(
      { error: "Ошибка при валидации пользователя" },
      { status: 500 }
    );
  }
}
