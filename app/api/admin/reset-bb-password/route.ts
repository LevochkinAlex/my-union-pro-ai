import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { requestPasswordResetCode, resetPassword } from "@/lib/best-benefits-password-reset";
import { encryptPassword } from "@/lib/best-benefits-password";

/**
 * POST /api/admin/reset-bb-password
 * 
 * Сброс пароля BestBenefits для пользователя
 * 
 * Body: { email, newPassword, code? }
 * 
 * Если code не указан, отправляет код на email
 * Если code указан, сбрасывает пароль и обновляет БД
 */
export async function POST(request: NextRequest) {
  try {
    // Разрешаем внутренние запросы с секретным ключом
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
        return NextResponse.json({ error: "Недостаточно прав" }, { status: 403 });
      }
    }

    const { email, newPassword, code } = await request.json();

    if (!email) {
      return NextResponse.json({ error: "Email обязателен" }, { status: 400 });
    }

    if (!newPassword) {
      return NextResponse.json({ error: "Новый пароль обязателен" }, { status: 400 });
    }

    if (newPassword.length < 8) {
      return NextResponse.json({ error: "Пароль должен быть не менее 8 символов" }, { status: 400 });
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
        bestBenefitsPassword: true,
      },
    });

    if (!user) {
      return NextResponse.json({ error: "Пользователь не найден" }, { status: 404 });
    }

    // Если код не указан, отправляем код на email
    if (!code) {
      console.log(`[reset-bb-password] Requesting reset code for: ${email}`);
      const codeRequest = await requestPasswordResetCode(email);
      
      if (codeRequest.status === "error") {
        return NextResponse.json({
          error: codeRequest.message,
          errors: codeRequest.errors,
        }, { status: 400 });
      }

      return NextResponse.json({
        success: true,
        message: "Код отправлен на email",
        email: email,
        nextStep: "Отправьте POST запрос с параметром 'code' для завершения сброса пароля",
      });
    }

    // Если код указан, сбрасываем пароль
    if (code.length !== 6 || !/^\d{6}$/.test(code)) {
      return NextResponse.json({ error: "Код должен состоять из 6 цифр" }, { status: 400 });
    }

    console.log(`[reset-bb-password] Resetting password for: ${email}`);
    const resetResult = await resetPassword(
      email,
      code,
      newPassword,
      newPassword
    );

    if (resetResult.status === "error") {
      return NextResponse.json({
        error: resetResult.message,
        errors: resetResult.errors,
      }, { status: 400 });
    }

    // Обновляем пароль в нашей БД
    const encryptedPassword = encryptPassword(newPassword);
    
    const updateData: any = {
      bestBenefitsPassword: encryptedPassword,
    };

    // Если bestBenefitsUserId не установлен, устанавливаем на email
    if (!user.bestBenefitsUserId) {
      updateData.bestBenefitsUserId = user.email;
      updateData.bestBenefitsStatus = 'active';
    }

    await prisma.user.update({
      where: { id: user.id },
      data: updateData,
    });

    return NextResponse.json({
      success: true,
      message: "Пароль BestBenefits успешно сброшен",
      email: user.email,
      bestBenefitsUserId: updateData.bestBenefitsUserId || user.bestBenefitsUserId,
    });

  } catch (error: any) {
    console.error("[reset-bb-password] Error:", error);
    return NextResponse.json(
      { error: error.message || "Ошибка при сбросе пароля BestBenefits" },
      { status: 500 }
    );
  }
}

