import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * Проверяет, включен ли режим разработки
 */
function isDevMode(): boolean {
  return process.env.NODE_ENV === "development" || process.env.DEV_EMAIL_MODE === "true";
}

/**
 * GET /api/auth/email/verify
 * 
 * Проверяет magic link токен и авторизует пользователя
 * В режиме разработки поддерживает dev_ токены без БД
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const token = searchParams.get("token");

    // Определяем правильный baseUrl: в продакшене приоритет у хоста из запроса,
    // чтобы редирект по ссылке из письма всегда вёл на тот же домен
    const host = request.headers.get("host") || "";
    const isLocalHost = host.includes("localhost") || host.includes("127.0.0.1");
    const baseUrl = !isLocalHost && host
      ? `https://${host}`
      : (process.env.NEXT_PUBLIC_APP_URL ||
         process.env.NEXTAUTH_URL ||
         (isLocalHost ? `http://${host}` : "https://myunion.pro"));

    console.log("[Email Verify] Попытка верификации токена:", token ? token.substring(0, 10) + "..." : "отсутствует");
    console.log("[Email Verify] Base URL:", baseUrl);
    console.log("[Email Verify] Dev Mode:", isDevMode());

    if (!token) {
      return NextResponse.redirect(
        new URL("/login?error=missing_token", baseUrl)
      );
    }

    // В режиме разработки с dev_ токенами - сразу редиректим на успех
    if (isDevMode() && token.startsWith("dev_")) {
      console.log("[Email Verify] ✅ DEV токен обнаружен, пропускаем проверку БД");
      return NextResponse.redirect(
        new URL(`/auth/email/success?token=${token}&devMode=true`, baseUrl)
      );
    }

    // Для обычных токенов - проверяем в БД
    try {
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
    } catch (dbError) {
      // В режиме разработки, если БД недоступна - пропускаем
      if (isDevMode()) {
        console.warn("[Email Verify] ⚠️ БД недоступна в DEV режиме, пропускаем проверку");
        return NextResponse.redirect(
          new URL(`/auth/email/success?token=${token}&devMode=true`, baseUrl)
        );
      }
      throw dbError;
    }
  } catch (error) {
    console.error("[Email Verify] Ошибка:", error);
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 
                    (process.env.NEXTAUTH_URL || "https://myunion.pro").replace(/^http:/, "https:");
    return NextResponse.redirect(
      new URL("/login?error=server_error", baseUrl)
    );
  }
}

