import { NextRequest, NextResponse } from "next/server";
import { prisma, isDatabaseUnavailableError } from "@/lib/prisma";
import crypto from "crypto";
import bcrypt from "bcryptjs";
import { sendMagicLinkEmail } from "@/lib/email";

/**
 * Генерирует 6-значный PIN-код (криптостойкий).
 * Диапазон: 100000..999999 (всегда ровно 6 цифр).
 */
function generateEmailPin(): string {
  // 900000 вариантов (100000..999999), первая цифра гарантированно не 0
  const n = 100000 + crypto.randomInt(0, 900000);
  return String(n);
}

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
    let pin: string = generateEmailPin();
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

      // Гасим предыдущие не-использованные коды этого пользователя, чтобы был только один активный PIN.
      // Без этого старый PIN мог бы тоже подойти, и это было бы менее безопасно.
      await prisma.loginToken.updateMany({
        where: {
          userId: user.id,
          used: false,
        },
        data: { used: true, usedAt: new Date() },
      });

      // Создаём одноразовый токен (для magic-ссылки) + 6-значный PIN (для ввода на сайте).
      token = crypto.randomBytes(32).toString("hex");
      const pinHash = await bcrypt.hash(pin, 10);
      const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 минут

      await prisma.loginToken.create({
        data: {
          token,
          pinHash,
          attempts: 0,
          userId: user.id,
          expiresAt,
        },
      });

      console.log("[Email Auth] Токен+PIN созданы, отправляем email");
    } catch (dbError) {
      // В режиме разработки - продолжаем без БД
      if (isDevMode()) {
        console.warn("[Email Auth] ⚠️ БД недоступна, работаем в DEV режиме без БД");
        dbAvailable = false;
        isNewUser = true;
        // Генерируем dev токен и оставляем сгенерированный PIN
        token = `dev_${crypto.randomBytes(16).toString("hex")}`;
      } else if (isDatabaseUnavailableError(dbError)) {
        console.error("[Email Auth] БД недоступна (продакшен):", dbError);
        return NextResponse.json(
          {
            success: false,
            error: "Сервис временно недоступен. Попробуйте позже.",
            code: "DB_UNAVAILABLE",
          },
          { status: 503 },
        );
      } else {
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
    // ВАЖНО:
    // Токен передаём в query (?token=...). Яндекс.Почта/часть почтовых сервисов
    // оборачивают ссылки собственным редиректором и теряют hash-фрагмент,
    // поэтому #hash здесь НЕ подходит.
    // Защита от "сгорания" ссылки обеспечивается тем, что GET /auth/email/success
    // ничего сам не делает — вход по токену выполняется только по явному клику
    // пользователя (POST на NextAuth), которого не делают preview-боты.
    const magicLink = `${baseUrl}/auth/email/success?token=${token}`;

    const emailSent = await sendMagicLinkEmail(
      normalizedEmail,
      magicLink,
      isNewUser,
      user?.firstName || undefined,
      pin,
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

    // Формируем ответ.
    // Клиент должен показать поле ввода 6-значного кода; email кладём на клиент для последующего signIn("email-pin").
    const response: {
      success: boolean;
      message: string;
      isNewUser: boolean;
      email: string;
      pinRequired: boolean;
      pinLength: number;
      expiresInSec: number;
      devMode?: boolean;
      magicLink?: string;
      devPin?: string;
      dbAvailable?: boolean;
    } = {
      success: true,
      message: emailActuallySent
        ? "Мы отправили 6-значный код и ссылку на ваш email"
        : "SMTP не настроен — используйте код или ссылку ниже",
      isNewUser,
      email: normalizedEmail,
      pinRequired: true,
      pinLength: 6,
      expiresInSec: 5 * 60,
    };

    // Добавляем magic link + PIN, когда письмо не отправлено (dev, SMTP не настроен)
    if (emailLibDevMode || isDevMode()) {
      response.devMode = true;
      response.magicLink = magicLink;
      response.devPin = pin;
      response.dbAvailable = dbAvailable;

      console.log("\n" + "🔗".repeat(30));
      console.log("🚀 [DEV MODE] КОД + MAGIC LINK ДЛЯ АВТОРИЗАЦИИ:");
      console.log("🔗".repeat(30));
      console.log("📧 Email:", normalizedEmail);
      console.log("🗄️ DB Available:", dbAvailable);
      console.log("🔢 PIN:", pin);
      console.log("🔐 Magic Link:");
      console.log("\n  👉 " + magicLink + "\n");
      console.log("🔗".repeat(30) + "\n");
    }

    return NextResponse.json(response);
  } catch (error) {
    console.error("[Email Auth] Ошибка:", error);
    if (isDatabaseUnavailableError(error)) {
      return NextResponse.json(
        {
          success: false,
          error: "Сервис временно недоступен. Попробуйте позже.",
          code: "DB_UNAVAILABLE",
        },
        { status: 503 }
      );
    }
    return NextResponse.json(
      {
        success: false,
        error:
          "Не удалось выполнить вход по почте (сохранение кода или отправка письма). Попробуйте позже.",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}

