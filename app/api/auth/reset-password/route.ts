import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";

export async function POST(request: NextRequest) {
  try {
    const { token, password } = await request.json();

    if (!token || !password) {
      return NextResponse.json(
        { error: "Токен и пароль обязательны" },
        { status: 400 }
      );
    }

    if (password.length < 8) {
      return NextResponse.json(
        { error: "Пароль должен содержать минимум 8 символов" },
        { status: 400 }
      );
    }

    // Находим пользователя по токену
    const user = await prisma.user.findUnique({
      where: { resetToken: token },
    });

    if (!user || !user.resetTokenExpires || user.resetTokenExpires < new Date()) {
      return NextResponse.json(
        { error: "Неверный или истекший токен" },
        { status: 400 }
      );
    }

    // Хешируем новый пароль
    const hashedPassword = await bcrypt.hash(password, 10);

    // Обновляем пароль и очищаем токен
    await prisma.user.update({
      where: { id: user.id },
      data: {
        password: hashedPassword,
        resetToken: null,
        resetTokenExpires: null,
      },
    });

    return NextResponse.json({
      success: true,
      message: "Пароль успешно изменен",
    });
  } catch (error) {
    console.error("Reset password error:", error);
    return NextResponse.json(
      { error: "Ошибка при сбросе пароля" },
      { status: 500 }
    );
  }
}

