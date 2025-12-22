import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";

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

    // Определяем, является ли пользователь членом профсоюза
    const isMember = user.role === "MEMBER" || user.role === "PENDING_MEMBER";
    
    // Определяем, является ли пользователь председателем ППО
    const isPPOHead = user.isPPOHead || user.role === "PPO_HEAD";
    
    // Режим "Член профсоюза" доступен если пользователь является членом
    // (включая случаи с двойной ролью)
    if (isMember) {
      availableModes.push({
        mode: "MEMBER",
        label: "Член профсоюза",
      });
    }

    // Режим "Председатель ППО" доступен если пользователь является председателем
    if (isPPOHead) {
      availableModes.push({
        mode: "PPO_HEAD",
        label: "Председатель ППО",
        organizationName: user.ppoHeadOrganization?.name,
      });
    }
    
    // Если пользователь имеет двойную роль (и член, и председатель),
    // убеждаемся что оба режима добавлены (на случай если логика выше не сработала)
    if (user.isPPOHead && isMember) {
      if (!availableModes.find(m => m.mode === "MEMBER")) {
        availableModes.push({
          mode: "MEMBER",
          label: "Член профсоюза",
        });
      }
      if (!availableModes.find(m => m.mode === "PPO_HEAD")) {
        availableModes.push({
          mode: "PPO_HEAD",
          label: "Председатель ППО",
          organizationName: user.ppoHeadOrganization?.name,
        });
      }
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
    const updatedUser = await prisma.user.update({
      where: { id: session.user.id },
      data: { viewMode: mode },
      select: {
        viewMode: true,
        role: true,
        isPPOHead: true,
        ppoHeadOrganization: {
          select: {
            id: true,
            name: true,
          }
        },
      },
    });

    // Определяем доступные режимы для ответа (аналогично GET)
    const availableModes: Array<{ mode: string; label: string; organizationName?: string }> = [];

    // Определяем, является ли пользователь членом профсоюза
    const isMember = updatedUser.role === "MEMBER" || updatedUser.role === "PENDING_MEMBER";
    
    // Определяем, является ли пользователь председателем ППО
    const isPPOHead = updatedUser.isPPOHead || updatedUser.role === "PPO_HEAD";
    
    // Режим "Член профсоюза" доступен если пользователь является членом
    if (isMember) {
      availableModes.push({
        mode: "MEMBER",
        label: "Член профсоюза",
      });
    }

    // Режим "Председатель ППО" доступен если пользователь является председателем
    if (isPPOHead) {
      availableModes.push({
        mode: "PPO_HEAD",
        label: "Председатель ППО",
        organizationName: updatedUser.ppoHeadOrganization?.name,
      });
    }
    
    // Если пользователь имеет двойную роль, убеждаемся что оба режима добавлены
    if (updatedUser.isPPOHead && isMember) {
      if (!availableModes.find(m => m.mode === "MEMBER")) {
        availableModes.push({
          mode: "MEMBER",
          label: "Член профсоюза",
        });
      }
      if (!availableModes.find(m => m.mode === "PPO_HEAD")) {
        availableModes.push({
          mode: "PPO_HEAD",
          label: "Председатель ППО",
          organizationName: updatedUser.ppoHeadOrganization?.name,
        });
      }
    }

    // Сбрасываем кеш страниц dashboard
    revalidatePath("/dashboard", "layout");

    return NextResponse.json({
      success: true,
      currentMode: updatedUser.viewMode || "MEMBER",
      availableModes,
      canSwitch: availableModes.length > 1,
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

