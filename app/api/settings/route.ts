import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { DEMO_USER_ID, DEMO_MEMBER_USER_ID } from "@/lib/demo-constants";
import { prisma } from "@/lib/prisma";

const DEMO_SETTINGS = {
  pushNotificationsEnabled: true,
  pushSoundEnabled: true,
  emailBotNotifications: false,
  emailAppealNotifications: true,
  bestBenefits: {
    userId: null,
    status: null,
    createdAt: null,
    synced: false,
  },
};

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

    const isDemo = session.user.id === DEMO_USER_ID || session.user.id === DEMO_MEMBER_USER_ID;
    if (isDemo) {
      return NextResponse.json(DEMO_SETTINGS);
    }

    console.log("[settings] Fetching settings for user:", session.user.id);

    try {
      const user = await prisma.user.findUnique({
        where: { id: session.user.id },
        select: {
          pushNotificationsEnabled: true,
          pushSoundEnabled: true,
          emailBotNotifications: true,
          emailAppealNotifications: true,
          bestBenefitsUserId: true,
          bestBenefitsStatus: true,
          bestBenefitsCreatedAt: true,
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

      // Безопасное извлечение значений с дефолтами
      const settings = {
        pushNotificationsEnabled: user.pushNotificationsEnabled !== null && user.pushNotificationsEnabled !== undefined 
          ? user.pushNotificationsEnabled 
          : true,
        pushSoundEnabled: user.pushSoundEnabled !== null && user.pushSoundEnabled !== undefined 
          ? user.pushSoundEnabled 
          : true,
        emailBotNotifications: user.emailBotNotifications !== null && user.emailBotNotifications !== undefined 
          ? user.emailBotNotifications 
          : false,
        emailAppealNotifications: user.emailAppealNotifications !== null && user.emailAppealNotifications !== undefined 
          ? user.emailAppealNotifications 
          : true,
        bestBenefits: {
          userId: user.bestBenefitsUserId,
          status: user.bestBenefitsStatus,
          createdAt: user.bestBenefitsCreatedAt,
          synced: !!user.bestBenefitsUserId,
        },
      };

      return NextResponse.json(settings);
    } catch (dbError: any) {
      console.error("[settings] Database error:", {
        message: dbError?.message,
        code: dbError?.code,
        meta: dbError?.meta,
      });
      throw dbError;
    }
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

    const isDemo = session.user.id === DEMO_USER_ID || session.user.id === DEMO_MEMBER_USER_ID;
    if (isDemo) {
      return NextResponse.json({
        success: true,
        message: "Настройки успешно сохранены",
      });
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

