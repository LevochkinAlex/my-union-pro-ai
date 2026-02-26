import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { DEMO_USER_ID, DEMO_MEMBER_USER_ID } from "@/lib/demo-constants";
import { getAvailableViewModes, resolveCurrentMode } from "@/lib/session-user";

// GET /api/user/view-mode
// Текущий режим и доступные режимы — только из сессии (без запроса в БД)
export async function GET() {
  const session = await getServerSession(authOptions);

  if (!session?.user) {
    return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
  }

  if (session.user.id === DEMO_MEMBER_USER_ID) {
    return NextResponse.json({
      currentMode: "MEMBER",
      availableModes: [{ mode: "MEMBER", label: "Член профсоюза" }],
      canSwitch: false,
    });
  }
  if (session.user.id === DEMO_USER_ID || session.user.isDemo) {
    return NextResponse.json({
      currentMode: "PPO_HEAD",
      availableModes: [{ mode: "PPO_HEAD", label: "Председатель ППО", organizationName: "ППО Аппарат МООП РЗ РФ" }],
      canSwitch: false,
    });
  }

  // Для РПО/МПО/ППО берём актуальные флаги из БД, а при ошибке откатываемся на сессию.
  let sourceUser: any = session.user;
  try {
    const dbUser = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: {
        role: true,
        viewMode: true,
        isPPOHead: true,
        ppoHeadOrganizationId: true,
        isMPOHead: true,
        mpoHeadOrganizationId: true,
        isRPOHead: true,
        rpoHeadOrganizationId: true,
        ppoHeadOrganization: { select: { name: true } },
        mpoHeadOrganization: { select: { name: true } },
        rpoHeadOrganization: { select: { name: true } },
      },
    });
    if (dbUser) {
      sourceUser = dbUser;
    }
  } catch (error) {
    console.warn("[user/view-mode] GET fallback to session:", error);
  }

  const availableModes = getAvailableViewModes({ user: sourceUser } as any);
  const currentMode = resolveCurrentMode(sourceUser.viewMode ?? session.user.viewMode, availableModes);

  return NextResponse.json({
    currentMode,
    availableModes,
    canSwitch: availableModes.length > 1,
  });
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

    const availableModes = getAvailableViewModes({ user: updatedUser } as any);
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

