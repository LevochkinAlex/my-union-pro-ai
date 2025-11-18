import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// GET - получить настройки пользователя
export async function GET() {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json(
        { error: "Не авторизован" },
        { status: 401 }
      );
    }

    console.log("[settings] Fetching settings for user:", session.user.id);

    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: {
        pushNotificationsEnabled: true,
        pushSoundEnabled: true,
        emailBotNotifications: true,
        emailAppealNotifications: true,
      },
    });

    if (!user) {
      console.error("[settings] User not found:", session.user.id);
      return NextResponse.json(
        { error: "Пользователь не найден" },
        { status: 404 }
      );
    }

    console.log("[settings] User settings retrieved:", {
      pushNotificationsEnabled: user.pushNotificationsEnabled,
      pushSoundEnabled: user.pushSoundEnabled,
      emailBotNotifications: user.emailBotNotifications,
      emailAppealNotifications: user.emailAppealNotifications,
    });

    return NextResponse.json({
      pushNotificationsEnabled: user.pushNotificationsEnabled ?? true,
      pushSoundEnabled: user.pushSoundEnabled ?? true,
      emailBotNotifications: user.emailBotNotifications ?? false,
      emailAppealNotifications: user.emailAppealNotifications ?? true,
    });
  } catch (error: any) {
    console.error("[settings] Error fetching settings:", {
      message: error?.message,
      code: error?.code,
      meta: error?.meta,
      stack: error?.stack,
      error: error,
    });
    return NextResponse.json(
      { 
        error: "Ошибка загрузки настроек",
        details: process.env.NODE_ENV === "development" ? error?.message : undefined,
      },
      { status: 500 }
    );
  }
}

// PUT - обновить настройки пользователя
export async function PUT(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json(
        { error: "Не авторизован" },
        { status: 401 }
      );
    }

    const body = await request.json();
    const {
      pushNotificationsEnabled,
      pushSoundEnabled,
      emailBotNotifications,
      emailAppealNotifications,
    } = body;

    // Валидация
    if (
      typeof pushNotificationsEnabled !== "boolean" ||
      typeof pushSoundEnabled !== "boolean" ||
      typeof emailBotNotifications !== "boolean" ||
      typeof emailAppealNotifications !== "boolean"
    ) {
      return NextResponse.json(
        { error: "Неверный формат данных" },
        { status: 400 }
      );
    }

    // Обновляем настройки
    await prisma.user.update({
      where: { id: session.user.id },
      data: {
        pushNotificationsEnabled,
        pushSoundEnabled,
        emailBotNotifications,
        emailAppealNotifications,
      },
    });

    console.log("[settings] Settings updated for user:", session.user.id);

    return NextResponse.json({
      success: true,
      message: "Настройки успешно сохранены",
    });
  } catch (error: any) {
    console.error("[settings] Error updating settings:", {
      message: error?.message,
      code: error?.code,
      meta: error?.meta,
      stack: error?.stack,
      error: error,
    });
    return NextResponse.json(
      { 
        error: "Ошибка сохранения настроек",
        details: process.env.NODE_ENV === "development" ? error?.message : undefined,
      },
      { status: 500 }
    );
  }
}

