import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendWelcomeEmail } from "@/lib/email";
import bcrypt from "bcryptjs";
import crypto from "crypto";

export async function POST(request: NextRequest) {
  try {
    const { email, code } = await request.json();

    if (!email || !code) {
      return NextResponse.json(
        { error: "Email и код обязательны" },
        { status: 400 }
      );
    }

    // Находим пользователя
    const user = await prisma.user.findUnique({
      where: { email },
    });

    if (!user) {
      return NextResponse.json(
        { error: "Пользователь не найден" },
        { status: 404 }
      );
    }

    // Проверяем код и срок действия
    if (
      user.verificationToken !== code ||
      !user.verificationExpires ||
      user.verificationExpires < new Date()
    ) {
      return NextResponse.json(
        { error: "Неверный или истекший код" },
        { status: 400 }
      );
    }

    // Генерируем случайный пароль
    const generatedPassword = crypto.randomBytes(12).toString("base64").slice(0, 12);
    const hashedPassword = await bcrypt.hash(generatedPassword, 10);

    // Обновляем пользователя: подтверждаем email, устанавливаем пароль
    const updatedUser = await prisma.user.update({
      where: { email },
      data: {
        emailVerified: new Date(),
        password: hashedPassword,
        verificationToken: null,
        verificationExpires: null,
        membershipStatus: "PROFILE_INCOMPLETE", // Email подтвержден, профиль не заполнен
      },
    });

    // Создаем начальный чат "Заявление" с начальным юзер-сообщением
    try {
      const defaultBot = await prisma.chatBot.findFirst({
        where: { name: "MyUnion Pro" },
      });

      if (defaultBot) {
        // Создаем начальное пользовательское сообщение чтобы чат не был пустым
        await prisma.chatMessage.create({
          data: {
            content: "Начать заполнение заявления",
            role: "user",
            userId: updatedUser.id,
            chatBotId: defaultBot.id,
          },
        });

        // Добавляем ответ бота с приветствием
        const welcomeMessage = "Здравствуйте! Я — ваш персональный ассистент MyUnion Pro. Я помогу вам составить заявления для вступления в профсоюз и для перечисления членских взносов. Давайте начнем! Как я могу к вам обращаться (назовите, пожалуйста, ваши фамилию, имя и отчество)?";

        await prisma.chatMessage.create({
          data: {
            content: welcomeMessage,
            role: "assistant",
            userId: updatedUser.id,
            chatBotId: defaultBot.id,
          },
        });
      }
    } catch (error) {
      console.error("Error creating initial chat message:", error);
      // Don't fail registration if chat creation fails
    }

    // Отправляем приветственное письмо с паролем
    await sendWelcomeEmail(email, generatedPassword);

    return NextResponse.json({
      success: true,
      message: "Email подтвержден. Пароль отправлен на вашу почту.",
      temporaryPassword: generatedPassword,
    });
  } catch (error) {
    console.error("Verification error:", error);
    return NextResponse.json(
      { error: "Ошибка при подтверждении email" },
      { status: 500 }
    );
  }
}

