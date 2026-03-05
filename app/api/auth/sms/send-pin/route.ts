import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendTelegramMessage } from "@/lib/telegram-bot";
import { sendPINViaMax } from "@/lib/max-messenger";
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

    // Нормализуем номер перед проверкой (маска может содержать символы форматирования)
    const normalizedPhone = normalizePhone(phone);
    console.log("[2FA Auth] Нормализованный номер:", normalizedPhone, "(исходный:", phone, ")");

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
    // Проверяем и phone, и authPhone (телефон первой авторизации)
    // ВАЖНО: ищем по всем возможным форматам, чтобы найти пользователя с привязанным Telegram
    const phoneVariants = normalizedPhone.startsWith("+") 
      ? [
          normalizedPhone,
          normalizedPhone.replace("+", ""),
          normalizedPhone.replace("+7", "7"),
          normalizedPhone.replace("+7", "8"),
        ]
      : [normalizedPhone];
    
    let existingUser = await prisma.user.findFirst({
      where: {
        OR: [
          ...phoneVariants.map(phone => ({ phone })),
          ...phoneVariants.map(phone => ({ authPhone: phone })),
        ],
      },
      select: {
        id: true,
        telegramChatId: true,
        maxChatId: true,
        phone: true,
        authPhone: true,
      },
    });
    
    console.log("[2FA Auth] Поиск пользователя для номера:", normalizedPhone, {
      найдено: !!existingUser,
      telegramChatId: existingUser?.telegramChatId || null,
      phone: existingUser?.phone || null,
      authPhone: existingUser?.authPhone || null,
    });

    // Удаляем старые неиспользованные PIN-коды для этого номера (все форматы)
    // Используем phoneVariants, которые уже определены выше
    await prisma.sMSPinCode.deleteMany({
      where: {
        OR: phoneVariants.map(phone => ({ phone })),
        used: false,
        expiresAt: {
          lt: new Date(),
        },
      },
    });

    // Сохраняем PIN-код в БД
    const pinRecord = await prisma.sMSPinCode.create({
      data: {
        phone: normalizedPhone,
        hashedPin,
        expiresAt,
        userId: existingUser?.id,
      },
    });
    
    console.log("[2FA Auth] ✅ PIN-код сохранен в БД:", {
      id: pinRecord.id,
      phone: pinRecord.phone,
      expiresAt: pinRecord.expiresAt,
      createdAt: pinRecord.createdAt,
      pinCode: process.env.NODE_ENV === "development" ? pinCode : "***",
    });

    // Определяем способ доставки: Telegram → MAX → SMS (приоритет: мессенджеры бесплатно)
    let deliveryMethod: "telegram" | "max" | "sms" = "sms";
    let deliverySuccess = false;
    let isExistingUser = !!existingUser;

    // 1) Если у пользователя привязан Telegram — отправляем туда
    if (existingUser?.telegramChatId) {
      console.log("[2FA Auth] 📱 Пользователь имеет привязанный Telegram, отправляем туда:", existingUser.telegramChatId);
      
      const telegramMessage = `
🔐 <b>Код для входа в МойСоюз</b>

Ваш код: <code>${pinCode}</code>

⏱ Код действителен 10 минут.
⚠️ Не сообщайте этот код никому!
      `.trim();

      const telegramResult = await sendTelegramMessage(existingUser.telegramChatId, telegramMessage);
      
      if (telegramResult.success) {
        console.log("[2FA Auth] ✅ PIN-код отправлен в Telegram");
        deliveryMethod = "telegram";
        deliverySuccess = true;
      } else {
        console.log("[2FA Auth] ⚠️ Telegram не сработал:", telegramResult.error);
      }
    }

    // 2) Если Telegram не сработал или не привязан — пробуем MAX (если привязан)
    if (!deliverySuccess && existingUser?.maxChatId) {
      console.log("[2FA Auth] 📲 Отправка PIN в MAX:", existingUser.maxChatId);
      const maxResult = await sendPINViaMax(existingUser.maxChatId, pinCode);
      if (maxResult.success) {
        console.log("[2FA Auth] ✅ PIN-код отправлен в MAX");
        deliveryMethod = "max";
        deliverySuccess = true;
      } else {
        console.log("[2FA Auth] ⚠️ MAX не сработал:", maxResult.error);
      }
    }

    // 3) SMS fallback отключён — Exolve деактивирован
    if (!deliverySuccess) {
      console.log("[2FA Auth] ❌ Мессенджеры недоступны, SMS отключён");
      return NextResponse.json(
        {
          error: "Не удалось отправить код",
          message: "Привяжите Telegram для входа или используйте email. SMS-авторизация отключена.",
        },
        { status: 503 }
      );
    }

    const messages = {
      telegram: "Код отправлен в Telegram 💬",
      max: "Код отправлен в MAX 📲",
      sms: "Код отправлен в SMS 📱",
    };

    return NextResponse.json({
      success: true,
      deliveryMethod,
      message: messages[deliveryMethod],
      isExistingUser,
      hasTelegram: !!existingUser?.telegramChatId,
      hasMax: !!existingUser?.maxChatId,
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

