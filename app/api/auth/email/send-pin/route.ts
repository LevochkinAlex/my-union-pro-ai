import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { sendEmailPin } from "@/lib/email-pin";
import { prisma } from "@/lib/prisma";
import { ensureNamesBeforeEmailVerification } from "@/lib/email-verification-requirements";

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    const body = await request.json();
    const { email, firstName, lastName } = body as {
      email?: string;
      firstName?: string | null;
      lastName?: string | null;
    };

    if (!email) {
      return NextResponse.json(
        { error: "Email не указан" },
        { status: 400 }
      );
    }

    // Валидация email
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return NextResponse.json(
        { error: "Некорректный email адрес" },
        { status: 400 }
      );
    }

    console.log("[Send Email PIN] Запрос для email:", email);

    // Проверяем не используется ли email другим пользователем
    if (session?.user?.id) {
      const existingUserWithEmail = await prisma.user.findFirst({
        where: {
          email: email,
          id: { not: session.user.id },
        },
      });

      if (existingUserWithEmail) {
        return NextResponse.json(
          { error: "Этот email уже используется другим пользователем" },
          { status: 400 }
        );
      }

      const nameCheck = await ensureNamesBeforeEmailVerification(session.user.id, {
        firstName,
        lastName,
      });
      if (nameCheck.ok === false) {
        return NextResponse.json(
          { error: nameCheck.error, code: nameCheck.code },
          { status: 400 },
        );
      }
    } else {
      // Если пользователь не авторизован, проверяем просто существование email
      const existingUser = await prisma.user.findFirst({
        where: { email },
      });

      if (existingUser) {
        // Email уже зарегистрирован, но для безопасности не сообщаем об этом
        console.log("[Send Email PIN] Email уже зарегистрирован:", email);
      }
    }

    // Проверяем настройки SMTP перед отправкой
    if (!process.env.SMTP_HOST || !process.env.SMTP_USER || !process.env.SMTP_PASSWORD) {
      console.error("[Send Email PIN] ❌ SMTP настройки не установлены");
      return NextResponse.json(
        { error: "Сервис отправки email временно недоступен. Обратитесь в поддержку." },
        { status: 503 }
      );
    }

    // Отправляем PIN-код
    console.log("[Send Email PIN] Отправка PIN-кода на email:", email);
    const result = await sendEmailPin(email, session?.user?.id);

    if (!result.success) {
      console.error("[Send Email PIN] ❌ Ошибка отправки:", result.error);
      return NextResponse.json(
        { 
          error: result.error || "Не удалось отправить код",
          details: process.env.NODE_ENV === "development" ? result.error : undefined,
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: "Код подтверждения отправлен на email",
    });
  } catch (error) {
    console.error("[Send Email PIN] Ошибка:", error);
    return NextResponse.json(
      { error: "Внутренняя ошибка сервера" },
      { status: 500 }
    );
  }
}

