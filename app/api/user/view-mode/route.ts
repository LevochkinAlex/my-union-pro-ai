import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// GET /api/user/view-mode
// Получить текущий режим просмотра и доступные режимы
export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    
    if (!session?.user) {
      return NextResponse.json(
        { error: "Не авторизован" },
        { status: 401 }
      );
    }

    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: {
        id: true,
        role: true,
        isPPOHead: true,
        viewMode: true,
        ppoHeadOrganization: {
          select: {
            id: true,
            name: true,
          }
        },
      },
    });

    if (!user) {
      return NextResponse.json(
        { error: "Пользователь не найден" },
        { status: 404 }
      );
    }

    // Определяем доступные режимы
    const availableModes: Array<{ mode: string; label: string; organizationName?: string }> = [];

    // Если пользователь член профсоюза
    if (user.role === "MEMBER" || user.role === "PENDING_MEMBER" || user.isPPOHead) {
      availableModes.push({
        mode: "MEMBER",
        label: "Член профсоюза",
      });
    }

    // Если пользователь также председатель ППО
    if (user.isPPOHead && user.ppoHeadOrganization) {
      availableModes.push({
        mode: "PPO_HEAD",
        label: "Председатель ППО",
        organizationName: user.ppoHeadOrganization.name,
      });
    }

    // Если роль PPO_HEAD (без двойной роли)
    if (user.role === "PPO_HEAD" && !user.isPPOHead) {
      availableModes.push({
        mode: "PPO_HEAD",
        label: "Председатель ППО",
      });
    }

    return NextResponse.json({
      currentMode: user.viewMode || "MEMBER",
      availableModes,
      canSwitch: availableModes.length > 1,
    });
  } catch (error) {
    console.error("[user/view-mode] GET Error:", error);
    return NextResponse.json(
      { error: "Ошибка получения режима просмотра" },
      { status: 500 }
    );
  }
}

// PUT /api/user/view-mode
// Переключить режим просмотра
export async function PUT(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    
    if (!session?.user) {
      return NextResponse.json(
        { error: "Не авторизован" },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { mode } = body;

    if (!mode || !["MEMBER", "PPO_HEAD"].includes(mode)) {
      return NextResponse.json(
        { error: "Неверный режим просмотра" },
        { status: 400 }
      );
    }

    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: {
        id: true,
        role: true,
        isPPOHead: true,
        ppoHeadOrganizationId: true,
      },
    });

    if (!user) {
      return NextResponse.json(
        { error: "Пользователь не найден" },
        { status: 404 }
      );
    }

    // Проверяем что пользователь может переключиться в этот режим
    if (mode === "PPO_HEAD") {
      if (!user.isPPOHead && user.role !== "PPO_HEAD") {
        return NextResponse.json(
          { error: "У вас нет прав председателя ППО" },
          { status: 403 }
        );
      }
    }

    // Обновляем режим просмотра
    await prisma.user.update({
      where: { id: session.user.id },
      data: { viewMode: mode },
    });

    return NextResponse.json({
      success: true,
      currentMode: mode,
      message: mode === "PPO_HEAD" 
        ? "Вы переключились в режим Председателя ППО" 
        : "Вы переключились в режим Члена профсоюза",
    });
  } catch (error) {
    console.error("[user/view-mode] PUT Error:", error);
    return NextResponse.json(
      { error: "Ошибка переключения режима" },
      { status: 500 }
    );
  }
}

