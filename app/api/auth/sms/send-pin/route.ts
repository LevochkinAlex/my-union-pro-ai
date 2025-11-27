import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendPINViaTelegram, validateChatId } from "@/lib/telegram-bot";
import { sendPINViaWhatsApp } from "@/lib/whatsapp-cloud";
import { sendPINViaMax, validateMaxChatId } from "@/lib/max-messenger";
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

    // Время истечения: 5 минут
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000);

    // Ищем пользователя по телефону (если есть)
    const existingUser = await prisma.user.findUnique({
      where: { phone: normalizedPhone },
      select: {
        id: true,
        telegramChatId: true,
        maxChatId: true,
        phone: true,
      },
    });

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

    // Определяем, куда отправить PIN-код
    let deliveryMethod = "none";
    let deliverySuccess = false;
    let deliveryError: string | undefined;
    const deliveryAttempts: string[] = [];

    // Приоритет 1: Telegram (если привязан)
    if (existingUser?.telegramChatId && validateChatId(existingUser.telegramChatId)) {
      deliveryAttempts.push("telegram");
      console.log("[2FA Auth] Попытка отправки через Telegram на chat_id:", existingUser.telegramChatId);
      const telegramResult = await sendPINViaTelegram(existingUser.telegramChatId, pinCode);
      
      if (telegramResult.success) {
        deliveryMethod = "telegram";
        deliverySuccess = true;
        console.log("[2FA Auth] ✅ PIN-код успешно отправлен через Telegram");
      } else {
        console.warn("[2FA Auth] ❌ Telegram не сработал:", telegramResult.error);
        deliveryError = telegramResult.error;
      }
    }

    // Приоритет 2: MAX Messenger (если Telegram не сработал и MAX привязан)
    if (!deliverySuccess && existingUser?.maxChatId && validateMaxChatId(existingUser.maxChatId)) {
      deliveryAttempts.push("max");
      console.log("[2FA Auth] Попытка отправки через MAX на chat_id:", existingUser.maxChatId);
      const maxResult = await sendPINViaMax(existingUser.maxChatId, pinCode);
      
      if (maxResult.success) {
        deliveryMethod = "max";
        deliverySuccess = true;
        console.log("[2FA Auth] ✅ PIN-код успешно отправлен через MAX");
      } else {
        console.warn("[2FA Auth] ❌ MAX не сработал:", maxResult.error);
        deliveryError = maxResult.error;
      }
    }

    // Приоритет 3: WhatsApp (если Telegram и MAX не сработали)
    if (!deliverySuccess) {
      deliveryAttempts.push("whatsapp");
      console.log("[2FA Auth] Попытка отправки через WhatsApp на номер:", normalizedPhone);
      const whatsappResult = await sendPINViaWhatsApp(normalizedPhone, pinCode);
      
      if (whatsappResult.success) {
        deliveryMethod = "whatsapp";
        deliverySuccess = true;
        console.log("[2FA Auth] ✅ PIN-код успешно отправлен через WhatsApp");
      } else {
        console.warn("[2FA Auth] ❌ WhatsApp не сработал:", whatsappResult.error);
        deliveryError = whatsappResult.error;
      }
    }

    // Если ни один метод не сработал
    if (!deliverySuccess) {
      console.error("[2FA Auth] ❌ Все методы доставки провалились:", {
        attempts: deliveryAttempts,
        lastError: deliveryError,
        phone: normalizedPhone,
        hasUser: !!existingUser,
        hasTelegram: !!existingUser?.telegramChatId,
        hasMax: !!existingUser?.maxChatId,
      });

      // Если пользователь не зарегистрирован или мессенджеры не привязаны, 
      // но WhatsApp тоже не сработал - показываем сообщение о необходимости привязки
      if (!existingUser || (!existingUser.telegramChatId && !existingUser.maxChatId)) {
        return NextResponse.json(
          {
            error: "Не удалось отправить код",
            requiresMessenger: true,
            message: "Для получения кода необходимо привязать Telegram или MAX",
            helpText: "Telegram или MAX — самые быстрые и надежные способы получения кодов. WhatsApp также доступен, но может быть недоступен в данный момент.",
            phone: normalizedPhone,
          },
          { status: 400 }
        );
      }

      // Оба канала провалились
      return NextResponse.json(
        {
          error: "Не удалось отправить код подтверждения",
          message: "Проверьте подключение к интернету и попробуйте позже",
          details: process.env.NODE_ENV === "development" 
            ? { 
                attempts: deliveryAttempts,
                lastError: deliveryError,
                phone: normalizedPhone,
                telegramChatId: existingUser?.telegramChatId,
              } 
            : undefined,
        },
        { status: 500 }
      );
    }

    console.log("[2FA Auth] PIN-код успешно доставлен методом:", deliveryMethod);

    // Формируем сообщение в зависимости от канала доставки
    const deliveryMessages = {
      telegram: "Код подтверждения отправлен в Telegram 📱",
      max: "Код подтверждения отправлен в MAX 💬",
      whatsapp: "Код подтверждения отправлен в WhatsApp 📲",
    };

    return NextResponse.json({
      success: true,
      deliveryMethod,
      message: deliveryMessages[deliveryMethod as keyof typeof deliveryMessages] || "Код подтверждения отправлен",
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

