import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { translitLatinToCyrillic } from "@/lib/translit-latin-to-cyrillic";

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
    const phone = searchParams.get("phone"); // Опционально, если пользователь разрешил
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

    const source = searchParams.get("source");
    const isWidgetAuth = source === "widget";

    // Создаем строку для проверки подписи (исключаем hash и наш параметр source)
    const dataCheckArray: string[] = [];
    searchParams.forEach((value, key) => {
      if (key !== "hash" && key !== "source") {
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

    // Нормализуем номер телефона, если он был передан
    const normalizePhone = (phone: string): string => {
      let cleaned = phone.replace(/[\s\-\(\)]/g, "");
      if (cleaned.startsWith("8")) {
        cleaned = "+7" + cleaned.slice(1);
      }
      if (cleaned.startsWith("7") && !cleaned.startsWith("+")) {
        cleaned = "+" + cleaned;
      }
      return cleaned;
    };

    const normalizedPhone = phone ? normalizePhone(phone) : null;

    console.log("[Telegram Login] Данные от Telegram:", {
      telegramId: id,
      phone: normalizedPhone ? "****" + normalizedPhone.slice(-4) : "не передан",
      username,
      firstName: first_name,
    });

    // Проверяем, есть ли текущая сессия (пользователь уже залогинен)
    const session = await getServerSession(authOptions);
    
    let user;
    let isNewUser = false;

    if (session?.user?.id) {
      // Пользователь уже залогинен - привязываем Telegram к его аккаунту
      console.log("[Telegram Login] 🔗 Пользователь уже залогинен, привязываем Telegram к аккаунту:", session.user.id);
      
      // Проверяем, не привязан ли этот Telegram уже к другому аккаунту
      const existingTgUser = await prisma.user.findUnique({
        where: { telegramChatId: id },
      });
      
      if (existingTgUser && existingTgUser.id !== session.user.id) {
        console.log("[Telegram Login] ⚠️ Этот Telegram уже привязан к другому аккаунту:", existingTgUser.id);
        // Объединяем аккаунты: переносим данные из Telegram-аккаунта в текущий
        
        // Переносим документы
        await prisma.document.updateMany({
          where: { userId: existingTgUser.id },
          data: { userId: session.user.id },
        });
        
        // Удалено: перенос чат-сессий - больше не используется
        
        // Переносим историю членства
        await prisma.membershipHistory.updateMany({
          where: { userId: existingTgUser.id },
          data: { userId: session.user.id },
        });
        
        // Удалено: перенос обращений - функция обращений больше не используется
        
        // Удаляем связанные записи
        await prisma.sMSPinCode.deleteMany({ where: { userId: existingTgUser.id } });
        await prisma.loginToken.deleteMany({ where: { userId: existingTgUser.id } });
        await prisma.emailPinCode.deleteMany({ where: { userId: existingTgUser.id } });
        await prisma.pushSubscription.deleteMany({ where: { userId: existingTgUser.id } });
        await prisma.phoneHistory.deleteMany({ where: { userId: existingTgUser.id } });
        
        // Удаляем дубликат
        await prisma.user.delete({ where: { id: existingTgUser.id } });
        
        console.log("[Telegram Login] ✅ Аккаунты объединены, дубликат удалён");
      }
      
      // Получаем актуальные данные пользователя
      const currentUser = await prisma.user.findUnique({
        where: { id: session.user.id },
      });
      
      user = await prisma.user.update({
        where: { id: session.user.id },
        data: {
          telegramChatId: id,
          telegramUsername: username || currentUser?.telegramUsername || undefined,
          firstName: currentUser?.firstName || (first_name ? translitLatinToCyrillic(first_name) : undefined),
          lastName: currentUser?.lastName || (last_name ? translitLatinToCyrillic(last_name) : undefined),
          avatarUrl: currentUser?.avatarUrl || photo_url || undefined,
        },
      });
      
      console.log("[Telegram Login] ✅ Telegram привязан к существующему аккаунту");
    } else {
      // Пользователь не залогинен - ищем или создаем
      
      // 1. Сначала по telegramChatId
      user = await prisma.user.findUnique({
        where: { telegramChatId: id },
      });

      // 2. Если не найден, пробуем найти по username (для widget, где phone может быть скрыт)
      if (!user && username) {
        user = await prisma.user.findFirst({
          where: {
            telegramUsername: {
              equals: username,
              mode: "insensitive",
            },
          },
        });

        if (user) {
          console.log("[Telegram Login] 🔗 Найден существующий аккаунт по username:", user.id);
          user = await prisma.user.update({
            where: { id: user.id },
            data: {
              telegramChatId: id,
              telegramUsername: username || user.telegramUsername,
              firstName: (first_name ? translitLatinToCyrillic(first_name) : null) || user.firstName,
              lastName: (last_name ? translitLatinToCyrillic(last_name) : null) || user.lastName,
              avatarUrl: photo_url || user.avatarUrl,
            },
          });
        }
      }

      // 3. Если не найден и есть phone - ищем по номеру телефона
      if (!user && normalizedPhone) {
        // Ищем с учетом разных форматов номера
        const phoneDigits = normalizedPhone.replace(/\D/g, "");
        
        user = await prisma.user.findFirst({
          where: {
            OR: [
              { phone: normalizedPhone },
              { phone: { contains: phoneDigits.slice(-10) } },
              { phone: `+7 (${phoneDigits.slice(1, 4)}) ${phoneDigits.slice(4, 7)}-${phoneDigits.slice(7, 9)}-${phoneDigits.slice(9)}` },
            ],
          },
        });

        if (user) {
          console.log("[Telegram Login] 🔗 Найден существующий аккаунт по номеру телефона. Синхронизируем с Telegram:", user.id);
          
          // Проверяем, не привязан ли этот Telegram уже к другому аккаунту
          const existingTgUser = await prisma.user.findUnique({
            where: { telegramChatId: id },
          });
          
          if (existingTgUser && existingTgUser.id !== user.id) {
            console.log("[Telegram Login] ⚠️ Этот Telegram уже привязан к другому аккаунту. Объединяем аккаунты:", existingTgUser.id);
            
            // Объединяем аккаунты: переносим данные из Telegram-аккаунта в аккаунт с телефоном
            await prisma.document.updateMany({
              where: { userId: existingTgUser.id },
              data: { userId: user.id },
            });
            // Удалено: перенос чат-сессий и сообщений - больше не используется
            // Удалено: перенос обращений - функция обращений больше не используется
            await prisma.membershipHistory.updateMany({
              where: { userId: existingTgUser.id },
              data: { userId: user.id },
            });
            await prisma.sMSPinCode.deleteMany({ where: { userId: existingTgUser.id } });
            await prisma.loginToken.deleteMany({ where: { userId: existingTgUser.id } });
            await prisma.emailPinCode.deleteMany({ where: { userId: existingTgUser.id } });
            await prisma.pushSubscription.deleteMany({ where: { userId: existingTgUser.id } });
            await prisma.phoneHistory.deleteMany({ where: { userId: existingTgUser.id } });
            await prisma.user.delete({ where: { id: existingTgUser.id } });
            
            console.log("[Telegram Login] ✅ Аккаунты объединены, дубликат удалён");
          }
          
          // Обновляем пользователя, устанавливаем authPhone если его еще нет
          const updateData: any = {
            telegramChatId: id,
            telegramUsername: username || user.telegramUsername,
            firstName: (first_name ? translitLatinToCyrillic(first_name) : null) || user.firstName,
            lastName: (last_name ? translitLatinToCyrillic(last_name) : null) || user.lastName,
            phone: normalizedPhone,
          };
          
          // Если authPhone еще не установлен, устанавливаем его (телефон первой авторизации)
          if (!user.authPhone && normalizedPhone) {
            updateData.authPhone = normalizedPhone;
            console.log("[Telegram Login] Устанавливаем authPhone (первая авторизация через Telegram):", normalizedPhone);
          }
          
          user = await prisma.user.update({
            where: { id: user.id },
            data: updateData,
          });
          
          console.log("[Telegram Login] ✅ Аккаунт синхронизирован: SMS ↔ Telegram");
        }
      }

      isNewUser = !user;

      if (user && !isNewUser) {
        // Обновляем данные существующего пользователя
        console.log("[Telegram Login] Пользователь найден:", user.id);
        
        user = await prisma.user.update({
          where: { id: user.id },
          data: {
            telegramUsername: username || user.telegramUsername,
            firstName: (first_name ? translitLatinToCyrillic(first_name) : null) || user.firstName,
            lastName: (last_name ? translitLatinToCyrillic(last_name) : null) || user.lastName,
            phone: normalizedPhone || user.phone,
          },
        });
      } else if (isNewUser) {
        // Создаем нового пользователя
        console.log("[Telegram Login] Создаем нового пользователя");
        
        // Проверяем, не существует ли уже пользователь с этим telegramChatId (на случай, если остался после удаления)
        const existingTgUser = await prisma.user.findUnique({
          where: { telegramChatId: id },
        });
        
        if (existingTgUser) {
          console.log("[Telegram Login] ⚠️ Найден пользователь с этим Telegram ID, используем его:", existingTgUser.id);
          // Обновляем существующего пользователя вместо создания нового
          user = await prisma.user.update({
            where: { id: existingTgUser.id },
            data: {
              telegramUsername: username || existingTgUser.telegramUsername,
              firstName: (first_name ? translitLatinToCyrillic(first_name) : null) || existingTgUser.firstName,
              lastName: (last_name ? translitLatinToCyrillic(last_name) : null) || existingTgUser.lastName,
              phone: normalizedPhone || existingTgUser.phone,
            },
          });
          isNewUser = false;
        } else {
          // Создаем нового пользователя
          try {
            user = await prisma.user.create({
              data: {
                telegramChatId: id,
                telegramUsername: username || null,
                firstName: first_name ? translitLatinToCyrillic(first_name) : null,
                lastName: last_name ? translitLatinToCyrillic(last_name) : null,
                phone: normalizedPhone,
                authPhone: normalizedPhone, // Устанавливаем authPhone при первой авторизации через Telegram
                role: "PENDING_MEMBER",
                membershipStatus: "PROFILE_INCOMPLETE",
              },
            });
            
            console.log("[Telegram Login] Новый пользователь создан:", user.id);
          } catch (createError: any) {
            // Если ошибка из-за уникального constraint (telegramChatId или phone), пробуем найти существующего
            if (createError?.code === 'P2002') {
              console.log("[Telegram Login] ⚠️ Ошибка уникальности при создании, ищем существующего пользователя");
              
              // Пробуем найти по telegramChatId
              const foundUser = await prisma.user.findUnique({
                where: { telegramChatId: id },
              });
              
              if (foundUser) {
                user = foundUser;
                isNewUser = false;
                console.log("[Telegram Login] ✅ Найден существующий пользователь:", user.id);
              } else {
                throw createError; // Если не нашли, пробрасываем ошибку дальше
              }
            } else {
              throw createError;
            }
          }
        }
      }
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

    // Определяем правильный базовый URL СНАЧАЛА
    // Для localhost всегда используем http, для продакшена - из env или из заголовков
    const host = request.headers.get("host") || "localhost:3000";
    const isLocalhost = host.includes("localhost") || host.includes("127.0.0.1");
    
    let baseUrl: string;
    if (process.env.NEXTAUTH_URL) {
      baseUrl = process.env.NEXTAUTH_URL;
    } else if (process.env.NEXT_PUBLIC_APP_URL) {
      baseUrl = process.env.NEXT_PUBLIC_APP_URL;
    } else if (isLocalhost) {
      // Для localhost всегда http
      baseUrl = `http://${host}`;
    } else {
      // Для продакшена определяем по заголовкам
      const proto = request.headers.get("x-forwarded-proto") || 
                    (request.url.startsWith("https") ? "https" : "http");
      baseUrl = `${proto}://${host}`;
    }

    if (isWidgetAuth) {
      // Widget flow: прямой redirect с токеном — без сообщений в бот
      const redirectUrl = new URL(`/auth/telegram/success?token=${loginToken}`, baseUrl);
      console.log("[Telegram Login] Widget auth → прямой redirect:", redirectUrl.toString());
      return NextResponse.redirect(redirectUrl);
    }

    // Bot flow (legacy): отправляем сообщение в бот, redirect с check=true
    const { sendNewUserWelcome, sendReturningUserWelcome, sendTelegramMessage } = await import("@/lib/telegram-bot");
    
    if (!user.phone) {
      console.log("[Telegram Login] У пользователя нет номера, запрашиваем через бот");
      
      await sendTelegramMessage(
        id,
        `👋 <b>Добро пожаловать в МойСоюз!</b>\n\nДля завершения регистрации нам нужен ваш номер телефона.\n\nПоделитесь номером телефона, нажав кнопку ниже:`,
      );
      
      const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
      if (TELEGRAM_BOT_TOKEN) {
        const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
        await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            chat_id: id,
            text: "Нажмите кнопку, чтобы поделиться номером:",
            parse_mode: "HTML",
            reply_markup: {
              keyboard: [[{ text: "📱 Поделиться номером телефона", request_contact: true }]],
              one_time_keyboard: true,
              resize_keyboard: true,
            },
          }),
        });
      }
    } else if (isNewUser) {
      await sendNewUserWelcome(id, loginToken, first_name || undefined, baseUrl);
    } else {
      await sendReturningUserWelcome(id, loginToken, first_name || undefined, baseUrl);
    }
    
    const redirectUrl = new URL(`/auth/telegram/success?check=true`, baseUrl);
    console.log("[Telegram Login] Bot flow → redirect:", redirectUrl.toString());
    return NextResponse.redirect(redirectUrl);
  } catch (error) {
    console.error("[Telegram Login] Ошибка:", error);
    return NextResponse.redirect(
      new URL("/login?error=server_error", request.url)
    );
  }
}

