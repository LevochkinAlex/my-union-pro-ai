import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";

/**
 * Валидация российского номера телефона
 */
function validatePhone(phone: string): boolean {
  // Российский номер: +7 или 8, затем 10 цифр
  const phoneRegex = /^(\+7|7|8)\d{10}$/;
  return phoneRegex.test(phone.replace(/[\s\-\(\)]/g, ""));
}

/**
 * Нормализация номера телефона к формату +7XXXXXXXXXX
 */
function normalizePhone(phone: string): string {
  // Удаляем все символы кроме цифр и +
  let cleaned = phone.replace(/[\s\-\(\)]/g, "");
  
  // Если начинается с 8, заменяем на +7
  if (cleaned.startsWith("8")) {
    cleaned = "+7" + cleaned.slice(1);
  }
  
  // Если начинается с 7 (без +), добавляем +
  if (cleaned.startsWith("7") && !cleaned.startsWith("+")) {
    cleaned = "+" + cleaned;
  }
  
  return cleaned;
}

/**
 * POST /api/auth/sms/verify-pin
 * Проверяет PIN-код и авторизует пользователя
 */
export async function POST(request: NextRequest) {
  try {
    const { phone, pinCode } = await request.json();

    if (!phone || typeof phone !== "string") {
      return NextResponse.json(
        { error: "Номер телефона обязателен" },
        { status: 400 }
      );
    }

    if (!pinCode || typeof pinCode !== "string") {
      return NextResponse.json(
        { error: "PIN-код обязателен" },
        { status: 400 }
      );
    }

    // Валидируем номер телефона
    if (!validatePhone(phone)) {
      return NextResponse.json(
        { error: "Неверный формат номера телефона" },
        { status: 400 }
      );
    }

    // Нормализуем номер
    const normalizedPhone = normalizePhone(phone);

    console.log("[2FA Auth] Проверка PIN-кода для номера:", normalizedPhone);

    // Ищем неиспользованный PIN-код для этого номера
    const pinRecord = await prisma.sMSPinCode.findFirst({
      where: {
        phone: normalizedPhone,
        used: false,
        expiresAt: {
          gt: new Date(),
        },
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    if (!pinRecord) {
      return NextResponse.json(
        { error: "PIN-код не найден или истек. Запросите новый код." },
        { status: 400 }
      );
    }

    // Проверяем PIN-код
    const isPinValid = await bcrypt.compare(pinCode, pinRecord.hashedPin);

    if (!isPinValid) {
      return NextResponse.json(
        { error: "Неверный PIN-код" },
        { status: 400 }
      );
    }

    // Помечаем PIN-код как использованный
    await prisma.sMSPinCode.update({
      where: { id: pinRecord.id },
      data: {
        used: true,
        usedAt: new Date(),
      },
    });

    // Ищем или создаем пользователя
    let user = await prisma.user.findUnique({
      where: { phone: normalizedPhone },
    });

    if (!user) {
      // Создаем нового пользователя
      user = await prisma.user.create({
        data: {
          phone: normalizedPhone,
          // Email будет заполнен позже через чат или профиль
          role: "PENDING_MEMBER",
          membershipStatus: "PROFILE_INCOMPLETE",
        },
      });
      console.log("[2FA Auth] Создан новый пользователь:", user.id);
    } else {
      console.log("[2FA Auth] Найден существующий пользователь:", user.id);
    }

    // Возвращаем данные пользователя для авторизации через NextAuth
    return NextResponse.json({
      success: true,
      user: {
        id: user.id,
        phone: user.phone,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
        membershipStatus: user.membershipStatus,
        avatarUrl: user.avatarUrl,
      },
    });
  } catch (error) {
    console.error("[2FA Auth] Ошибка при проверке PIN-кода:", error);
    return NextResponse.json(
      {
        error: "Ошибка при проверке кода",
        details: process.env.NODE_ENV === "development" 
          ? (error instanceof Error ? error.message : String(error)) 
          : undefined,
      },
      { status: 500 }
    );
  }
}

