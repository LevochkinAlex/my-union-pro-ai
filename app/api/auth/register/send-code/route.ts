import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendVerificationEmail } from "@/lib/email";
import crypto from "crypto";

export async function POST(request: NextRequest) {
  try {
    const { email } = await request.json();

    if (!email) {
      return NextResponse.json(
        { error: "Email обязателен" },
        { status: 400 }
      );
    }

    // Проверяем, существует ли уже пользователь с таким email
    const existingUser = await prisma.user.findUnique({
      where: { email },
    });

    if (existingUser && existingUser.emailVerified) {
      return NextResponse.json(
        { error: "Пользователь с таким email уже существует" },
        { status: 400 }
      );
    }

    // Генерируем 6-значный код
    const verificationToken = crypto.randomInt(100000, 999999).toString();
    const verificationExpires = new Date(Date.now() + 10 * 60 * 1000); // 10 минут

    // Создаем или обновляем пользователя
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

    // Отправляем email с кодом
    await sendVerificationEmail(email, verificationToken);

    return NextResponse.json({
      success: true,
      message: "Код подтверждения отправлен на ваш email",
    });
  } catch (error) {
    console.error("Registration error:", error);
    return NextResponse.json(
      { error: "Ошибка при отправке кода" },
      { status: 500 }
    );
  }
}


