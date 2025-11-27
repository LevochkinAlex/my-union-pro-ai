import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendMaxWelcomeMessage } from "@/lib/max-messenger";

/**
 * POST /api/max/webhook
 * Webhook для получения обновлений от MAX Bot
 * Документация: https://github.com/max-messenger/max-bot-api-client-ts/tree/main/docs
 */
export async function POST(request: NextRequest) {
  try {
    const update = await request.json();

    console.log("[MAX Webhook] Получено обновление:", JSON.stringify(update, null, 2));

    // Обрабатываем событие bot_started (пользователь начал диалог с ботом)
    if (update.event_type === "bot_started") {
      const chatId = update.chat?.id;
      const username = update.chat?.username;
      const phone = update.chat?.phone;

      if (!chatId) {
        console.error("[MAX Webhook] Нет chat_id в обновлении");
        return NextResponse.json({ error: "No chat_id" }, { status: 400 });
      }

      console.log("[MAX Webhook] bot_started от chat_id:", chatId, "username:", username, "phone:", phone);

      // Ищем пользователя по номеру телефона (если есть в update)
      let user = null;
      if (phone) {
        const normalizedPhone = phone.startsWith("+") ? phone : `+${phone}`;
        user = await prisma.user.findUnique({
          where: { phone: normalizedPhone },
        });
      }

      if (user) {
        // Обновляем maxChatId пользователя
        await prisma.user.update({
          where: { id: user.id },
          data: {
            maxChatId: chatId.toString(),
            maxUsername: username || null,
          },
        });

        console.log("[MAX Webhook] ✅ MAX Chat ID привязан к пользователю:", user.id);

        // Отправляем приветственное сообщение
        await sendMaxWelcomeMessage(chatId.toString());

        return NextResponse.json({
          success: true,
          message: "MAX успешно привязан",
        });
      } else {
        console.log("[MAX Webhook] Пользователь не найден по номеру. Ожидаем привязки через deep link.");
        
        // Отправляем инструкцию пользователю
        // TODO: Реализовать отправку инструкции через MAX Bot API
        
        return NextResponse.json({
          success: true,
          message: "Awaiting user link",
        });
      }
    }

    // Обрабатываем другие типы событий при необходимости
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[MAX Webhook] Ошибка при обработке webhook:", error);
    return NextResponse.json(
      {
        error: "Webhook processing error",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}

/**
 * GET /api/max/webhook
 * Проверка работоспособности webhook
 */
export async function GET() {
  return NextResponse.json({
    status: "ok",
    message: "MAX Webhook is running",
  });
}

