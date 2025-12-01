import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendPINViaSMS } from "@/lib/exolve-sms";
import { sendTelegramMessage } from "@/lib/telegram-bot";
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
    let existingUser = await prisma.user.findFirst({
      where: {
        OR: [
          { phone: normalizedPhone },
          { authPhone: normalizedPhone },
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

    // Если не нашли, пробуем без +
    if (!existingUser && normalizedPhone.startsWith("+")) {
      const phoneWithoutPlus = normalizedPhone.replace("+", "");
      const phoneWith7 = normalizedPhone.replace("+7", "7");
      const phoneWith8 = normalizedPhone.replace("+7", "8");
      
      existingUser = await prisma.user.findFirst({
        where: {
          OR: [
            { phone: phoneWithoutPlus },
            { phone: phoneWith7 },
            { phone: phoneWith8 },
            { authPhone: phoneWithoutPlus },
            { authPhone: phoneWith7 },
            { authPhone: phoneWith8 },
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
    }

    // Удаляем старые неиспользованные PIN-коды для этого номера (все форматы)
    const phoneVariants = normalizedPhone.startsWith("+") 
      ? [
          normalizedPhone,
          normalizedPhone.replace("+", ""),
          normalizedPhone.replace("+7", "7"),
          normalizedPhone.replace("+7", "8"),
        ]
      : [normalizedPhone];
    
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

    // Определяем способ доставки: Telegram (бесплатно) или SMS (платно)
    // Приоритет: если пользователь привязал Telegram (даже после первой SMS авторизации) - отправляем в Telegram
    let deliveryMethod: "telegram" | "sms" = "sms";
    let deliverySuccess = false;
    let isExistingUser = !!existingUser;

    // Если у пользователя привязан Telegram - отправляем туда (экономия на SMS)
    // Это работает даже если пользователь сначала авторизовался по SMS, а потом привязал Telegram через бота
    if (existingUser?.telegramChatId) {
      console.log("[2FA Auth] 📱 Пользователь имеет привязанный Telegram, отправляем туда (приоритет над SMS):", existingUser.telegramChatId);
      
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
        console.log("[2FA Auth] ⚠️ Telegram не сработал, пробуем SMS:", telegramResult.error);
      }
    }

    // Если Telegram не сработал или не привязан - отправляем SMS
    if (!deliverySuccess) {
      console.log("[2FA Auth] 📨 Отправка PIN-кода через SMS на номер:", normalizedPhone);
      console.log("[2FA Auth] EXOLVE_API_KEY установлен:", !!process.env.EXOLVE_API_KEY);
      
      const smsResult = await sendPINViaSMS(normalizedPhone, pinCode);
      
      if (smsResult.success) {
        console.log("[2FA Auth] ✅ PIN-код успешно отправлен через SMS");
        deliveryMethod = "sms";
        deliverySuccess = true;
      } else {
        console.error("[2FA Auth] ❌ SMS не сработал:", {
          error: smsResult.error,
          details: smsResult.details,
        });
        
        // Более информативное сообщение об ошибке
        let errorMessage = "Не удалось отправить код";
        let userFriendlyMessage = "Проверьте правильность номера телефона и попробуйте позже";
        
        if (smsResult.error?.includes("не настроен") || smsResult.error?.includes("не установлен")) {
          errorMessage = "Сервис отправки SMS временно недоступен. Обратитесь в поддержку.";
          userFriendlyMessage = "Сервис отправки SMS временно недоступен. Пожалуйста, обратитесь в поддержку или попробуйте позже.";
        } else if (smsResult.error?.toLowerCase().includes("incorrect customer state")) {
          errorMessage = "Проблема с аккаунтом SMS-сервиса";
          userFriendlyMessage = "Сервис отправки SMS временно недоступен. Пожалуйста, обратитесь в поддержку: support@myunion.pro";
        } else if (smsResult.error?.toLowerCase().includes("insufficient funds") || smsResult.error?.toLowerCase().includes("баланс")) {
          errorMessage = "Недостаточно средств на счете SMS-сервиса";
          userFriendlyMessage = "Сервис отправки SMS временно недоступен. Пожалуйста, обратитесь в поддержку: support@myunion.pro";
        } else if (smsResult.error) {
          errorMessage = `Ошибка отправки SMS: ${smsResult.error}`;
          // Для других ошибок показываем общее сообщение
          if (process.env.NODE_ENV === "development") {
            userFriendlyMessage = `Ошибка: ${smsResult.error}`;
          }
        }
        
        return NextResponse.json(
          {
            error: errorMessage,
            message: userFriendlyMessage,
            details: process.env.NODE_ENV === "development" ? {
              error: smsResult.error,
              details: smsResult.details,
            } : undefined,
          },
          { status: 500 }
        );
      }
    }

    const messages = {
      telegram: "Код отправлен в Telegram 💬",
      sms: "Код отправлен в SMS 📱",
    };

    return NextResponse.json({
      success: true,
      deliveryMethod,
      message: messages[deliveryMethod],
      isExistingUser,
      hasTelegram: !!existingUser?.telegramChatId,
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

