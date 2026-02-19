import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { prisma } from "@/lib/prisma";
import { sendMaxWelcomeMessage, sendMaxLoginLink } from "@/lib/max-messenger";

const LOGIN_TRIGGERS = ["/login", "/start", "вход", "войти", "логин", "login"];

function normalizeLoginTrigger(t: string): string {
  return t.trim().toLowerCase().replace(/^\/+/, "");
}

function isLoginRequest(text: string): boolean {
  if (!text || typeof text !== "string") return false;
  const n = normalizeLoginTrigger(text);
  return LOGIN_TRIGGERS.some((trigger) => n === trigger || n === trigger.replace("/", ""));
}

function getBaseUrl(request: NextRequest): string {
  const host = request.headers.get("host") || "localhost:3000";
  const isLocalhost = host.includes("localhost") || host.includes("127.0.0.1");
  if (process.env.NEXTAUTH_URL) return process.env.NEXTAUTH_URL;
  if (process.env.NEXT_PUBLIC_APP_URL) return process.env.NEXT_PUBLIC_APP_URL;
  if (isLocalhost) return `http://${host}`;
  const proto = request.headers.get("x-forwarded-proto") || "https";
  return `${proto}://${host}`;
}

/**
 * POST /api/max/webhook
 * Webhook для получения обновлений от MAX Bot
 * Документация: https://github.com/max-messenger/max-bot-api-client-ts/tree/main/docs
 */
export async function POST(request: NextRequest) {
  try {
    const update = await request.json();

    console.log("[MAX Webhook] Получено обновление:", JSON.stringify(update, null, 2));

    // Сообщение от пользователя: /login, "вход" и т.д. — отправляем ссылку для входа (как в Telegram)
    // Поддержка разных форматов: message_created, message.text, payload.text
    const messageText =
      update.message?.text ??
      update.payload?.text ??
      update.payload?.message?.text ??
      update.text;
    const chatId =
      update.chat?.id ??
      update.message?.chat_id ??
      update.message?.chat?.id ??
      update.payload?.chat_id ??
      update.payload?.message?.chat_id;
    const userId =
      update.message?.sender?.user_id ??
      update.chat?.user_id ??
      update.from?.id ??
      update.payload?.sender?.user_id ??
      update.payload?.from?.id ??
      chatId;

    if (chatId && isLoginRequest(messageText)) {
      const chatIdStr = String(chatId);
      const userIdStr = String(userId);

      let user =
        (await prisma.user.findFirst({
          where: {
            OR: [{ maxUserId: userIdStr }, { maxChatId: chatIdStr }],
          },
        })) ?? null;

      if (!user) {
        user = await prisma.user.create({
          data: {
            maxUserId: userIdStr,
            maxChatId: chatIdStr,
            role: "PENDING_MEMBER",
            membershipStatus: "PROFILE_INCOMPLETE",
          },
        });
        console.log("[MAX Webhook] Создан новый пользователь по запросу входа:", user.id);
      }

      const loginToken = crypto.randomBytes(32).toString("hex");
      const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
      await prisma.loginToken.create({
        data: { token: loginToken, userId: user.id, expiresAt },
      });

      const baseUrl = getBaseUrl(request);
      const loginUrl = `${baseUrl}/api/auth/telegram/auto-login?token=${loginToken}`;

      await sendMaxLoginLink(chatIdStr, loginUrl, user.firstName ?? undefined);
      console.log("[MAX Webhook] Отправлена ссылка для входа пользователю:", user.id);
      return NextResponse.json({ success: true });
    }

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
        // Обновляем maxChatId и maxUserId (в личном чате chat_id обычно совпадает с user_id)
        await prisma.user.update({
          where: { id: user.id },
          data: {
            maxChatId: chatId.toString(),
            maxUserId: user.maxUserId ?? chatId.toString(),
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

