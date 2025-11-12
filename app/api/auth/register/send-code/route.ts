import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendVerificationEmail } from "@/lib/email";
import crypto from "crypto";

export async function POST(request: NextRequest) {
  try {
    const { email } = await request.json();

    if (!email || typeof email !== "string") {
      return NextResponse.json(
        { error: "Email обязателен" },
        { status: 400 }
      );
    }

    console.log("[register] Начало регистрации для email:", email);

    // Проверяем, существует ли уже пользователь с таким email
    let existingUser;
    try {
      existingUser = await prisma.user.findUnique({
        where: { email },
      });
    } catch (dbError) {
      console.error("[register] Ошибка при проверке пользователя:", dbError);
      throw dbError;
    }

    if (existingUser && existingUser.emailVerified) {
      return NextResponse.json(
        { error: "Пользователь с таким email уже существует" },
        { status: 400 }
      );
    }

    // Генерируем 6-значный код
    const verificationToken = crypto.randomInt(100000, 999999).toString();
    const verificationExpires = new Date(Date.now() + 10 * 60 * 1000); // 10 минут

    console.log("[register] Сгенерирован код для:", email, "код:", verificationToken);

    // Создаем или обновляем пользователя
    try {
      await prisma.user.upsert({
        where: { email },
        create: {
          email,
          verificationToken,
          verificationExpires,
        },
        update: {
          verificationToken,
          verificationExpires,
        },
      });
      console.log("[register] Пользователь создан/обновлен в БД");
    } catch (dbError) {
      console.error("[register] Ошибка при сохранении пользователя:", dbError);
      throw dbError;
    }

    // Отправляем email с кодом (не блокируем регистрацию при ошибке)
    let emailResult;
    try {
      emailResult = await sendVerificationEmail(email, verificationToken);
      console.log("[register] Результат отправки email:", emailResult);
    } catch (emailError) {
      console.error("[register] Ошибка при отправке email:", emailError);
      emailResult = {
        sent: false,
        error: emailError instanceof Error ? emailError.message : String(emailError),
      };
    }

    return NextResponse.json({
      success: true,
      message: "Код подтверждения отправлен на ваш email",
      emailSent: emailResult.sent,
      emailFallback: emailResult.fallback ?? false,
      emailError: emailResult.error ?? null,
    });
  } catch (error) {
    console.error("[register] Критическая ошибка:", error);
    console.error("[register] Stack trace:", error instanceof Error ? error.stack : "No stack");
    return NextResponse.json(
      { 
        error: "Ошибка при отправке кода",
        details: process.env.NODE_ENV === "development" ? (error instanceof Error ? error.message : String(error)) : undefined
      },
      { status: 500 }
    );
  }
}


