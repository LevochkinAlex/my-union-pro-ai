import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendWelcomeEmail } from "@/lib/email";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import { encryptPassword } from "@/lib/best-benefits-password";
import { getOrCreateUserKnowledgeBase, saveUserProfileToKnowledgeBase } from "@/lib/user-knowledge-base";
import fs from "fs";
import path from "path";

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
    
    // Шифруем пароль для BestBenefits (будет использован при синхронизации)
    const encryptedBbPassword = encryptPassword(generatedPassword);

    // Обновляем пользователя: подтверждаем email, устанавливаем пароль
    const updatedUser = await prisma.user.update({
      where: { email },
      data: {
        emailVerified: new Date(),
        password: hashedPassword,
        bestBenefitsPassword: encryptedBbPassword, // Сохраняем зашифрованный пароль для BestBenefits
        verificationToken: null,
        verificationExpires: null,
        membershipStatus: "PROFILE_INCOMPLETE", // Email подтвержден, профиль не заполнен
      },
    });

    // Аккаунт BestBenefits НЕ создается при регистрации
    // Аккаунт BestBenefits будет создан только после подтверждения email в анкете
    // когда пользователь подтвердит email через /api/auth/email/verify-pin

    // Удалено: создание ChatSession и ChatMessage - больше не используется
    // Чат-бот теперь работает без сессий, просто как помощник на всех страницах

    // Создаем базу знаний для пользователя и сохраняем начальные данные
    try {
      await getOrCreateUserKnowledgeBase(updatedUser.id);
      // Сохраняем начальные данные профиля (email) в базу знаний
      await saveUserProfileToKnowledgeBase(updatedUser);
      console.log("[register] ✅ База знаний пользователя создана и заполнена начальными данными");
    } catch (kbError) {
      console.error("[register] ⚠️ Ошибка при создании базы знаний:", kbError);
      // Не блокируем регистрацию при ошибке создания базы знаний
    }

    // Добавляем устав в документы по умолчанию
    try {
      const charterPath = "/docs/union/Устав Профсоюза (принят на VII съезде апрель 2021) зарегистрировано для публикации на сайте и печати.docx";
      
      // Проверяем, не добавлен ли уже устав
      const existingCharter = await prisma.document.findFirst({
        where: {
          userId: updatedUser.id,
          type: "OTHER",
          title: {
            contains: "Устав",
          },
        },
      });

      if (!existingCharter) {
        // Вычисляем размер файла устава
        let fileSize: number | null = null;
        try {
          const fullPath = path.join(process.cwd(), "public", charterPath);
          const stats = fs.statSync(fullPath);
          fileSize = stats.size;
          console.log("[register] Размер файла устава:", fileSize, "байт");
        } catch (fsError) {
          console.error("[register] ⚠️ Не удалось получить размер файла устава:", fsError);
          // Продолжаем создание документа без размера
        }

        const charterDoc = await prisma.document.create({
          data: {
            userId: updatedUser.id,
            type: "OTHER",
            status: "GENERATED",
            title: "Устав Профсоюза работников здравоохранения РФ",
            description: "Устав Профсоюза работников здравоохранения РФ (принят на VII съезде, апрель 2021)",
            filePath: charterPath,
            fileName: "Устав Профсоюза (принят на VII съезде апрель 2021) зарегистрировано для публикации на сайте и печати.docx",
            fileSize: fileSize,
            mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
          },
        });
        console.log("[register] ✅ Устав добавлен в документы пользователя:", charterDoc.id);
      } else {
        console.log("[register] У пользователя уже есть устав, пропускаем");
      }
    } catch (error) {
      console.error("[register] ❌ Error adding charter document:", error);
      // Don't fail registration if charter document creation fails
    }

    // Отправляем magic link для входа вместо пароля
    const loginToken = crypto.randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 минут

    await prisma.loginToken.create({
      data: {
        token: loginToken,
        userId: updatedUser.id,
        expiresAt,
      },
    });

    // Формируем magic link
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 
                    process.env.NEXTAUTH_URL || 
                    "https://myunion.pro";
    const magicLink = `${baseUrl.replace(/^http:/, "https:")}/api/auth/email/verify?token=${loginToken}`;

    // Отправляем приветственное письмо с magic link
    const { sendWelcomeEmail } = await import("@/lib/email");
    await sendWelcomeEmail(email, undefined, magicLink);

    return NextResponse.json({
      success: true,
      message: "Email подтвержден. Ссылка для входа отправлена на вашу почту.",
      magicLink: process.env.NODE_ENV === "development" ? magicLink : undefined,
    });
  } catch (error) {
    console.error("Verification error:", error);
    return NextResponse.json(
      { error: "Ошибка при подтверждении email" },
      { status: 500 }
    );
  }
}

