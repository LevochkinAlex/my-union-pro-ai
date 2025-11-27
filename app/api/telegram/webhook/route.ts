import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendWelcomeMessage } from "@/lib/telegram-bot";

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
      const phone = text.replace("/start AUTH_phone_", "");
      
      console.log("[Telegram Webhook] Попытка привязки Telegram к номеру:", phone);

      // Ищем пользователя по номеру телефона
      const user = await prisma.user.findUnique({
        where: { phone },
      });

      if (!user) {
        console.error("[Telegram Webhook] Пользователь не найден для номера:", phone);
        return NextResponse.json({ 
          ok: true,
          error: "Пользователь не найден" 
        });
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
        // TODO: Отправить инструкцию, как привязать аккаунт
      }

      return NextResponse.json({ ok: true });
    }

    // Игнорируем остальные сообщения
    console.log("[Telegram Webhook] Неизвестная команда:", text);
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

