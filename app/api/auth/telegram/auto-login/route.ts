import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * GET /api/auth/telegram/auto-login
 * 
 * Автоматический вход пользователя по одноразовому токену из Telegram
 */
export async function GET(request: NextRequest) {
  // Определяем правильный baseUrl для редиректов В НАЧАЛЕ
  const host = request.headers.get("host") || "localhost:3000";
  const isLocalhost = host.includes("localhost") || host.includes("127.0.0.1");
  
  let baseUrl: string;
  if (process.env.NEXTAUTH_URL) {
    baseUrl = process.env.NEXTAUTH_URL;
  } else if (process.env.NEXT_PUBLIC_APP_URL) {
    baseUrl = process.env.NEXT_PUBLIC_APP_URL;
  } else if (isLocalhost) {
    // Для localhost всегда http
    baseUrl = `http://${host}`;
  } else {
    // Для продакшена определяем по заголовкам
    const proto = request.headers.get("x-forwarded-proto") || "https";
    baseUrl = `${proto}://${host}`;
  }

  try {
    const { searchParams } = new URL(request.url);
    const token = searchParams.get("token");

    console.log("[Telegram Auto-Login] Попытка входа с токеном:", token ? "****" : "отсутствует");
    console.log("[Telegram Auto-Login] BaseUrl:", baseUrl);

    if (!token) {
      console.error("[Telegram Auto-Login] Токен не предоставлен");
      return NextResponse.redirect(
        new URL("/login?error=missing_token", baseUrl)
      );
    }

    // Ищем токен в базе данных
    const loginToken = await prisma.loginToken.findUnique({
      where: { token },
      include: { user: true },
    });

    if (!loginToken) {
      console.error("[Telegram Auto-Login] Токен не найден в БД");
      return NextResponse.redirect(
        new URL("/login?error=invalid_token", baseUrl)
      );
    }

    // Проверяем, не истек ли токен
    if (loginToken.expiresAt < new Date()) {
      console.error("[Telegram Auto-Login] Токен истек:", {
        expiresAt: loginToken.expiresAt,
        now: new Date(),
      });

      return NextResponse.redirect(
        new URL("/login?error=token_expired", baseUrl)
      );
    }

    // Проверяем, не был ли токен уже использован
    if (loginToken.used) {
      console.error("[Telegram Auto-Login] Токен уже был использован");
      return NextResponse.redirect(
        new URL("/login?error=token_used", baseUrl)
      );
    }

    console.log("[Telegram Auto-Login] Токен валиден, пользователь:", loginToken.user.id);

    // Редиректим на страницу успешной авторизации с токеном для NextAuth
    // NextAuth сам пометит токен как использованный
    return NextResponse.redirect(
      new URL(`/auth/telegram/success?token=${token}`, baseUrl)
    );
  } catch (error) {
    console.error("[Telegram Auto-Login] Ошибка:", error);
    return NextResponse.redirect(
      new URL("/login?error=server_error", baseUrl)
    );
  }
}

