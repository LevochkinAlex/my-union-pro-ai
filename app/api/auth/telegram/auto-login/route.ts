import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * GET /api/auth/telegram/auto-login
 * 
 * Автоматический вход пользователя по одноразовому токену из Telegram
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const token = searchParams.get("token");

    console.log("[Telegram Auto-Login] Попытка входа с токеном:", token ? "****" : "отсутствует");

    if (!token) {
      console.error("[Telegram Auto-Login] Токен не предоставлен");
      return NextResponse.redirect(
        new URL("/login?error=missing_token", request.url)
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
        new URL("/login?error=invalid_token", request.url)
      );
    }

    // Проверяем, не истек ли токен
    if (loginToken.expiresAt < new Date()) {
      console.error("[Telegram Auto-Login] Токен истек:", {
        expiresAt: loginToken.expiresAt,
        now: new Date(),
      });

      return NextResponse.redirect(
        new URL("/login?error=token_expired", request.url)
      );
    }

    // Проверяем, не был ли токен уже использован
    if (loginToken.used) {
      console.error("[Telegram Auto-Login] Токен уже был использован");
      return NextResponse.redirect(
        new URL("/login?error=token_used", request.url)
      );
    }

    console.log("[Telegram Auto-Login] Токен валиден, пользователь:", loginToken.user.id);

    // Редиректим на страницу успешной авторизации с токеном для NextAuth
    // NextAuth сам пометит токен как использованный
    return NextResponse.redirect(
      new URL(`/auth/telegram/success?token=${token}`, request.url)
    );
  } catch (error) {
    console.error("[Telegram Auto-Login] Ошибка:", error);
    return NextResponse.redirect(
      new URL("/login?error=server_error", request.url)
    );
  }
}

