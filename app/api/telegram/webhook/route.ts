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

    // Обработка callback_query (нажатие на inline кнопки)
    if (update.callback_query) {
      const callback = update.callback_query;
      const callbackChatId = callback.message?.chat?.id?.toString();
      const callbackData = callback.data;

      console.log("[Telegram Webhook] Получен callback_query:", { chatId: callbackChatId, data: callbackData });

      if (callbackData?.startsWith("register_telegram_")) {
        const phone = callbackData.replace("register_telegram_", "");
        
        // Ищем пользователя
        const user = await prisma.user.findUnique({
          where: { telegramChatId: callbackChatId },
        });

        if (user) {
          // Обновляем пользователя - регистрация в Telegram
          await prisma.user.update({
            where: { id: user.id },
            data: {
              phone: phone,
              role: "PENDING_MEMBER",
              membershipStatus: "PROFILE_INCOMPLETE",
            },
          });

          // Отвечаем на callback
          const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
          await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/answerCallbackQuery`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              callback_query_id: callback.id,
              text: "Регистрация в Telegram начата!",
            }),
          });

          await sendTelegramMessage(
            callbackChatId!,
            `✅ <b>Регистрация в Telegram начата!</b>

Отлично! Теперь вы можете заполнить профиль прямо здесь в боте.

Используйте команды:
• /profile - заполнить профиль
• /help - помощь

Или перейдите на сайт для полной регистрации: <a href="https://myunion.pro/dashboard">myunion.pro</a>`
          );
        }
      }

      return NextResponse.json({ ok: true });
    }

    // Проверяем, что это сообщение (может быть текст или контакт)
    if (!update.message) {
      console.log("[Telegram Webhook] Обновление не содержит сообщения");
      return NextResponse.json({ ok: true });
    }

    const message = update.message;
    const chatId = message.chat.id.toString();
    const text = message.text;
    const from = message.from;
    const contact = message.contact; // Контакт, если пользователь поделился номером

    console.log("[Telegram Webhook] Получено сообщение:", { chatId, text, hasContact: !!contact });

    // Обработка контакта (когда пользователь делится номером телефона)
    if (contact) {
      console.log("[Telegram Webhook] Получен контакт:", contact.phone_number);
      
      // Проверяем, что это контакт самого пользователя
      if (contact.user_id?.toString() !== chatId) {
        await sendTelegramMessage(
          chatId,
          `❌ <b>Ошибка</b>

Пожалуйста, поделитесь <b>своим</b> номером телефона, используя кнопку "Поделиться номером телефона".

Отправьте /phone чтобы попробовать снова.`
        );
        return NextResponse.json({ ok: true });
      }

      // Ищем пользователя по telegramChatId
      let user = await prisma.user.findUnique({
        where: { telegramChatId: chatId },
      });

      if (!user) {
        // Создаем нового пользователя с Telegram
        console.log("[Telegram Webhook] Создаем нового пользователя для Telegram:", chatId);
        user = await prisma.user.create({
          data: {
            telegramChatId: chatId,
            telegramUsername: from?.username || null,
            firstName: from?.first_name || null,
            lastName: from?.last_name || null,
            role: "PENDING_MEMBER",
            membershipStatus: "PROFILE_INCOMPLETE",
          },
        });
        console.log("[Telegram Webhook] ✅ Создан новый пользователь:", user.id);
      }

      // Нормализуем номер телефона
      const normalizePhone = (phone: string): string => {
        let cleaned = phone.replace(/[\s\-\(\)\+]/g, "");
        if (cleaned.startsWith("8")) {
          cleaned = "7" + cleaned.slice(1);
        }
        if (!cleaned.startsWith("7")) {
          cleaned = "7" + cleaned;
        }
        return "+" + cleaned;
      };

      const normalizedPhone = normalizePhone(contact.phone_number);
      console.log("[Telegram Webhook] Нормализованный телефон:", normalizedPhone);

      // Проверяем, нет ли уже другого пользователя с этим номером
      const existingUser = await prisma.user.findUnique({
        where: { phone: normalizedPhone },
      });

      if (existingUser && existingUser.id !== user.id) {
        // Если есть другой пользователь с таким же номером, объединяем аккаунты
        console.log("[Telegram Webhook] 🔗 Объединяем аккаунты:", {
          telegramUser: user.id,
          phoneUser: existingUser.id,
        });

        // Переносим Telegram данные в аккаунт с телефоном
        await prisma.user.update({
          where: { id: existingUser.id },
          data: {
            telegramChatId: user.telegramChatId,
            telegramUsername: user.telegramUsername,
            firstName: user.firstName || existingUser.firstName,
            lastName: user.lastName || existingUser.lastName,
          },
        });

        // Удаляем дубликат
        await prisma.user.delete({
          where: { id: user.id },
        });

        await sendTelegramMessage(
          chatId,
          `✅ <b>Аккаунты успешно синхронизированы!</b>

Ваш аккаунт Telegram теперь привязан к номеру телефона <code>${normalizedPhone}</code>.

Теперь вы можете входить:
• Через Telegram (быстрый вход через бот)
• Через SMS код на номер ${normalizedPhone}

Оба способа ведут в один аккаунт! 🎉`
        );

        return NextResponse.json({ ok: true });
      }

      // Проверяем, новый ли это пользователь (нет номера телефона и email)
      const isNewUser = !user.phone && !user.email;
      
      if (isNewUser) {
        // Новый пользователь - предлагаем выбор регистрации
        await sendTelegramMessage(
          chatId,
          `👋 <b>Алоха!</b>

Отлично, ваш номер <code>${normalizedPhone}</code> получен! 

Где будем регистрироваться?`,
        );
        
        // Отправляем кнопки выбора
        const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
        const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
        
        await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            chat_id: chatId,
            text: "Выберите способ регистрации:",
            parse_mode: "HTML",
            reply_markup: {
              inline_keyboard: [
                [
                  {
                    text: "📱 В Telegram",
                    callback_data: `register_telegram_${normalizedPhone}`,
                  },
                ],
                [
                  {
                    text: "🌐 На сайте myunion.pro",
                    url: `https://myunion.pro/login?phone=${encodeURIComponent(normalizedPhone)}`,
                  },
                ],
              ],
            },
          }),
        });
        
        // Сохраняем номер временно (будет использован при выборе)
        await prisma.user.update({
          where: { id: user.id },
          data: { phone: normalizedPhone },
        });
      } else {
        // Существующий пользователь - просто привязываем номер
        await prisma.user.update({
          where: { id: user.id },
          data: { phone: normalizedPhone },
        });

        await sendTelegramMessage(
          chatId,
          `✅ <b>Номер телефона успешно привязан!</b>

Ваш номер <code>${normalizedPhone}</code> теперь привязан к аккаунту.

Теперь вы можете входить:
• Через Telegram (быстрый вход через бот)
• Через SMS код на этот номер

Оба способа ведут в ваш аккаунт! 🎉`
        );
      }

      return NextResponse.json({ ok: true });
    }

    // Если нет текста и нет контакта - игнорируем
    if (!text) {
      console.log("[Telegram Webhook] Сообщение не содержит текста");
      return NextResponse.json({ ok: true });
    }

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
        
        // Если у пользователя нет номера - запрашиваем
        if (!user.phone) {
          await sendTelegramMessage(
            chatId,
            `👋 <b>Добро пожаловать в МойСоюз!</b>

Для завершения регистрации нам нужен ваш номер телефона.

Поделитесь номером телефона, нажав кнопку ниже:`,
          );
          
          // Отправляем кнопку для шаринга телефона
          const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
          const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
          
          await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              chat_id: chatId,
              text: "Нажмите кнопку, чтобы поделиться номером:",
              parse_mode: "HTML",
              reply_markup: {
                keyboard: [
                  [
                    {
                      text: "📱 Поделиться номером телефона",
                      request_contact: true,
                    }
                  ]
                ],
                one_time_keyboard: true,
                resize_keyboard: true,
              },
            }),
          });
        } else {
          await sendWelcomeMessage(chatId);
        }
      } else {
        console.log("[Telegram Webhook] Chat ID не привязан к аккаунту");
        // Новый пользователь - запрашиваем номер телефона
        await sendTelegramMessage(
          chatId,
          `👋 <b>Добро пожаловать в МойСоюз!</b>

Для регистрации нам нужен ваш номер телефона.

Поделитесь номером телефона, нажав кнопку ниже:`,
        );
        
        // Отправляем кнопку для шаринга телефона
        const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
        const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
        
        await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            chat_id: chatId,
            text: "Нажмите кнопку, чтобы поделиться номером:",
            parse_mode: "HTML",
            reply_markup: {
              keyboard: [
                [
                  {
                    text: "📱 Поделиться номером телефона",
                    request_contact: true,
                  }
                ]
              ],
              one_time_keyboard: true,
              resize_keyboard: true,
            },
          }),
        });
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
        // Пользователь не привязан - запрашиваем номер телефона
        await sendTelegramMessage(
          chatId,
          `👋 <b>Добро пожаловать в МойСоюз!</b>

Для регистрации или входа нам нужен ваш номер телефона.

Поделитесь номером телефона, нажав кнопку ниже:`,
        );
        
        // Отправляем кнопку для шаринга телефона
        const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
        const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
        
        await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            chat_id: chatId,
            text: "Нажмите кнопку, чтобы поделиться номером:",
            parse_mode: "HTML",
            reply_markup: {
              keyboard: [
                [
                  {
                    text: "📱 Поделиться номером телефона",
                    request_contact: true,
                  }
                ]
              ],
              one_time_keyboard: true,
              resize_keyboard: true,
            },
          }),
        });
        
        return NextResponse.json({ ok: true });
      }
      
      // Если у пользователя нет номера телефона - запрашиваем
      if (!user.phone) {
        await sendTelegramMessage(
          chatId,
          `📱 <b>Нужен номер телефона</b>

Для завершения регистрации поделитесь вашим номером телефона:`,
        );
        
        // Отправляем кнопку для шаринга телефона
        const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
        const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
        
        await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            chat_id: chatId,
            text: "Нажмите кнопку, чтобы поделиться номером:",
            parse_mode: "HTML",
            reply_markup: {
              keyboard: [
                [
                  {
                    text: "📱 Поделиться номером телефона",
                    request_contact: true,
                  }
                ]
              ],
              one_time_keyboard: true,
              resize_keyboard: true,
            },
          }),
        });
        
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

    // Команда /phone - запрос номера телефона для синхронизации
    if (text === "/phone" || text === "/номер") {
      console.log("[Telegram Webhook] Команда /phone от пользователя:", chatId);
      
      // Проверяем, есть ли пользователь с этим chat_id
      const user = await prisma.user.findUnique({
        where: { telegramChatId: chatId },
      });

      if (!user) {
        await sendTelegramMessage(
          chatId,
          `❌ <b>Сначала войдите через Telegram</b>

Для использования этой функции:
1. Перейдите на <a href="https://myunion.pro/login">страницу входа</a>
2. Нажмите "Войти с Telegram"
3. После этого вы сможете привязать номер телефона`
        );
        return NextResponse.json({ ok: true });
      }

      // Отправляем сообщение с кнопкой для шаринга телефона
      const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
      const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
      
      await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: chatId,
          text: `📱 <b>Синхронизация номера телефона</b>

Чтобы вы могли входить как через Telegram, так и через SMS (получая коды на этот номер), поделитесь своим номером телефона.

Нажмите кнопку ниже:`,
          parse_mode: "HTML",
          reply_markup: {
            keyboard: [
              [
                {
                  text: "📱 Поделиться номером телефона",
                  request_contact: true,
                }
              ]
            ],
            one_time_keyboard: true,
            resize_keyboard: true,
          },
        }),
      });

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

