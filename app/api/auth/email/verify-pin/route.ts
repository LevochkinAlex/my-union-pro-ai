import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { verifyEmailPin } from "@/lib/email-pin";
import { prisma } from "@/lib/prisma";

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    const { email, pin } = await request.json();

    if (!email || !pin) {
      return NextResponse.json(
        { error: "Email и PIN обязательны" },
        { status: 400 }
      );
    }

    console.log("[Verify Email PIN] Проверка PIN для email:", email);

    // Проверяем PIN-код
    const result = await verifyEmailPin(email, pin);

    if (!result.valid) {
      return NextResponse.json(
        { error: result.error || "Неверный код" },
        { status: 400 }
      );
    }

    // Если пользователь авторизован, обновляем его email и помечаем как подтвержденный
    if (session?.user?.id) {
      await prisma.user.update({
        where: { id: session.user.id },
        data: {
          email: email,
          emailVerified: new Date(),
        },
      });

      console.log("[Verify Email PIN] ✅ Email подтвержден для пользователя:", session.user.id);

      return NextResponse.json({
        success: true,
        message: "Email успешно подтвержден",
        emailVerified: true,
      });
    }

    // Если пользователь не авторизован, просто возвращаем успех
    // (это может быть часть процесса регистрации)
    return NextResponse.json({
      success: true,
      message: "Код подтвержден",
    });
  } catch (error) {
    console.error("[Verify Email PIN] Ошибка:", error);
    return NextResponse.json(
      { error: "Внутренняя ошибка сервера" },
      { status: 500 }
    );
  }
}

