import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { prisma } from "@/lib/prisma";

/**
 * Telegram Login Widget Callback
 * 
 * Обрабатывает данные от Telegram Login Widget и создает/авторизует пользователя
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    
    console.log("[Telegram Login] Получен callback:", Object.fromEntries(searchParams));
    
    // Получаем данные от Telegram
    const id = searchParams.get("id");
    const first_name = searchParams.get("first_name");
    const last_name = searchParams.get("last_name");
    const username = searchParams.get("username");
    const photo_url = searchParams.get("photo_url");
    const auth_date = searchParams.get("auth_date");
    const hash = searchParams.get("hash");

    // Проверяем обязательные параметры
    if (!id || !auth_date || !hash) {
      console.error("[Telegram Login] Отсутствуют обязательные параметры");
      return NextResponse.redirect(
        new URL("/login?error=missing_params", request.url)
      );
    }

    // Проверяем подпись от Telegram
    const token = process.env.TELEGRAM_BOT_TOKEN;
    if (!token) {
      console.error("[Telegram Login] TELEGRAM_BOT_TOKEN не установлен");
      return NextResponse.redirect(
        new URL("/login?error=server_config", request.url)
      );
    }

    // Создаем строку для проверки подписи
    const dataCheckArray: string[] = [];
    searchParams.forEach((value, key) => {
      if (key !== "hash") {
        dataCheckArray.push(`${key}=${value}`);
      }
    });
    dataCheckArray.sort();
    const dataCheckString = dataCheckArray.join("\n");
    
    // Вычисляем HMAC
    const secretKey = crypto.createHash("sha256").update(token).digest();
    const hmac = crypto
      .createHmac("sha256", secretKey)
      .update(dataCheckString)
      .digest("hex");
    
    // Проверяем подпись
    if (hmac !== hash) {
      console.error("[Telegram Login] Неверная подпись", {
        expected: hmac,
        received: hash,
      });
      return NextResponse.redirect(
        new URL("/login?error=invalid_signature", request.url)
      );
    }

    // Проверяем свежесть данных (не старше 1 дня)
    const authTimestamp = parseInt(auth_date);
    const now = Math.floor(Date.now() / 1000);
    if (now - authTimestamp > 86400) {
      console.error("[Telegram Login] Данные устарели", {
        authDate: new Date(authTimestamp * 1000),
        now: new Date(now * 1000),
      });
      return NextResponse.redirect(
        new URL("/login?error=data_outdated", request.url)
      );
    }

    console.log("[Telegram Login] Подпись проверена успешно");

    // Ищем существующего пользователя
    let user = await prisma.user.findUnique({
      where: { telegramChatId: id },
    });

    const isNewUser = !user;

    if (user) {
      // Обновляем данные существующего пользователя
      console.log("[Telegram Login] Пользователь найден:", user.id);
      
      user = await prisma.user.update({
        where: { id: user.id },
        data: {
          telegramUsername: username || user.telegramUsername,
          firstName: first_name || user.firstName,
          lastName: last_name || user.lastName,
          // Не перезаписываем статус если пользователь уже активен
        },
      });
    } else {
      // Создаем нового пользователя
      console.log("[Telegram Login] Создаем нового пользователя");
      
      user = await prisma.user.create({
        data: {
          telegramChatId: id,
          telegramUsername: username || null,
          firstName: first_name || null,
          lastName: last_name || null,
          role: "PENDING_MEMBER",
          membershipStatus: "PROFILE_INCOMPLETE",
        },
      });
      
      console.log("[Telegram Login] Новый пользователь создан:", user.id);
    }

    // Создаем временный токен для автоматической авторизации
    const loginToken = crypto.randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 минут

    await prisma.loginToken.create({
      data: {
        token: loginToken,
        userId: user.id,
        expiresAt,
      },
    });

    console.log("[Telegram Login] Токен создан");

    // Отправляем приветственное сообщение в Telegram
    const { sendNewUserWelcome, sendReturningUserWelcome } = await import("@/lib/telegram-bot");
    
    if (isNewUser) {
      console.log("[Telegram Login] Отправляем приветствие новому пользователю");
      await sendNewUserWelcome(id, loginToken, first_name || undefined);
    } else {
      console.log("[Telegram Login] Отправляем приветствие существующему пользователю");
      await sendReturningUserWelcome(id, loginToken, first_name || undefined);
    }

    // Редиректим на страницу с инструкцией проверить Telegram
    return NextResponse.redirect(
      new URL(`/auth/telegram/success?check=true`, request.url)
    );
  } catch (error) {
    console.error("[Telegram Login] Ошибка:", error);
    return NextResponse.redirect(
      new URL("/login?error=server_error", request.url)
    );
  }
}

