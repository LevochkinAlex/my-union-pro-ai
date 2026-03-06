import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { translitLatinToCyrillic } from "@/lib/translit-latin-to-cyrillic";

/**
 * Returns true if the string has at least one Cyrillic letter.
 * Used to avoid overwriting a real Cyrillic name with a Telegram nickname.
 */
function hasCyrillic(s: string | null | undefined): boolean {
  return !!s && /[а-яёА-ЯЁ]/.test(s);
}

/**
 * Safely pick a name for a user field.
 * - If the user already has a Cyrillic name, keep it (don't replace with a Telegram nickname).
 * - If the user has no name at all, use the OAuth-provided name (transliterated).
 */
function pickName(existing: string | null | undefined, oauthValue: string | null | undefined): string | undefined {
  const existingTrimmed = existing?.trim();
  if (existingTrimmed) return undefined; // keep existing, don't change
  if (!oauthValue) return undefined;
  return translitLatinToCyrillic(oauthValue);
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    
    console.log("[Telegram Login] Получен callback:", Object.fromEntries(searchParams));
    
    const id = searchParams.get("id");
    const first_name = searchParams.get("first_name");
    const last_name = searchParams.get("last_name");
    const username = searchParams.get("username");
    const phone = searchParams.get("phone");
    const photo_url = searchParams.get("photo_url");
    const auth_date = searchParams.get("auth_date");
    const hash = searchParams.get("hash");

    if (!id || !auth_date || !hash) {
      console.error("[Telegram Login] Отсутствуют обязательные параметры");
      return NextResponse.redirect(new URL("/login?error=missing_params", request.url));
    }

    const token = process.env.TELEGRAM_BOT_TOKEN;
    if (!token) {
      console.error("[Telegram Login] TELEGRAM_BOT_TOKEN не установлен");
      return NextResponse.redirect(new URL("/login?error=server_config", request.url));
    }

    const source = searchParams.get("source");
    const isWidgetAuth = source === "widget";

    // Verify Telegram signature
    const dataCheckArray: string[] = [];
    searchParams.forEach((value, key) => {
      if (key !== "hash" && key !== "source") {
        dataCheckArray.push(`${key}=${value}`);
      }
    });
    dataCheckArray.sort();
    const dataCheckString = dataCheckArray.join("\n");
    
    const secretKey = crypto.createHash("sha256").update(token).digest();
    const hmac = crypto.createHmac("sha256", secretKey).update(dataCheckString).digest("hex");
    
    if (hmac !== hash) {
      console.error("[Telegram Login] Неверная подпись");
      return NextResponse.redirect(new URL("/login?error=invalid_signature", request.url));
    }

    const authTimestamp = parseInt(auth_date);
    const now = Math.floor(Date.now() / 1000);
    if (now - authTimestamp > 86400) {
      console.error("[Telegram Login] Данные устарели");
      return NextResponse.redirect(new URL("/login?error=data_outdated", request.url));
    }

    console.log("[Telegram Login] Подпись проверена успешно");

    const normalizePhone = (p: string): string => {
      let cleaned = p.replace(/[\s\-\(\)]/g, "");
      if (cleaned.startsWith("8")) cleaned = "+7" + cleaned.slice(1);
      if (cleaned.startsWith("7") && !cleaned.startsWith("+")) cleaned = "+" + cleaned;
      return cleaned;
    };

    const normalizedPhone = phone ? normalizePhone(phone) : null;

    console.log("[Telegram Login] Данные от Telegram:", {
      telegramId: id,
      phone: normalizedPhone ? "****" + normalizedPhone.slice(-4) : "не передан",
      username,
      firstName: first_name,
    });

    const session = await getServerSession(authOptions);
    
    let user;
    let isNewUser = false;

    if (session?.user?.id) {
      // Привязка Telegram к залогиненному аккаунту
      console.log("[Telegram Login] 🔗 Привязываем Telegram к аккаунту:", session.user.id);
      
      const existingTgUser = await prisma.user.findUnique({ where: { telegramChatId: id } });
      
      if (existingTgUser && existingTgUser.id !== session.user.id) {
        console.log("[Telegram Login] ⚠️ Telegram привязан к другому аккаунту, объединяем:", existingTgUser.id);
        await prisma.document.updateMany({ where: { userId: existingTgUser.id }, data: { userId: session.user.id } });
        await prisma.membershipHistory.updateMany({ where: { userId: existingTgUser.id }, data: { userId: session.user.id } });
        await prisma.sMSPinCode.deleteMany({ where: { userId: existingTgUser.id } });
        await prisma.loginToken.deleteMany({ where: { userId: existingTgUser.id } });
        await prisma.emailPinCode.deleteMany({ where: { userId: existingTgUser.id } });
        await prisma.pushSubscription.deleteMany({ where: { userId: existingTgUser.id } });
        await prisma.phoneHistory.deleteMany({ where: { userId: existingTgUser.id } });
        await prisma.user.delete({ where: { id: existingTgUser.id } });
        console.log("[Telegram Login] ✅ Аккаунты объединены");
      }
      
      const currentUser = await prisma.user.findUnique({ where: { id: session.user.id } });
      
      const newFirstName = pickName(currentUser?.firstName, first_name);
      const newLastName = pickName(currentUser?.lastName, last_name);

      user = await prisma.user.update({
        where: { id: session.user.id },
        data: {
          telegramChatId: id,
          telegramUsername: username || currentUser?.telegramUsername || undefined,
          ...(newFirstName !== undefined ? { firstName: newFirstName } : {}),
          ...(newLastName !== undefined ? { lastName: newLastName } : {}),
          avatarUrl: currentUser?.avatarUrl || photo_url || undefined,
        },
      });
      
      console.log("[Telegram Login] ✅ Telegram привязан к существующему аккаунту");
    } else {
      // Поиск или создание

      // 1. По telegramChatId
      user = await prisma.user.findUnique({ where: { telegramChatId: id } });

      // 2. По username
      if (!user && username) {
        user = await prisma.user.findFirst({
          where: { telegramUsername: { equals: username, mode: "insensitive" } },
        });
        if (user) {
          console.log("[Telegram Login] 🔗 Найден по username:", user.id);
          const fn = pickName(user.firstName, first_name);
          const ln = pickName(user.lastName, last_name);
          user = await prisma.user.update({
            where: { id: user.id },
            data: {
              telegramChatId: id,
              telegramUsername: username || user.telegramUsername,
              ...(fn !== undefined ? { firstName: fn } : {}),
              ...(ln !== undefined ? { lastName: ln } : {}),
              avatarUrl: photo_url || user.avatarUrl,
            },
          });
        }
      }

      // 3. По телефону
      if (!user && normalizedPhone) {
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
          console.log("[Telegram Login] 🔗 Найден по телефону:", user.id);

          const existingTgUser = await prisma.user.findUnique({ where: { telegramChatId: id } });
          if (existingTgUser && existingTgUser.id !== user.id) {
            console.log("[Telegram Login] ⚠️ Объединяем аккаунты:", existingTgUser.id);
            await prisma.document.updateMany({ where: { userId: existingTgUser.id }, data: { userId: user.id } });
            await prisma.membershipHistory.updateMany({ where: { userId: existingTgUser.id }, data: { userId: user.id } });
            await prisma.sMSPinCode.deleteMany({ where: { userId: existingTgUser.id } });
            await prisma.loginToken.deleteMany({ where: { userId: existingTgUser.id } });
            await prisma.emailPinCode.deleteMany({ where: { userId: existingTgUser.id } });
            await prisma.pushSubscription.deleteMany({ where: { userId: existingTgUser.id } });
            await prisma.phoneHistory.deleteMany({ where: { userId: existingTgUser.id } });
            await prisma.user.delete({ where: { id: existingTgUser.id } });
            console.log("[Telegram Login] ✅ Аккаунты объединены");
          }

          const fn = pickName(user.firstName, first_name);
          const ln = pickName(user.lastName, last_name);
          const updateData: Record<string, unknown> = {
            telegramChatId: id,
            telegramUsername: username || user.telegramUsername,
            ...(fn !== undefined ? { firstName: fn } : {}),
            ...(ln !== undefined ? { lastName: ln } : {}),
            phone: normalizedPhone,
          };
          if (!user.authPhone && normalizedPhone) {
            updateData.authPhone = normalizedPhone;
          }

          user = await prisma.user.update({ where: { id: user.id }, data: updateData });
          console.log("[Telegram Login] ✅ Синхронизирован: SMS ↔ Telegram");
        }
      }

      isNewUser = !user;

      if (user && !isNewUser) {
        console.log("[Telegram Login] Пользователь найден:", user.id);
        const fn = pickName(user.firstName, first_name);
        const ln = pickName(user.lastName, last_name);
        user = await prisma.user.update({
          where: { id: user.id },
          data: {
            telegramUsername: username || user.telegramUsername,
            ...(fn !== undefined ? { firstName: fn } : {}),
            ...(ln !== undefined ? { lastName: ln } : {}),
            phone: normalizedPhone || user.phone,
          },
        });
      } else if (isNewUser) {
        console.log("[Telegram Login] Создаем нового пользователя");
        
        const existingTgUser = await prisma.user.findUnique({ where: { telegramChatId: id } });
        
        if (existingTgUser) {
          console.log("[Telegram Login] ⚠️ Найден по Telegram ID, используем его:", existingTgUser.id);
          const fn = pickName(existingTgUser.firstName, first_name);
          const ln = pickName(existingTgUser.lastName, last_name);
          user = await prisma.user.update({
            where: { id: existingTgUser.id },
            data: {
              telegramUsername: username || existingTgUser.telegramUsername,
              ...(fn !== undefined ? { firstName: fn } : {}),
              ...(ln !== undefined ? { lastName: ln } : {}),
              phone: normalizedPhone || existingTgUser.phone,
            },
          });
          isNewUser = false;
        } else {
          try {
            user = await prisma.user.create({
              data: {
                telegramChatId: id,
                telegramUsername: username || null,
                firstName: first_name ? translitLatinToCyrillic(first_name) : null,
                lastName: last_name ? translitLatinToCyrillic(last_name) : null,
                phone: normalizedPhone,
                authPhone: normalizedPhone,
                role: "PENDING_MEMBER",
                membershipStatus: "PROFILE_INCOMPLETE",
              },
            });
            console.log("[Telegram Login] Новый пользователь создан:", user.id);
          } catch (createError: unknown) {
            const prismaErr = createError as { code?: string };
            if (prismaErr?.code === "P2002") {
              console.log("[Telegram Login] ⚠️ Ошибка уникальности, ищем существующего");
              const foundUser = await prisma.user.findUnique({ where: { telegramChatId: id } });
              if (foundUser) {
                user = foundUser;
                isNewUser = false;
              } else {
                throw createError;
              }
            } else {
              throw createError;
            }
          }
        }
      }
    }

    // Временный токен для автоматической авторизации
    const loginToken = crypto.randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

    await prisma.loginToken.create({
      data: { token: loginToken, userId: user.id, expiresAt },
    });

    const host = request.headers.get("host") || "localhost:3000";
    const isLocalhost = host.includes("localhost") || host.includes("127.0.0.1");
    
    let baseUrl: string;
    if (process.env.NEXTAUTH_URL) {
      baseUrl = process.env.NEXTAUTH_URL;
    } else if (process.env.NEXT_PUBLIC_APP_URL) {
      baseUrl = process.env.NEXT_PUBLIC_APP_URL;
    } else if (isLocalhost) {
      baseUrl = `http://${host}`;
    } else {
      const proto = request.headers.get("x-forwarded-proto") || (request.url.startsWith("https") ? "https" : "http");
      baseUrl = `${proto}://${host}`;
    }

    if (isWidgetAuth) {
      const redirectUrl = new URL(`/auth/telegram/success?token=${loginToken}`, baseUrl);
      return NextResponse.redirect(redirectUrl);
    }

    const { sendNewUserWelcome, sendReturningUserWelcome, sendTelegramMessage } = await import("@/lib/telegram-bot");
    
    if (!user.phone) {
      await sendTelegramMessage(
        id,
        `👋 <b>Добро пожаловать в МойСоюз!</b>\n\nДля завершения регистрации нам нужен ваш номер телефона.\n\nПоделитесь номером телефона, нажав кнопку ниже:`,
      );
      
      const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
      if (TELEGRAM_BOT_TOKEN) {
        await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
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
    return NextResponse.redirect(redirectUrl);
  } catch (error) {
    console.error("[Telegram Login] Ошибка:", error);
    return NextResponse.redirect(new URL("/login?error=server_error", request.url));
  }
}
