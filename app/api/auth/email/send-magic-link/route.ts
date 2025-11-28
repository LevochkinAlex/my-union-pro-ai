import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import crypto from "crypto";
import { sendMagicLinkEmail } from "@/lib/email";

/**
 * POST /api/auth/email/send-magic-link
 * 
 * Отправляет magic link на email для авторизации/регистрации
 * Работает как для новых, так и для существующих пользователей (как Framer)
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

    // Ищем существующего пользователя
    let user = await prisma.user.findUnique({
      where: { email: normalizedEmail },
    });

    const isNewUser = !user;

    if (!user) {
      // Создаем нового пользователя
      console.log("[Email Auth] Создаем нового пользователя");
      user = await prisma.user.create({
        data: {
          email: normalizedEmail,
          role: "PENDING_MEMBER",
          membershipStatus: "PROFILE_INCOMPLETE",
        },
      });
      console.log("[Email Auth] Новый пользователь создан:", user.id);
    } else {
      console.log("[Email Auth] Пользователь найден:", user.id);
    }

    // Создаем одноразовый токен
    const token = crypto.randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 минут

    await prisma.loginToken.create({
      data: {
        token,
        userId: user.id,
        expiresAt,
      },
    });

    console.log("[Email Auth] Токен создан, отправляем email");

    // Отправляем magic link на email
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://myunion.pro";
    const magicLink = `${baseUrl}/api/auth/email/verify?token=${token}`;

    const emailSent = await sendMagicLinkEmail(
      normalizedEmail,
      magicLink,
      isNewUser,
      user.firstName || undefined
    );

    if (!emailSent.success) {
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

    console.log("[Email Auth] Email успешно отправлен");

    return NextResponse.json({
      success: true,
      message: "Письмо с ссылкой для входа отправлено на ваш email",
      isNewUser,
    });
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

