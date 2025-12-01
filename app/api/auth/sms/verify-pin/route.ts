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

    console.log("[2FA Auth] Проверка PIN-кода для номера:", normalizedPhone, "(исходный:", phone, "), PIN:", pinCode);

    // Ищем неиспользованный PIN-код для этого номера (пробуем разные форматы)
    let pinRecord = await prisma.sMSPinCode.findFirst({
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

    // Если не нашли, пробуем другие форматы номера
    if (!pinRecord && normalizedPhone.startsWith("+")) {
      const phoneWithoutPlus = normalizedPhone.replace("+", "");
      const phoneWith7 = normalizedPhone.replace("+7", "7");
      const phoneWith8 = normalizedPhone.replace("+7", "8");
      
      console.log("[2FA Auth] PIN не найден для", normalizedPhone, ", пробуем варианты:", {
        phoneWithoutPlus,
        phoneWith7,
        phoneWith8,
      });
      
      pinRecord = await prisma.sMSPinCode.findFirst({
        where: {
          OR: [
            { phone: phoneWithoutPlus },
            { phone: phoneWith7 },
            { phone: phoneWith8 },
          ],
          used: false,
          expiresAt: {
            gt: new Date(),
          },
        },
        orderBy: {
          createdAt: "desc",
        },
      });
    }

    if (!pinRecord) {
      console.error("[2FA Auth] ❌ PIN-код не найден для номера:", normalizedPhone);
      
      // Проверяем, есть ли вообще PIN-коды для этого номера (даже использованные или истекшие)
      const allPins = await prisma.sMSPinCode.findMany({
        where: {
          OR: [
            { phone: normalizedPhone },
            { phone: normalizedPhone.replace("+", "") },
            { phone: normalizedPhone.replace("+7", "7") },
            { phone: normalizedPhone.replace("+7", "8") },
          ],
        },
        orderBy: {
          createdAt: "desc",
        },
        take: 5,
      });
      
      console.log("[2FA Auth] Найдено PIN-кодов для этого номера (все):", allPins.length);
      if (allPins.length > 0) {
        console.log("[2FA Auth] Последние PIN-коды:", allPins.map(p => ({
          phone: p.phone,
          used: p.used,
          expiresAt: p.expiresAt,
          createdAt: p.createdAt,
        })));
      }
      
      return NextResponse.json(
        { error: "PIN-код не найден или истек. Запросите новый код." },
        { status: 400 }
      );
    }

    console.log("[2FA Auth] ✅ PIN-код найден, проверяем...", {
      phone: pinRecord.phone,
      createdAt: pinRecord.createdAt,
      expiresAt: pinRecord.expiresAt,
    });

    // Проверяем PIN-код
    // Убеждаемся, что PIN - это строка
    const pinAsString = String(pinCode).trim();
    
    console.log("[2FA Auth] Сравниваю PIN-код:", {
      введен: pinCode,
      какСтрока: pinAsString,
      тип: typeof pinCode,
      длина: pinAsString.length,
      хешВБД: pinRecord.hashedPin.substring(0, 30) + "...",
      номерВБД: pinRecord.phone,
      номерЗапроса: normalizedPhone,
    });
    
    const isPinValid = await bcrypt.compare(pinAsString, pinRecord.hashedPin);

    if (!isPinValid) {
      console.error("[2FA Auth] ❌ PIN-код неверный. Детали:", {
        введен: pinCode,
        какСтрока: pinAsString,
        тип: typeof pinCode,
        длинаХеша: pinRecord.hashedPin.length,
        хешНачало: pinRecord.hashedPin.substring(0, 30),
        номерВБД: pinRecord.phone,
        номерЗапроса: normalizedPhone,
        createdAt: pinRecord.createdAt,
        expiresAt: pinRecord.expiresAt,
        сейчас: new Date(),
      });
      
      return NextResponse.json(
        { error: "Неверный PIN-код" },
        { status: 400 }
      );
    }

    console.log("[2FA Auth] ✅ PIN-код верный!");

    // Помечаем PIN-код как использованный
    await prisma.sMSPinCode.update({
      where: { id: pinRecord.id },
      data: {
        used: true,
        usedAt: new Date(),
      },
    });

    // Ищем или создаем пользователя (пробуем разные форматы номера)
    let user = await prisma.user.findUnique({
      where: { phone: normalizedPhone },
    });

    // Если не нашли, пробуем без +
    if (!user && normalizedPhone.startsWith("+")) {
      user = await prisma.user.findFirst({
        where: {
          OR: [
            { phone: normalizedPhone.replace("+", "") },
            { phone: normalizedPhone.replace("+7", "7") },
            { phone: normalizedPhone.replace("+7", "8") },
            { authPhone: normalizedPhone },
            { authPhone: normalizedPhone.replace("+", "") },
          ],
        },
      });
    }

    if (!user) {
      // Создаем нового пользователя
      try {
        user = await prisma.user.create({
          data: {
            phone: normalizedPhone,
            authPhone: normalizedPhone, // Устанавливаем authPhone при первой регистрации
            // Email будет заполнен позже через чат или профиль
            role: "PENDING_MEMBER",
            membershipStatus: "PROFILE_INCOMPLETE",
          },
        });
        console.log("[2FA Auth] Создан новый пользователь:", user.id);
      } catch (createError: any) {
        // Если ошибка уникальности - возможно номер уже есть в другом формате
        if (createError.code === "P2002") {
          console.log("[2FA Auth] Конфликт уникальности, пробуем найти пользователя снова...");
          user = await prisma.user.findFirst({
            where: {
              OR: [
                { phone: { contains: normalizedPhone.replace(/\D/g, "").slice(-10) } },
                { authPhone: { contains: normalizedPhone.replace(/\D/g, "").slice(-10) } },
              ],
            },
          });
          if (user) {
            console.log("[2FA Auth] Найден пользователь после конфликта:", user.id);
          } else {
            throw createError;
          }
        } else {
          throw createError;
        }
      }
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

