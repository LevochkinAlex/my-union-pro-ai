import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";
import crypto from "crypto";

/**
 * POST /api/auth/invite
 * Обрабатывает инвайт-ссылку и завершает регистрацию председателя
 */
export async function POST(request: NextRequest) {
  try {
    const { token } = await request.json();

    if (!token) {
      return NextResponse.json(
        { error: "Токен приглашения обязателен" },
        { status: 400 }
      );
    }

    // Находим пользователя по токену
    const user = await prisma.user.findFirst({
      where: {
        resetToken: token,
        resetTokenExpires: {
          gte: new Date(),
        },
      },
      include: {
        organization: true,
      },
    });

    if (!user) {
      return NextResponse.json(
        { error: "Неверный или истекший токен приглашения" },
        { status: 400 }
      );
    }

    // Если email уже подтвержден, просто возвращаем успех
    if (user.emailVerified) {
      // Очищаем токен
      await prisma.user.update({
        where: { id: user.id },
        data: {
          resetToken: null,
          resetTokenExpires: null,
        },
      });

      return NextResponse.json({
        success: true,
        message: "Email уже подтвержден",
        user: {
          id: user.id,
          email: user.email,
        },
      });
    }

    // Генерируем новый временный пароль для первой авторизации
    const temporaryPassword = crypto.randomBytes(12).toString("base64").slice(0, 12);
    const hashedPassword = await bcrypt.hash(temporaryPassword, 10);

    // Обновляем пользователя: подтверждаем email, устанавливаем пароль
    const updatedUser = await prisma.user.update({
      where: { id: user.id },
      data: {
        emailVerified: new Date(),
        password: hashedPassword,
        resetToken: null,
        resetTokenExpires: null,
        membershipStatus: "APPROVED",
      },
    });

    return NextResponse.json({
      success: true,
      message: "Регистрация завершена",
      user: {
        id: updatedUser.id,
        email: updatedUser.email,
        firstName: updatedUser.firstName,
        lastName: updatedUser.lastName,
        role: updatedUser.role,
        organization: user.organization
          ? {
              id: user.organization.id,
              name: user.organization.name,
            }
          : null,
      },
      temporaryPassword, // Временный пароль для первой авторизации
    });
  } catch (error: any) {
    console.error("[auth/invite] Error:", error);
    return NextResponse.json(
      {
        error: "Ошибка при обработке приглашения",
        details: process.env.NODE_ENV === "development" ? error.message : undefined,
      },
      { status: 500 }
    );
  }
}

