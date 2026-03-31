import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { scheduleSyncBestBenefitsIfEligible } from "@/lib/best-benefits-sync-eligible";
import { EMAIL_NEEDS_NAME_MESSAGE } from "@/lib/email-verification-requirements";

export async function POST(request: NextRequest) {
  try {
    const { token } = await request.json();

    if (!token) {
      return NextResponse.json(
        { error: "Токен верификации обязателен" },
        { status: 400 }
      );
    }

    // Находим пользователя по токену
    const user = await prisma.user.findFirst({
      where: {
        verificationToken: token,
        verificationExpires: {
          gt: new Date(), // Токен не истек
        },
      },
    });

    if (!user) {
      return NextResponse.json(
        { error: "Неверный или истекший токен верификации" },
        { status: 400 }
      );
    }

    // Проверяем, не подтвержден ли уже email
    if (user.emailVerified) {
      return NextResponse.json({
        success: true,
        message: "Email уже подтвержден",
        alreadyVerified: true,
      });
    }

    if (!user.firstName?.trim() || !user.lastName?.trim()) {
      return NextResponse.json(
        { error: EMAIL_NEEDS_NAME_MESSAGE, code: "PROFILE_NEEDS_NAME" },
        { status: 400 },
      );
    }

    // Подтверждаем email
    const updatedUser = await prisma.user.update({
      where: { id: user.id },
      data: {
        emailVerified: new Date(),
        verificationToken: null,
        verificationExpires: null,
      },
    });

    console.log("[verify-email] Email verified for user:", user.id, user.email);

    scheduleSyncBestBenefitsIfEligible(updatedUser.id, "verify-email-token");

    return NextResponse.json({
      success: true,
      message: "Email успешно подтвержден",
    });
  } catch (error) {
    console.error("[verify-email] Error:", error);
    return NextResponse.json(
      { error: "Ошибка при верификации email" },
      { status: 500 }
    );
  }
}

