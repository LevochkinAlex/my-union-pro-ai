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

    // ОПТИМИЗАЦИЯ: Таймаут для запроса к БД (10 секунд)
    let user: any;
    try {
      user = await Promise.race([
        prisma.user.findUnique({
          where: { id: session.user.id },
          select: {
            id: true,
            role: true,
            isPPOHead: true,
            viewMode: true,
            ppoHeadOrganizationId: true,
            ppoHeadOrganization: {
              select: {
                id: true,
                name: true,
              }
            },
          },
        }),
        new Promise<never>((_, reject) => 
          setTimeout(() => reject(new Error('Database query timeout')), 10000)
        ),
      ]);
    } catch (timeoutError) {
      // Если таймаут, используем fallback из сессии
      throw timeoutError;
    }

    if (!user) {
      return NextResponse.json(
        { error: "Пользователь не найден" },
        { status: 404 }
      );
    }

    // Определяем доступные режимы
    const availableModes: Array<{ mode: string; label: string; organizationName?: string }> = [];

    // Определяем, является ли пользователь членом профсоюза
    // ВАЖНО: Если пользователь имеет роль PPO_HEAD, но также может быть членом (есть организация),
    // то режим MEMBER должен быть доступен
    const isMember = user.role === "MEMBER" || user.role === "PENDING_MEMBER";
    
    // Определяем, является ли пользователь председателем ППО
    const isPPOHead = user.isPPOHead || user.role === "PPO_HEAD";
    
    // Если пользователь является председателем, но также может быть членом (есть организация),
    // то оба режима должны быть доступны
    const hasDualRole = isPPOHead && (isMember || user.ppoHeadOrganizationId);
    
    // Режим "Член профсоюза" доступен если:
    // 1. Пользователь является членом ИЛИ
    // 2. Пользователь является председателем и имеет организацию (может работать в обоих режимах)
    if (isMember || (isPPOHead && user.ppoHeadOrganizationId)) {
      if (!availableModes.find(m => m.mode === "MEMBER")) {
      availableModes.push({
        mode: "MEMBER",
        label: "Член профсоюза",
      });
      }
    }

    // Режим "Председатель ППО" доступен если пользователь является председателем
    if (isPPOHead) {
      if (!availableModes.find(m => m.mode === "PPO_HEAD")) {
      availableModes.push({
        mode: "PPO_HEAD",
        label: "Председатель ППО",
        organizationName: user.ppoHeadOrganization?.name,
      });
    }
    }
    
    // Дополнительная проверка: если пользователь имеет двойную роль,
    // убеждаемся что оба режима добавлены
    if (hasDualRole) {
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
  } catch (error: any) {
    console.error("[user/view-mode] GET Error:", error);
    
    // Если таймаут или ошибка БД, возвращаем fallback с данными из сессии
    if (error?.message === 'Database query timeout' || error?.code === 'P1001') {
      console.warn("[user/view-mode] Database timeout, using session fallback");
      const user = (session as any)?.user;
      if (user) {
        return NextResponse.json({
          currentMode: user.viewMode || "MEMBER",
          availableModes: [
            { mode: "MEMBER", label: "Член профсоюза" },
            ...(user.isPPOHead || user.isMPOHead || user.isRPOHead 
              ? [{ mode: "PPO_HEAD", label: "Председатель ППО" }] 
              : [])
          ],
          canSwitch: (user.isPPOHead || user.isMPOHead || user.isRPOHead) && user.viewMode !== "MEMBER",
        });
      }
    }
    
    return NextResponse.json(
      { 
        error: "Ошибка получения режима просмотра",
        details: process.env.NODE_ENV === "development" ? error?.message : undefined,
      },
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
        ppoHeadOrganizationId: true,
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
    
    // Если пользователь является председателем, но также может быть членом (есть организация),
    // то оба режима должны быть доступны
    const hasDualRole = isPPOHead && (isMember || updatedUser.ppoHeadOrganizationId);
    
    // Режим "Член профсоюза" доступен если:
    // 1. Пользователь является членом ИЛИ
    // 2. Пользователь является председателем и имеет организацию (может работать в обоих режимах)
    if (isMember || (isPPOHead && updatedUser.ppoHeadOrganizationId)) {
      if (!availableModes.find(m => m.mode === "MEMBER")) {
      availableModes.push({
        mode: "MEMBER",
        label: "Член профсоюза",
      });
      }
    }

    // Режим "Председатель ППО" доступен если пользователь является председателем
    if (isPPOHead) {
      if (!availableModes.find(m => m.mode === "PPO_HEAD")) {
      availableModes.push({
        mode: "PPO_HEAD",
        label: "Председатель ППО",
        organizationName: updatedUser.ppoHeadOrganization?.name,
      });
      }
    }
    
    // Дополнительная проверка: если пользователь имеет двойную роль,
    // убеждаемся что оба режима добавлены
    if (hasDualRole) {
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

