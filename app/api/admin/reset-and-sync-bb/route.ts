import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";
import { createBestBenefitsUser } from "@/lib/best-benefits-users";
import { encryptPassword } from "@/lib/best-benefits-password";
import { clearBestBenefitsUserTokenCache } from "@/lib/best-benefits-user-auth";

// Генерируем случайный пароль
function generatePassword(length = 12) {
  const charset = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*";
  let password = "";
  for (let i = 0; i < length; i++) {
    password += charset.charAt(Math.floor(Math.random() * charset.length));
  }
  return password;
}

export async function POST(request: NextRequest) {
  try {
    // Разрешаем внутренние запросы с секретным ключом
    // Проверяем секрет ПЕРЕД вызовом getServerSession, чтобы избежать авторизации
    const internalSecret = request.headers.get("X-Internal-Secret");
    const expectedSecret = process.env.INTERNAL_API_SECRET || "internal-secret-key-change-in-production";
    const isInternalRequest = internalSecret === expectedSecret;
    
    // Если это не внутренний запрос, проверяем сессию
    if (!isInternalRequest) {
      try {
        const session = await getServerSession(authOptions);
        
        // Проверяем, что это админ
        if (!session?.user || session.user.role !== "SUPER_ADMIN") {
          return NextResponse.json({ error: "Недостаточно прав" }, { status: 403 });
        }
      } catch (authError) {
        // Игнорируем ошибки авторизации для внутренних запросов
        return NextResponse.json({ error: "Недостаточно прав" }, { status: 403 });
      }
    }

    const { email } = await request.json();

    if (!email) {
      return NextResponse.json({ error: "Email обязателен" }, { status: 400 });
    }

    // Ищем пользователя
    const user = await prisma.user.findUnique({
      where: { email },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        bestBenefitsUserId: true,
        bestBenefitsStatus: true,
      },
    });

    if (!user) {
      return NextResponse.json({ error: "Пользователь не найден" }, { status: 404 });
    }

    // Генерируем новый пароль
    const newPassword = generatePassword(12);
    const hashedPassword = await bcrypt.hash(newPassword, 10);

    // Обновляем пароль в БД
    await prisma.user.update({
      where: { email },
      data: {
        password: hashedPassword,
        resetToken: null,
        resetTokenExpires: null,
      },
    });

    // Синхронизируем с BestBenefits
    const name = [user.firstName, user.lastName].filter(Boolean).join(" ") || user.email.split("@")[0];

    let bbResult = null;
    let bbError = null;

    try {
      const result = await createBestBenefitsUser({
        name,
        email: user.email,
        password: newPassword,
        city_id: null,
      });

      const bbUserId = result.data?.id?.toString() || user.email;

      const encryptedBb = encryptPassword(newPassword);
      await prisma.user.update({
        where: { id: user.id },
        data: {
          bestBenefitsUserId: bbUserId,
          bestBenefitsStatus: result.data?.status || result.status || "active",
          bestBenefitsCreatedAt: new Date(),
          bestBenefitsPassword: encryptedBb,
        },
      });
      clearBestBenefitsUserTokenCache(user.email);
      if (user.bestBenefitsUserId && user.bestBenefitsUserId !== user.email) {
        clearBestBenefitsUserTokenCache(user.bestBenefitsUserId);
      }

      bbResult = {
        userId: bbUserId,
        status: result.data?.status || result.status || "active",
      };
    } catch (error: any) {
      bbError = error.message;
      console.error("[reset-and-sync-bb] BestBenefits sync error:", error);
    }

    return NextResponse.json({
      success: true,
      email: user.email,
      newPassword,
      bestBenefits: bbResult || { error: bbError },
      message: bbResult 
        ? "Пароль сброшен и пользователь синхронизирован с BestBenefits"
        : "Пароль сброшен, но синхронизация с BestBenefits не удалась",
    });
  } catch (error: any) {
    console.error("[reset-and-sync-bb] Error:", error);
    return NextResponse.json(
      { error: error.message || "Ошибка при сбросе пароля и синхронизации" },
      { status: 500 }
    );
  }
}

