import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { verifyEmailPin } from "@/lib/email-pin";
import { prisma } from "@/lib/prisma";
import { scheduleSyncBestBenefitsIfEligible } from "@/lib/best-benefits-sync-eligible";
import { ensureNamesBeforeEmailVerification } from "@/lib/email-verification-requirements";

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    const body = await request.json();
    const { email, pin, firstName, lastName } = body as {
      email?: string;
      pin?: string;
      firstName?: string | null;
      lastName?: string | null;
    };

    if (!email || !pin) {
      return NextResponse.json(
        { error: "Email и PIN обязательны" },
        { status: 400 }
      );
    }

    console.log("[Verify Email PIN] Проверка PIN для email:", email);

    // ФИО должны быть до проверки PIN (код помечается использованным при успехе)
    if (session?.user?.id) {
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
    }

    // Проверяем PIN-код
    const result = await verifyEmailPin(email, pin);

    if (!result.valid) {
      return NextResponse.json(
        { error: result.error || "Неверный код" },
        { status: 400 }
      );
    }

    // Если пользователь авторизован, проверяем: не привязан ли этот email уже к другому аккаунту
    if (session?.user?.id) {
      const emailNorm = String(email).trim().toLowerCase();
      const otherUser = await prisma.user.findFirst({
        where: {
          email: { equals: emailNorm, mode: "insensitive" },
          id: { not: session.user.id },
        },
        select: { id: true, firstName: true, lastName: true, email: true },
      });
      if (otherUser) {
        return NextResponse.json(
          {
            error: "Этот email уже привязан к другому аккаунту. Объедините аккаунты в настройках или обратитесь в поддержку.",
            code: "EMAIL_ALREADY_USED",
            existingUserId: otherUser.id,
          },
          { status: 409 }
        );
      }

      const updatedUser = await prisma.user.update({
        where: { id: session.user.id },
        data: {
          email: email,
          emailVerified: new Date(),
        },
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          bestBenefitsUserId: true,
          bestBenefitsPassword: true,
        },
      });

      console.log("[Verify Email PIN] ✅ Email подтвержден для пользователя:", session.user.id);

      // BestBenefits: при наличии ФИО — создаём сразу; иначе — после сохранения профиля (см. /api/profile PUT)
      scheduleSyncBestBenefitsIfEligible(updatedUser.id, "verify-pin");

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

