import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import crypto from "crypto";
import nodemailer from "nodemailer";

// Используем ту же логику что и в lib/email.ts
const emailConfig = {
  host: process.env.SMTP_HOST,
  port: process.env.SMTP_PORT,
  user: process.env.SMTP_USER,
  pass: process.env.SMTP_PASSWORD,
  from: process.env.SMTP_FROM,
};

const isEmailConfigured = !!emailConfig.host && !!emailConfig.port && !!emailConfig.user && !!emailConfig.pass && !!emailConfig.from;

const transporter = isEmailConfigured
  ? nodemailer.createTransport({
      host: emailConfig.host!,
      port: parseInt(emailConfig.port || "465"),
      secure: emailConfig.port === "465",
      auth: {
        user: emailConfig.user!,
        pass: emailConfig.pass!,
      },
    })
  : null;

export async function POST(request: NextRequest) {
  try {
    const { email } = await request.json();

    if (!email) {
      return NextResponse.json(
        { error: "Email обязателен" },
        { status: 400 }
      );
    }

    const user = await prisma.user.findUnique({
      where: { email },
    });

    if (!user) {
      // Не раскрываем, существует ли пользователь
      return NextResponse.json({
        success: true,
        message: "Если пользователь с таким email существует, инструкции отправлены",
      });
    }

    // Генерируем токен сброса
    const resetToken = crypto.randomBytes(32).toString("hex");
    const resetTokenExpires = new Date(Date.now() + 60 * 60 * 1000); // 1 час

    await prisma.user.update({
      where: { email },
      data: {
        resetToken,
        resetTokenExpires,
      },
    });

    // Отправляем email с ссылкой
    const resetUrl = `${process.env.NEXTAUTH_URL}/reset-password?token=${resetToken}`;

    const mailOptions = {
      from: emailConfig.from,
      to: email,
      subject: "Восстановление пароля MyUnion",
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #465fff;">Восстановление пароля</h2>
          <p>Вы запросили восстановление пароля для вашего аккаунта MyUnion.</p>
          <p style="margin: 30px 0;">
            <a href="${resetUrl}" style="background: #465fff; color: white; padding: 12px 24px; text-decoration: none; border-radius: 8px; display: inline-block;">
              Восстановить пароль
            </a>
          </p>
          <p style="color: #6b7280; font-size: 14px;">
            Ссылка действительна в течение 1 часа. Если вы не запрашивали восстановление пароля, проигнорируйте это письмо.
          </p>
        </div>
      `,
    };

    if (!transporter) {
      console.warn("[forgot-password] SMTP настройки не найдены. Письмо не отправлено.");
      console.info("[forgot-password] Получатель:", email);
      console.info("[forgot-password] Тема:", mailOptions.subject);
      console.info("[forgot-password] Ссылка для сброса:", resetUrl);
      // Не блокируем процесс, просто логируем
    } else {
      await transporter.sendMail(mailOptions);
    }

    return NextResponse.json({
      success: true,
      message: "Инструкции отправлены на ваш email",
    });
  } catch (error) {
    console.error("Forgot password error:", error);
    return NextResponse.json(
      { error: "Ошибка при отправке письма" },
      { status: 500 }
    );
  }
}

