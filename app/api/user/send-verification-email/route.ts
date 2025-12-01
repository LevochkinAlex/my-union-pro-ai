import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import crypto from "crypto";
import { sendEmail } from "@/lib/email";

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json(
        { error: "Не авторизован" },
        { status: 401 }
      );
    }

    const { email } = await request.json();

    if (!email) {
      return NextResponse.json(
        { error: "Email обязателен" },
        { status: 400 }
      );
    }

    // Проверяем формат email
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return NextResponse.json(
        { error: "Некорректный формат email" },
        { status: 400 }
      );
    }

    // Проверяем, не занят ли email другим пользователем
    const existingUser = await prisma.user.findFirst({
      where: {
        email,
        id: { not: session.user.id },
      },
    });

    if (existingUser) {
      return NextResponse.json(
        { error: "Этот email уже используется другим пользователем" },
        { status: 400 }
      );
    }

    // Генерируем токен верификации
    const verificationToken = crypto.randomBytes(32).toString("hex");
    const verificationExpires = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 часа

    // Обновляем пользователя
    const user = await prisma.user.update({
      where: { id: session.user.id },
      data: {
        email,
        emailVerified: null, // Сбрасываем верификацию
        verificationToken,
        verificationExpires,
      },
    });

    // ПИСЬМО С КНОПКОЙ НЕ ОТПРАВЛЯЕМ - пользователь подтверждает email через PIN код
    // Токен сохраняется на случай, если понадобится в будущем
    console.log("[send-verification-email] Email saved, verification should be done via PIN code");
    
    return NextResponse.json({
      success: true,
      message: "Email сохранен. Используйте поле валидации для подтверждения через PIN код.",
    });
  } catch (error) {
    console.error("[send-verification-email] Error:", error);
    return NextResponse.json(
      { error: "Ошибка при отправке письма" },
      { status: 500 }
    );
  }
}

