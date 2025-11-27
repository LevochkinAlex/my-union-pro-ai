import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * POST /api/telegram/link
 * Генерирует ссылку для привязки Telegram к номеру телефона
 */
export async function POST(request: NextRequest) {
  try {
    const { phone } = await request.json();

    if (!phone || typeof phone !== "string") {
      return NextResponse.json(
        { error: "Номер телефона обязателен" },
        { status: 400 }
      );
    }

    const botUsername = process.env.TELEGRAM_BOT_USERNAME || "myunionpro_bot";

    // Создаем deep link для привязки
    // Формат: https://t.me/bot_username?start=AUTH_phone_79991234567
    const deepLink = `https://t.me/${botUsername}?start=AUTH_phone_${phone}`;

    console.log("[Telegram Link] Создана ссылка для привязки:", deepLink);

    return NextResponse.json({
      success: true,
      deepLink,
      botUsername,
    });
  } catch (error) {
    console.error("[Telegram Link] Ошибка создания ссылки:", error);
    return NextResponse.json(
      {
        error: "Ошибка создания ссылки",
        details: process.env.NODE_ENV === "development" 
          ? (error instanceof Error ? error.message : String(error)) 
          : undefined,
      },
      { status: 500 }
    );
  }
}

/**
 * GET /api/telegram/link/status
 * Проверяет, привязан ли Telegram к номеру телефона
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const phone = searchParams.get("phone");

    if (!phone) {
      return NextResponse.json(
        { error: "Номер телефона обязателен" },
        { status: 400 }
      );
    }

    const user = await prisma.user.findUnique({
      where: { phone },
      select: {
        id: true,
        telegramChatId: true,
        telegramUsername: true,
      },
    });

    if (!user) {
      return NextResponse.json(
        { error: "Пользователь не найден" },
        { status: 404 }
      );
    }

    return NextResponse.json({
      linked: !!user.telegramChatId,
      telegramUsername: user.telegramUsername,
    });
  } catch (error) {
    console.error("[Telegram Link] Ошибка проверки статуса:", error);
    return NextResponse.json(
      {
        error: "Ошибка проверки статуса",
        details: process.env.NODE_ENV === "development" 
          ? (error instanceof Error ? error.message : String(error)) 
          : undefined,
      },
      { status: 500 }
    );
  }
}

