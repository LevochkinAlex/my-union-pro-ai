import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { restoreUserProfileFromKnowledgeBase } from "@/lib/user-knowledge-base";
import { prisma } from "@/lib/prisma";

/**
 * Восстанавливает данные профиля пользователя из базы знаний
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }

    // Восстанавливаем данные из базы знаний
    const restoredData = await restoreUserProfileFromKnowledgeBase(session.user.id);

    if (!restoredData) {
      return NextResponse.json(
        { error: "Нет данных для восстановления в базе знаний" },
        { status: 404 }
      );
    }

    // Обновляем профиль пользователя
    const updatedUser = await prisma.user.update({
      where: { id: session.user.id },
      data: restoredData,
      include: {
        organization: true,
      },
    });

    return NextResponse.json({
      success: true,
      message: "Данные восстановлены из базы знаний",
      user: updatedUser,
    });
  } catch (error) {
    console.error("[profile/restore-from-knowledge] Ошибка:", error);
    return NextResponse.json(
      { error: "Не удалось восстановить данные" },
      { status: 500 }
    );
  }
}

