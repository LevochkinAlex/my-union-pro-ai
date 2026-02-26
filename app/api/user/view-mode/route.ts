import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { DEMO_USER_ID, DEMO_MEMBER_USER_ID } from "@/lib/demo-constants";

type ViewModeOption = { mode: string; label: string; organizationName?: string };

type UserModeSource = {
  role?: string | null;
  viewMode?: string | null;
  isPPOHead?: boolean | null;
  isMPOHead?: boolean | null;
  isRPOHead?: boolean | null;
  ppoHeadOrganizationId?: string | null;
  mpoHeadOrganizationId?: string | null;
  rpoHeadOrganizationId?: string | null;
  ppoHeadOrganization?: { name?: string | null } | null;
  mpoHeadOrganization?: { name?: string | null } | null;
  rpoHeadOrganization?: { name?: string | null } | null;
};

function buildAvailableModes(user: UserModeSource): ViewModeOption[] {
  const availableModes: ViewModeOption[] = [];
  const role = user.role || null;

  const isMemberRole = role === "MEMBER" || role === "PENDING_MEMBER";
  const isPPOHead = Boolean(user.isPPOHead || role === "PPO_HEAD");
  const isMPOHead = Boolean(user.isMPOHead);
  const isRPOHead = Boolean(user.isRPOHead);
  const canUseMemberMode = isMemberRole || isPPOHead || isMPOHead || isRPOHead;

  if (canUseMemberMode) {
    availableModes.push({
      mode: "MEMBER",
      label: "Член участник",
    });
  }

  if (isPPOHead && user.ppoHeadOrganizationId) {
    availableModes.push({
      mode: "PPO_HEAD",
      label: "Председатель",
      organizationName: user.ppoHeadOrganization?.name || undefined,
    });
  }

  if (isMPOHead && user.mpoHeadOrganizationId) {
    availableModes.push({
      mode: "MPO_HEAD",
      label: "Председатель МПО",
      organizationName: user.mpoHeadOrganization?.name || undefined,
    });
  }

  if (isRPOHead && user.rpoHeadOrganizationId) {
    availableModes.push({
      mode: "RPO_HEAD",
      label: "Региональный",
      organizationName: user.rpoHeadOrganization?.name || undefined,
    });
  }

  if (availableModes.length === 0) {
    availableModes.push({
      mode: "MEMBER",
      label: "Член участник",
    });
  }

  return availableModes;
}

function resolveCurrentMode(requestedMode: string | null | undefined, availableModes: ViewModeOption[]) {
  if (requestedMode && availableModes.some((m) => m.mode === requestedMode)) {
    return requestedMode;
  }
  return availableModes[0]?.mode || "MEMBER";
}

function normalizeSessionUserModes(user: any): UserModeSource {
  return {
    role: user?.role,
    viewMode: user?.viewMode,
    isPPOHead: user?.isPPOHead,
    isMPOHead: user?.isMPOHead,
    isRPOHead: user?.isRPOHead,
    ppoHeadOrganizationId: user?.ppoHeadOrganizationId,
    mpoHeadOrganizationId: user?.mpoHeadOrganizationId,
    rpoHeadOrganizationId: user?.rpoHeadOrganizationId,
    ppoHeadOrganization: user?.ppoHeadOrganization,
    mpoHeadOrganization: user?.mpoHeadOrganization,
    rpoHeadOrganization: user?.rpoHeadOrganization,
  };
}

// GET /api/user/view-mode
// Получить текущий режим просмотра и доступные режимы
export async function GET() {
  let session: any;
  try {
    session = await getServerSession(authOptions);
    
    if (!session?.user) {
      return NextResponse.json(
        { error: "Не авторизован" },
        { status: 401 }
      );
    }

    // Демо-режим: не обращаемся к БД
    if (session.user.id === DEMO_MEMBER_USER_ID) {
      return NextResponse.json({
        currentMode: "MEMBER",
        availableModes: [{ mode: "MEMBER", label: "Член профсоюза" }],
        canSwitch: false,
      });
    }
    if (session.user.id === DEMO_USER_ID) {
      return NextResponse.json({
        currentMode: "PPO_HEAD",
        availableModes: [{ mode: "PPO_HEAD", label: "Председатель ППО", organizationName: "ППО Аппарат МООП РЗ РФ" }],
        canSwitch: false,
      });
    }
    if ((session.user as { isDemo?: boolean }).isDemo) {
      const viewMode = (session.user as { viewMode?: string }).viewMode;
      if (viewMode === "PPO_HEAD") {
        return NextResponse.json({
          currentMode: "PPO_HEAD",
          availableModes: [{ mode: "PPO_HEAD", label: "Председатель ППО", organizationName: "ППО Аппарат МООП РЗ РФ" }],
          canSwitch: false,
        });
      }
      return NextResponse.json({
        currentMode: "MEMBER",
        availableModes: [{ mode: "MEMBER", label: "Член профсоюза" }],
        canSwitch: false,
      });
    }

    // КРИТИЧЕСКОЕ ИСПРАВЛЕНИЕ: Убираем withPrismaRetry - он может вызывать 503
    // Используем прямой запрос с обработкой ошибок
    let user: any;
    try {
      user = await prisma.user.findUnique({
        where: { id: session.user.id },
        select: {
          id: true,
          role: true,
          isPPOHead: true,
          isMPOHead: true,
          isRPOHead: true,
          viewMode: true,
          ppoHeadOrganizationId: true,
          mpoHeadOrganizationId: true,
          rpoHeadOrganizationId: true,
          ppoHeadOrganization: {
            select: {
              id: true,
              name: true,
            }
          },
          mpoHeadOrganization: {
            select: {
              id: true,
              name: true,
            },
          },
          rpoHeadOrganization: {
            select: {
              id: true,
              name: true,
            },
          },
        },
      });
    } catch (dbError) {
      // При любой ошибке БД возвращаем fallback из сессии, не пробрасываем 503/500
      console.error("[user/view-mode] Database error:", dbError);
      const u = (session as any)?.user;
      if (u) {
        const availableModes = buildAvailableModes(normalizeSessionUserModes(u));
        const currentMode = resolveCurrentMode(u.viewMode, availableModes);
        return NextResponse.json({
          currentMode,
          availableModes,
          canSwitch: availableModes.length > 1,
        });
      }
      return NextResponse.json(
        { error: "Ошибка получения данных. Попробуйте позже." },
        { status: 500 }
      );
    }

    if (!user) {
      return NextResponse.json(
        { error: "Пользователь не найден" },
        { status: 404 }
      );
    }

    const availableModes = buildAvailableModes(user);
    const currentMode = resolveCurrentMode(user.viewMode, availableModes);

    return NextResponse.json({
      currentMode,
      availableModes,
      canSwitch: availableModes.length > 1,
    });
  } catch (error: any) {
    console.error("[user/view-mode] GET Error:", error);
    
    // Проверяем, является ли это ошибкой подключения к БД
    const isConnectionError = 
      error?.code === 'P1001' || // Can't reach database server
      error?.code === 'P1002' || // Database server doesn't accept connections
      error?.code === 'P1008' || // Operations timed out
      error?.code === 'P1017' || // Server has closed the connection
      error?.message?.includes('timeout') ||
      error?.message?.includes('ECONNREFUSED');
    
    // Если таймаут или ошибка БД, возвращаем fallback с данными из сессии
    if (isConnectionError) {
      console.warn("[user/view-mode] Database timeout, using session fallback");
      try {
        if (!session) {
          session = await getServerSession(authOptions);
        }
        const user = (session as any)?.user;
        if (user) {
          const availableModes = buildAvailableModes(normalizeSessionUserModes(user));
          const currentMode = resolveCurrentMode(user.viewMode, availableModes);
          return NextResponse.json({
            currentMode,
            availableModes,
            canSwitch: availableModes.length > 1,
          });
        }
      } catch (fallbackError) {
        console.error("[user/view-mode] Fallback also failed:", fallbackError);
      }
    }
    
    // КРИТИЧЕСКОЕ ИСПРАВЛЕНИЕ: НЕ возвращаем 503 при ошибках БД
    // Вместо этого используем fallback из сессии или возвращаем 500
    // 503 должен возвращаться только при реальной недоступности сервиса
    if (isConnectionError) {
      // Fallback уже обработан выше, если дошли сюда - fallback не сработал
      // Возвращаем 500 вместо 503, чтобы не путать с реальной недоступностью
      return NextResponse.json(
        { 
          error: "Ошибка получения данных. Попробуйте позже.",
          details: process.env.NODE_ENV === "development" ? error?.message : undefined,
        },
        { status: 500 }
      );
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

    if (!mode || !["MEMBER", "PPO_HEAD", "MPO_HEAD", "RPO_HEAD"].includes(mode)) {
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
        isMPOHead: true,
        isRPOHead: true,
        ppoHeadOrganizationId: true,
        mpoHeadOrganizationId: true,
        rpoHeadOrganizationId: true,
      },
    });

    if (!user) {
      return NextResponse.json(
        { error: "Пользователь не найден" },
        { status: 404 }
      );
    }

    // Проверяем что пользователь может переключиться в этот режим
    if (mode === "PPO_HEAD" && (!user.isPPOHead || !user.ppoHeadOrganizationId)) {
      return NextResponse.json(
        { error: "У вас нет прав председателя ППО" },
        { status: 403 }
      );
    }
    if (mode === "MPO_HEAD" && (!user.isMPOHead || !user.mpoHeadOrganizationId)) {
      return NextResponse.json(
        { error: "У вас нет прав председателя МПО" },
        { status: 403 }
      );
    }
    if (mode === "RPO_HEAD" && (!user.isRPOHead || !user.rpoHeadOrganizationId)) {
      return NextResponse.json(
        { error: "У вас нет прав председателя РПО" },
        { status: 403 }
      );
    }

    // Обновляем режим просмотра
    const updatedUser = await prisma.user.update({
      where: { id: session.user.id },
      data: { viewMode: mode },
      select: {
        viewMode: true,
        role: true,
        isPPOHead: true,
        isMPOHead: true,
        isRPOHead: true,
        ppoHeadOrganizationId: true,
        mpoHeadOrganizationId: true,
        rpoHeadOrganizationId: true,
        ppoHeadOrganization: {
          select: {
            id: true,
            name: true,
          }
        },
        mpoHeadOrganization: {
          select: {
            id: true,
            name: true,
          },
        },
        rpoHeadOrganization: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    const availableModes = buildAvailableModes(updatedUser);
    const currentMode = resolveCurrentMode(updatedUser.viewMode, availableModes);

    // Сбрасываем кеш страниц dashboard
    revalidatePath("/dashboard", "layout");

    return NextResponse.json({
      success: true,
      currentMode,
      availableModes,
      canSwitch: availableModes.length > 1,
      message:
        mode === "PPO_HEAD"
          ? "Вы переключились в режим Председателя ППО"
          : mode === "MPO_HEAD"
          ? "Вы переключились в режим Председателя МПО"
          : mode === "RPO_HEAD"
          ? "Вы переключились в режим Председателя РПО"
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

