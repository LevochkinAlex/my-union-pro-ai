import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import crypto from "crypto";
import { sendEmail } from "@/lib/email";

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json(
        { error: "Не авторизован" },
        { status: 401 }
      );
    }

    const { email } = await request.json();

    if (!email) {
      return NextResponse.json(
        { error: "Email обязателен" },
        { status: 400 }
      );
    }

    // Проверяем формат email
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return NextResponse.json(
        { error: "Некорректный формат email" },
        { status: 400 }
      );
    }

    // Проверяем, не занят ли email другим пользователем
    const existingUser = await prisma.user.findFirst({
      where: {
        email,
        id: { not: session.user.id },
      },
    });

    if (existingUser) {
      return NextResponse.json(
        { error: "Этот email уже используется другим пользователем" },
        { status: 400 }
      );
    }

    // Генерируем токен верификации
    const verificationToken = crypto.randomBytes(32).toString("hex");
    const verificationExpires = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 часа

    // Обновляем пользователя
    const user = await prisma.user.update({
      where: { id: session.user.id },
      data: {
        email,
        emailVerified: null, // Сбрасываем верификацию
        verificationToken,
        verificationExpires,
      },
    });

    // Формируем ссылку подтверждения
    const baseUrl = process.env.NEXTAUTH_URL || "http://localhost:3004";
    const verificationUrl = `${baseUrl}/verify-email?token=${verificationToken}`;

    // Отправляем письмо
    try {
      await sendEmail({
        to: email,
        subject: "Подтверждение email - MyUnion",
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #2563eb;">Подтверждение email</h2>
            <p>Здравствуйте, ${user.firstName || ""}!</p>
            <p>Вы указали этот email адрес при регистрации в профсоюзе. Пожалуйста, подтвердите его, перейдя по ссылке ниже:</p>
            <div style="margin: 30px 0;">
              <a href="${verificationUrl}" 
                 style="background-color: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">
                Подтвердить email
              </a>
            </div>
            <p style="color: #666; font-size: 14px;">
              Или скопируйте эту ссылку в браузер:<br>
              <code style="background-color: #f3f4f6; padding: 4px 8px; border-radius: 4px;">${verificationUrl}</code>
            </p>
            <p style="color: #666; font-size: 14px;">
              Ссылка действительна 24 часа.
            </p>
            <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 30px 0;">
            <p style="color: #999; font-size: 12px;">
              Если вы не регистрировались в MyUnion, проигнорируйте это письмо.
            </p>
          </div>
        `,
        text: `
Подтверждение email

Здравствуйте, ${user.firstName || ""}!

Вы указали этот email адрес при регистрации в профсоюзе. 
Пожалуйста, подтвердите его, перейдя по ссылке:

${verificationUrl}

Ссылка действительна 24 часа.

Если вы не регистрировались в MyUnion, проигнорируйте это письмо.
        `,
      });

      console.log("[send-verification-email] Email sent to:", email);
      
      return NextResponse.json({
        success: true,
        message: "Письмо с подтверждением отправлено на " + email,
      });
    } catch (emailError) {
      console.error("[send-verification-email] Failed to send email:", emailError);
      
      // Даже если письмо не отправилось, токен сохранен
      return NextResponse.json({
        success: true,
        message: "Email сохранен. Письмо с подтверждением будет отправлено.",
        warning: "Email сервис временно недоступен",
      });
    }
  } catch (error) {
    console.error("[send-verification-email] Error:", error);
    return NextResponse.json(
      { error: "Ошибка при отправке письма" },
      { status: 500 }
    );
  }
}

