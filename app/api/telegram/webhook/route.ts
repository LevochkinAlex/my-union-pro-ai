import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendWelcomeMessage, sendTelegramMessage } from "@/lib/telegram-bot";

/**
 * POST /api/telegram/webhook
 * Webhook для Telegram Bot - получает обновления от Telegram
 * Документация: https://core.telegram.org/bots/api#update
 */
export async function POST(request: NextRequest) {
  try {
    const update = await request.json();

    console.log("[Telegram Webhook] Получено обновление:", JSON.stringify(update, null, 2));

    // Проверяем, что это текстовое сообщение
    if (!update.message || !update.message.text) {
      console.log("[Telegram Webhook] Обновление не содержит текстового сообщения");
      return NextResponse.json({ ok: true });
    }

    const message = update.message;
    const chatId = message.chat.id.toString();
    const text = message.text;
    const from = message.from;

    // Команда /start с параметром для привязки номера телефона
    // Формат: /start AUTH_phone_79991234567
    if (text.startsWith("/start AUTH_phone_")) {
      const phoneParam = text.replace("/start AUTH_phone_", "");
      // Нормализуем номер (добавляем + если его нет)
      const phone = phoneParam.startsWith("+") ? phoneParam : `+${phoneParam}`;
      
      console.log("[Telegram Webhook] Попытка привязки Telegram к номеру:", phone);

      // Ищем пользователя по номеру телефона (пробуем разные варианты)
      let user = await prisma.user.findUnique({
        where: { phone },
      });

      // Если не нашли, пробуем без +
      if (!user && !phone.startsWith("+")) {
        user = await prisma.user.findUnique({
          where: { phone: `+${phone}` },
        });
      } else if (!user && phone.startsWith("+")) {
        user = await prisma.user.findUnique({
          where: { phone: phone.replace("+", "") },
        });
      }

      // Если пользователь не найден, создаем нового
      if (!user) {
        console.log("[Telegram Webhook] Пользователь не найден, создаем нового для номера:", phone);
        user = await prisma.user.create({
          data: {
            phone,
            role: "PENDING_MEMBER",
            membershipStatus: "PROFILE_INCOMPLETE",
          },
        });
        console.log("[Telegram Webhook] ✅ Создан новый пользователь:", user.id);
      }

      // Привязываем Telegram chat_id к пользователю
      await prisma.user.update({
        where: { id: user.id },
        data: {
          telegramChatId: chatId,
          telegramUsername: from.username || null,
        },
      });

      console.log("[Telegram Webhook] Telegram успешно привязан к пользователю:", user.id);

      // Отправляем приветственное сообщение
      await sendWelcomeMessage(chatId);

      return NextResponse.json({ ok: true });
    }

    // Обычная команда /start (без параметра)
    if (text === "/start") {
      // Проверяем, есть ли уже пользователь с этим chat_id
      const user = await prisma.user.findUnique({
        where: { telegramChatId: chatId },
      });

      if (user) {
        console.log("[Telegram Webhook] Пользователь уже привязан:", user.id);
        await sendWelcomeMessage(chatId);
      } else {
        console.log("[Telegram Webhook] Chat ID не привязан к аккаунту");
        // Отправляем инструкцию, как привязать аккаунт
        await sendTelegramMessage(
          chatId,
          `👋 <b>Добро пожаловать в МойСоюз!</b>

Для привязки Telegram к вашему аккаунту:
1. Перейдите на страницу входа: <a href="https://myunion.pro/login">myunion.pro/login</a>
2. Введите ваш номер телефона
3. Нажмите "Привязать Telegram" (если появится такая кнопка)
4. Или используйте ссылку из сообщения об ошибке

После привязки вы будете получать коды для входа прямо здесь! 🚀`
        );
      }

      return NextResponse.json({ ok: true });
    }

    // Команда /start login - авторизация через кнопку в боте
    if (text === "/start login" || text === "/login") {
      console.log("[Telegram Webhook] Команда login от пользователя:", chatId);
      
      // Проверяем, есть ли пользователь с этим chat_id
      const user = await prisma.user.findUnique({
        where: { telegramChatId: chatId },
      });

      if (!user) {
        // Пользователь не привязан - отправляем инструкцию
        await sendTelegramMessage(
          chatId,
          `❌ <b>Telegram не привязан к аккаунту</b>

Для авторизации через Telegram:
1. Перейдите на страницу входа: <a href="https://myunion.pro/login">myunion.pro/login</a>
2. Нажмите кнопку "Войти с Telegram"
3. После авторизации Telegram будет привязан к вашему аккаунту

После привязки вы сможете использовать быстрый вход через бот! 🚀`
        );
        return NextResponse.json({ ok: true });
      }

      // Пользователь привязан - создаем токен и отправляем кнопку для входа
      const crypto = await import("crypto");
      const loginToken = crypto.randomBytes(32).toString("hex");
      const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 минут

      await prisma.loginToken.create({
        data: {
          token: loginToken,
          userId: user.id,
          expiresAt,
        },
      });

      console.log("[Telegram Webhook] Создан токен для быстрого входа");

      // Определяем правильный baseUrl
      const host = request.headers.get("host") || "localhost:3000";
      const isLocalhost = host.includes("localhost") || host.includes("127.0.0.1");
      const baseUrl = isLocalhost 
        ? `http://${host}` 
        : (process.env.NEXT_PUBLIC_APP_URL || "https://myunion.pro");

      // Отправляем сообщение с кнопкой для входа
      const { sendReturningUserWelcome } = await import("@/lib/telegram-bot");
      await sendReturningUserWelcome(chatId, loginToken, user.firstName || undefined, baseUrl);
      
      return NextResponse.json({ ok: true });
    }

    // Команды техподдержки
    if (text === "/help" || text === "/support" || text.toLowerCase() === "помощь" || text.toLowerCase() === "поддержка") {
      const { sendSupportMessage } = await import("@/lib/telegram-bot");
      await sendSupportMessage(chatId, from);
      return NextResponse.json({ ok: true });
    }

    // Обработка вопросов пользователей (техподдержка)
    // Если пользователь привязан, сохраняем вопрос для техподдержки
    const user = await prisma.user.findUnique({
      where: { telegramChatId: chatId },
    });

    if (user) {
      // Пользователь привязан - сохраняем вопрос и отправляем подтверждение
      console.log("[Telegram Webhook] Вопрос от пользователя:", {
        userId: user.id,
        phone: user.phone,
        question: text,
      });

      // Сохраняем вопрос в БД (можно создать таблицу SupportTickets)
      // Пока просто логируем и отправляем подтверждение
      await sendTelegramMessage(
        chatId,
        `✅ <b>Ваш вопрос получен!</b>

Мы получили ваше сообщение и ответим в ближайшее время.

<b>Ваш вопрос:</b>
"${text}"

<b>Часы работы техподдержки:</b> Пн-Пт, 9:00-18:00 МСК

<i>Для срочных вопросов: support@myunion.pro</i>`
      );
    } else {
      // Пользователь не привязан - отправляем инструкцию
      await sendTelegramMessage(
        chatId,
        `❓ <b>Вопрос получен!</b>

Для получения помощи:
1. Сначала привяжите Telegram к вашему аккаунту (команда /start)
2. После привязки вы сможете задавать вопросы техподдержке

Или напишите нам на email: support@myunion.pro`
      );
    }

    return NextResponse.json({ ok: true });

  } catch (error) {
    console.error("[Telegram Webhook] Ошибка обработки webhook:", error);
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}

/**
 * GET /api/telegram/webhook
 * Проверка статуса webhook
 */
export async function GET() {
  return NextResponse.json({
    status: "ok",
    message: "Telegram webhook is ready",
  });
}

