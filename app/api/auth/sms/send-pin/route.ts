import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendPINViaSMS } from "@/lib/exolve-sms";
import crypto from "crypto";
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
 * POST /api/auth/sms/send-pin
 * Отправляет PIN-код через Telegram (или fallback на SMS/WhatsApp)
 */
export async function POST(request: NextRequest) {
  try {
    const { phone } = await request.json();

    console.log("[2FA Auth] Получен запрос на отправку PIN-кода. Номер (raw):", phone);

    if (!phone || typeof phone !== "string") {
      console.error("[2FA Auth] Номер телефона не предоставлен или не является строкой");
      return NextResponse.json(
        { error: "Номер телефона обязателен" },
        { status: 400 }
      );
    }

    // Нормализуем номер перед валидацией (маска может содержать символы форматирования)
    const normalizedPhone = normalizePhone(phone);
    console.log("[2FA Auth] Нормализованный номер:", normalizedPhone);

    // Валидируем нормализованный номер
    if (!validatePhone(normalizedPhone)) {
      console.error("[2FA Auth] Неверный формат номера после нормализации:", normalizedPhone);
      return NextResponse.json(
        { error: "Неверный формат номера телефона. Введите номер в формате +7 (999) 123-45-67" },
        { status: 400 }
      );
    }

    console.log("[2FA Auth] Валидация пройдена. Подготовка к отправке PIN-кода на номер:", normalizedPhone);

    // Генерируем 4-значный PIN-код
    const pinCode = crypto.randomInt(1000, 9999).toString();
    
    // Хешируем PIN-код для хранения в БД
    const hashedPin = await bcrypt.hash(pinCode, 10);

    // Время истечения: 10 минут (соответствует шаблону WhatsApp)
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

    // Ищем пользователя по телефону (если есть) - пробуем разные варианты номера
    let existingUser = await prisma.user.findUnique({
      where: { phone: normalizedPhone },
      select: {
        id: true,
        telegramChatId: true,
        maxChatId: true,
        phone: true,
      },
    });

    // Если не нашли, пробуем без +
    if (!existingUser && normalizedPhone.startsWith("+")) {
      existingUser = await prisma.user.findFirst({
        where: {
          OR: [
            { phone: normalizedPhone.replace("+", "") },
            { phone: normalizedPhone.replace("+7", "7") },
            { phone: normalizedPhone.replace("+7", "8") },
          ],
        },
        select: {
          id: true,
          telegramChatId: true,
          maxChatId: true,
          phone: true,
        },
      });
    }

    // Удаляем старые неиспользованные PIN-коды для этого номера
    await prisma.sMSPinCode.deleteMany({
      where: {
        phone: normalizedPhone,
        used: false,
        expiresAt: {
          lt: new Date(),
        },
      },
    });

    // Сохраняем PIN-код в БД
    await prisma.sMSPinCode.create({
      data: {
        phone: normalizedPhone,
        hashedPin,
        expiresAt,
        userId: existingUser?.id,
      },
    });

    // Отправляем PIN-код через SMS (Exolve)
    console.log("[2FA Auth] Отправка PIN-кода через SMS на номер:", normalizedPhone);
    const smsResult = await sendPINViaSMS(normalizedPhone, pinCode);
    
    if (!smsResult.success) {
      console.error("[2FA Auth] ❌ SMS не сработал:", smsResult.error);
      
      return NextResponse.json(
        {
          error: "Не удалось отправить код",
          message: "Проверьте правильность номера телефона и попробуйте позже",
          details: process.env.NODE_ENV === "development" ? smsResult.error : undefined,
        },
        { status: 500 }
      );
    }

    console.log("[2FA Auth] ✅ PIN-код успешно отправлен через SMS");

    return NextResponse.json({
      success: true,
      deliveryMethod: "sms",
      message: "Код отправлен в SMS 📱",
      // В продакшене не возвращаем PIN-код, только для разработки
      ...(process.env.NODE_ENV === "development" && { pinCode }),
    });
  } catch (error) {
    console.error("[2FA Auth] Ошибка при отправке PIN-кода:", error);
    return NextResponse.json(
      {
        error: "Ошибка при отправке кода",
        details: process.env.NODE_ENV === "development" 
          ? (error instanceof Error ? error.message : String(error)) 
          : undefined,
      },
      { status: 500 }
    );
  }
}

