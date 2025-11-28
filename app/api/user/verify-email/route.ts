import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { syncUserToBestBenefits } from "@/lib/best-benefits-users";
import { decryptPassword } from "@/lib/best-benefits-password";
import crypto from "crypto";

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

    // Синхронизируем с BestBenefits только после подтверждения email
    if (
      process.env.USE_REAL_BB_API === "true" &&
      updatedUser.firstName &&
      updatedUser.lastName &&
      updatedUser.email &&
      !updatedUser.bestBenefitsUserId // Ещё не синхронизирован
    ) {
      console.log("[verify-email] Creating BestBenefits account for verified email...");

      try {
        // Генерируем или используем сохраненный пароль
        let bbPassword: string;
        
        if (updatedUser.bestBenefitsPassword) {
          try {
            bbPassword = decryptPassword(updatedUser.bestBenefitsPassword);
            console.log("[verify-email] Using saved password for BestBenefits");
          } catch (error) {
            console.error("[verify-email] Failed to decrypt password, generating new:", error);
            bbPassword = crypto.randomBytes(12).toString("base64").slice(0, 12);
          }
        } else {
          console.log("[verify-email] Generating new password for BestBenefits");
          bbPassword = crypto.randomBytes(12).toString("base64").slice(0, 12);
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
            console.log("[verify-email] User synced to BestBenefits:", bbData.bestBenefitsUserId);
          })
          .catch((error) => {
            console.error("[verify-email] Failed to sync to BestBenefits:", error);
          });
      } catch (error) {
        console.error("[verify-email] BestBenefits sync error:", error);
        // Не блокируем верификацию email из-за ошибки BB
      }
    }

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

