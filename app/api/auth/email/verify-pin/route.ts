import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { verifyEmailPin } from "@/lib/email-pin";
import { prisma } from "@/lib/prisma";
import { syncUserToBestBenefits } from "@/lib/best-benefits-users";
import { decryptPassword, encryptPassword } from "@/lib/best-benefits-password";
import crypto from "crypto";

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

      // Создаем аккаунт BestBenefits только если:
      // 1. Email подтвержден
      // 2. Есть firstName и lastName (профиль заполнен)
      // 3. Аккаунт BestBenefits еще не создан
      if (
        process.env.USE_REAL_BB_API === "true" &&
        updatedUser.firstName &&
        updatedUser.lastName &&
        updatedUser.email &&
        !updatedUser.bestBenefitsUserId
      ) {
        console.log("[Verify Email PIN] Creating BestBenefits account for verified email...");

        try {
          // Генерируем или используем сохраненный пароль
          let bbPassword: string;
          
          if (updatedUser.bestBenefitsPassword) {
            try {
              bbPassword = decryptPassword(updatedUser.bestBenefitsPassword);
              console.log("[Verify Email PIN] Using saved password for BestBenefits");
            } catch (error) {
              console.error("[Verify Email PIN] Failed to decrypt password, generating new:", error);
              bbPassword = crypto.randomBytes(12).toString("base64").slice(0, 12);
              // Сохраняем новый пароль
              const encryptedBbPassword = encryptPassword(bbPassword);
              await prisma.user.update({
                where: { id: updatedUser.id },
                data: { bestBenefitsPassword: encryptedBbPassword },
              });
            }
          } else {
            console.log("[Verify Email PIN] Generating new password for BestBenefits");
            bbPassword = crypto.randomBytes(12).toString("base64").slice(0, 12);
            // Сохраняем пароль
            const encryptedBbPassword = encryptPassword(bbPassword);
            await prisma.user.update({
              where: { id: updatedUser.id },
              data: { bestBenefitsPassword: encryptedBbPassword },
            });
          }

          // Создаем аккаунт в BB (асинхронно, не блокируем ответ)
          syncUserToBestBenefits({
            id: updatedUser.id,
            email: updatedUser.email,
            firstName: updatedUser.firstName,
            lastName: updatedUser.lastName,
            password: bbPassword,
            city_id: null,
          })
            .then(async (bbData) => {
              await prisma.user.update({
                where: { id: updatedUser.id },
                data: {
                  bestBenefitsUserId: bbData.bestBenefitsUserId,
                  bestBenefitsStatus: bbData.status,
                  bestBenefitsCreatedAt: new Date(),
                },
              });
              console.log("[Verify Email PIN] User synced to BestBenefits:", bbData.bestBenefitsUserId);
            })
            .catch((error) => {
              console.error("[Verify Email PIN] Failed to sync to BestBenefits:", error);
            });
        } catch (error) {
          console.error("[Verify Email PIN] BestBenefits sync error:", error);
          // Не блокируем верификацию email из-за ошибки BB
        }
      }

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

