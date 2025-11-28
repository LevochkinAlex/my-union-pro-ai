import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * GET /api/auth/email/verify
 * 
 * Проверяет magic link токен и авторизует пользователя
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const token = searchParams.get("token");

    console.log("[Email Verify] Попытка верификации токена:", token ? "****" : "отсутствует");

    if (!token) {
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
      console.error("[Email Verify] Токен не найден");
      return NextResponse.redirect(
        new URL("/login?error=invalid_token", request.url)
      );
    }

    // Проверяем срок действия
    if (loginToken.expiresAt < new Date()) {
      console.error("[Email Verify] Токен истек");
      return NextResponse.redirect(
        new URL("/login?error=token_expired", request.url)
      );
    }

    // Проверяем, не был ли токен уже использован
    if (loginToken.used) {
      console.error("[Email Verify] Токен уже использован");
      return NextResponse.redirect(
        new URL("/login?error=token_used", request.url)
      );
    }

    console.log("[Email Verify] Токен валиден, редиректим для входа");

    // Редиректим на страницу успешной авторизации
    // NextAuth обработает токен и авторизует пользователя
    return NextResponse.redirect(
      new URL(`/auth/email/success?token=${token}`, request.url)
    );
  } catch (error) {
    console.error("[Email Verify] Ошибка:", error);
    return NextResponse.redirect(
      new URL("/login?error=server_error", request.url)
    );
  }
}

