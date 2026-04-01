import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import crypto from "crypto";
import { sendMagicLinkEmail } from "@/lib/email";

/**
 * Проверяет, включен ли режим разработки
 */
function isDevMode(): boolean {
  return process.env.NODE_ENV === "development" || process.env.DEV_EMAIL_MODE === "true";
}

/**
 * POST /api/auth/email/send-magic-link
 * 
 * Отправляет magic link на email для авторизации/регистрации
 * Работает как для новых, так и для существующих пользователей (как Framer)
 * 
 * В режиме разработки, если БД недоступна, возвращает dev magic link
 */
export async function POST(request: NextRequest) {
  try {
    const { email } = await request.json();

    if (!email || typeof email !== "string") {
      return NextResponse.json(
        { success: false, error: "Email обязателен" },
        { status: 400 }
      );
    }

    // Валидация email
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return NextResponse.json(
        { success: false, error: "Неверный формат email" },
        { status: 400 }
      );
    }

    const normalizedEmail = email.toLowerCase().trim();

    console.log("[Email Auth] Запрос magic link для:", normalizedEmail);

    // Переменные для работы с пользователем
    let user: { id: string; firstName?: string | null } | null = null;
    let isNewUser = false;
    let token: string;
    let dbAvailable = true;

    // Пробуем работать с БД
    try {
      // Ищем существующего пользователя
      user = await prisma.user.findUnique({
        where: { email: normalizedEmail },
        select: { id: true, firstName: true },
      });

      isNewUser = !user;

      if (!user) {
        console.log("[Email Auth] Пользователь не найден — вход только для зарегистрированных");
        return NextResponse.json(
          {
            success: false,
            error:
              "Аккаунт с таким email не найден. Зарегистрируйтесь на странице «Регистрация».",
            code: "USER_NOT_FOUND",
          },
          { status: 404 },
        );
      }

      console.log("[Email Auth] Пользователь найден:", user.id);

      // Создаем одноразовый токен
      token = crypto.randomBytes(32).toString("hex");
      const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 минут

      await prisma.loginToken.create({
        data: {
          token,
          userId: user.id,
          expiresAt,
        },
      });

      console.log("[Email Auth] Токен создан, отправляем email");
    } catch (dbError) {
      // В режиме разработки - продолжаем без БД
      if (isDevMode()) {
        console.warn("[Email Auth] ⚠️ БД недоступна, работаем в DEV режиме без БД");
        dbAvailable = false;
        isNewUser = true;
        // Генерируем dev токен
        token = `dev_${crypto.randomBytes(16).toString("hex")}`;
      } else {
        // В продакшене - выбрасываем ошибку
        throw dbError;
      }
    }

    // Ссылка в письме всегда должна вести на публичный домен (продакшен).
    // На проде за прокси request.url часто приходит как localhost — используем env.
    const envUrl = process.env.NEXTAUTH_URL || process.env.NEXT_PUBLIC_APP_URL;
    const isEnvProduction =
      envUrl &&
      !envUrl.includes("localhost") &&
      !envUrl.includes("127.0.0.1");
    let baseUrl: string;
    if (isEnvProduction) {
      baseUrl = envUrl.replace(/^http:/, "https:");
    } else {
      try {
        const requestOrigin = new URL(request.url).origin;
        if (requestOrigin.includes("localhost") || requestOrigin.includes("127.0.0.1")) {
          baseUrl = requestOrigin;
        } else {
          baseUrl = requestOrigin.replace(/^http:/, "https:");
        }
      } catch {
        baseUrl = "https://myunion.pro";
      }
    }
    if (!baseUrl.includes("localhost") && !baseUrl.includes("127.0.0.1")) {
      baseUrl = baseUrl.replace(/^http:/, "https:");
    }
    const magicLink = `${baseUrl}/api/auth/email/verify?token=${token}`;

    const emailSent = await sendMagicLinkEmail(
      normalizedEmail,
      magicLink,
      isNewUser,
      user?.firstName || undefined
    );

    // Если письмо не отправлено, но есть magicLink (dev/SMTP off) — всё ок
    if (!emailSent.success && !(emailSent as { devMode?: boolean }).devMode) {
      console.error("[Email Auth] Ошибка отправки email:", emailSent.error);
      return NextResponse.json(
        {
          success: false,
          error: "Не удалось отправить письмо. Попробуйте позже.",
          details: emailSent.error,
        },
        { status: 500 }
      );
    }

    const emailActuallySent = emailSent.success;
    const emailLibDevMode = !!(emailSent as { devMode?: boolean }).devMode;

    console.log("[Email Auth]", emailActuallySent ? "Email отправлен" : "Режим без отправки (показываем ссылку)");

    // Формируем ответ
    const response: {
      success: boolean;
      message: string;
      isNewUser: boolean;
      devMode?: boolean;
      magicLink?: string;
      dbAvailable?: boolean;
    } = {
      success: true,
      message: emailActuallySent
        ? "Письмо с ссылкой для входа отправлено на ваш email"
        : "Используйте ссылку ниже для входа (SMTP не настроен)",
      isNewUser,
    };

    // Добавляем magic link, когда письмо не отправлено (dev, SMTP не настроен)
    if (emailLibDevMode || isDevMode()) {
      response.devMode = true;
      response.magicLink = magicLink;
      response.dbAvailable = dbAvailable;
      
      console.log("\n" + "🔗".repeat(30));
      console.log("🚀 [DEV MODE] MAGIC LINK ДЛЯ АВТОРИЗАЦИИ:");
      console.log("🔗".repeat(30));
      console.log("📧 Email:", normalizedEmail);
      console.log("🗄️ DB Available:", dbAvailable);
      console.log("🔐 Magic Link:");
      console.log("\n  👉 " + magicLink + "\n");
      console.log("🔗".repeat(30) + "\n");
    }

    return NextResponse.json(response);
  } catch (error) {
    console.error("[Email Auth] Ошибка:", error);
    return NextResponse.json(
      {
        success: false,
        error: "Произошла ошибка при отправке письма",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}

