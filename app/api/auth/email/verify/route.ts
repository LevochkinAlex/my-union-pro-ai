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

    // Определяем правильный baseUrl
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 
                    process.env.NEXTAUTH_URL || 
                    (request.headers.get("host")?.includes("localhost") 
                      ? `http://${request.headers.get("host")}` 
                      : `https://${request.headers.get("host") || "myunion.pro"}`);

    console.log("[Email Verify] Попытка верификации токена:", token ? "****" : "отсутствует");
    console.log("[Email Verify] Base URL:", baseUrl);

    if (!token) {
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
      console.error("[Email Verify] Токен не найден");
      return NextResponse.redirect(
        new URL("/login?error=invalid_token", baseUrl)
      );
    }

    // Проверяем срок действия
    if (loginToken.expiresAt < new Date()) {
      console.error("[Email Verify] Токен истек");
      return NextResponse.redirect(
        new URL("/login?error=token_expired", baseUrl)
      );
    }

    // Проверяем, не был ли токен уже использован
    if (loginToken.used) {
      console.error("[Email Verify] Токен уже использован");
      return NextResponse.redirect(
        new URL("/login?error=token_used", baseUrl)
      );
    }

    console.log("[Email Verify] Токен валиден, редиректим для входа");

    // Редиректим на страницу успешной авторизации
    // NextAuth обработает токен и авторизует пользователя
    return NextResponse.redirect(
      new URL(`/auth/email/success?token=${token}`, baseUrl)
    );
  } catch (error) {
    console.error("[Email Verify] Ошибка:", error);
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 
                    (process.env.NEXTAUTH_URL || "https://myunion.pro").replace(/^http:/, "https:");
    return NextResponse.redirect(
      new URL("/login?error=server_error", baseUrl)
    );
  }
}

