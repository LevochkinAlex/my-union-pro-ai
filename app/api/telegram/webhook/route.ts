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

      // Сначала проверяем, есть ли пользователь с этим номером
      let existingUserByPhone = await prisma.user.findUnique({
        where: { phone: normalizedPhone },
      });

      // Ищем пользователя по telegramChatId
      let user = await prisma.user.findUnique({
        where: { telegramChatId: chatId },
      });

      // Если есть пользователь с этим номером, но другой telegramChatId - привязываем
      if (existingUserByPhone && (!user || user.id !== existingUserByPhone.id)) {
        console.log("[Telegram Webhook] Найден пользователь по номеру, привязываем Telegram:", {
          userId: existingUserByPhone.id,
          phone: normalizedPhone,
          existingTelegramChatId: existingUserByPhone.telegramChatId,
          newTelegramChatId: chatId,
        });

        // Если у существующего пользователя уже есть другой telegramChatId, обновляем
        if (existingUserByPhone.telegramChatId && existingUserByPhone.telegramChatId !== chatId) {
          console.log("[Telegram Webhook] У пользователя уже есть другой telegramChatId, обновляем");
        }

        // Привязываем Telegram к существующему пользователю
        // ВАЖНО: НЕ заменяем существующие данные, только дополняем пустые поля
        const updateData: any = {
          telegramChatId: chatId,
          telegramUsername: from?.username || existingUserByPhone.telegramUsername || null,
          // Приоритет существующим данным! Telegram данные только если пусто
          firstName: existingUserByPhone.firstName || user?.firstName || from?.first_name || null,
          lastName: existingUserByPhone.lastName || user?.lastName || from?.last_name || null,
          phone: normalizedPhone, // Обновляем номер на нормализованный
        };
        
        // Аватар ТОЛЬКО если его не было
        if (!existingUserByPhone.avatarUrl && from?.photo_url) {
          updateData.avatarUrl = from.photo_url;
        }
        
        // Если authPhone еще не установлен, устанавливаем его
        if (!existingUserByPhone.authPhone && normalizedPhone) {
          updateData.authPhone = normalizedPhone;
          console.log("[Telegram Webhook] Устанавливаем authPhone при привязке Telegram:", normalizedPhone);
        }
        
        user = await prisma.user.update({
          where: { id: existingUserByPhone.id },
          data: updateData,
        });
        console.log("[Telegram Webhook] ✅ Telegram привязан к существующему пользователю:", user.id);
      } else if (!user) {
        // Создаем нового пользователя с Telegram
        console.log("[Telegram Webhook] Создаем нового пользователя для Telegram:", chatId);
        user = await prisma.user.create({
          data: {
            telegramChatId: chatId,
            telegramUsername: from?.username || null,
            firstName: from?.first_name || null,
            lastName: from?.last_name || null,
            phone: normalizedPhone,
            authPhone: normalizedPhone, // Устанавливаем authPhone при первой авторизации через Telegram
            role: "PENDING_MEMBER",
            membershipStatus: "PROFILE_INCOMPLETE",
          },
        });
        console.log("[Telegram Webhook] ✅ Создан новый пользователь:", user.id);
      } else {
        // Пользователь найден по telegramChatId, обновляем номер если нужно
        const updateData: any = {};
        if (user.phone !== normalizedPhone) {
          updateData.phone = normalizedPhone;
          console.log("[Telegram Webhook] Обновляем номер телефона для пользователя:", user.id);
        }
        
        // Если authPhone еще не установлен, устанавливаем его
        if (!user.authPhone && normalizedPhone) {
          updateData.authPhone = normalizedPhone;
          console.log("[Telegram Webhook] Устанавливаем authPhone при обновлении номера:", normalizedPhone);
        }
        
        if (Object.keys(updateData).length > 0) {
          user = await prisma.user.update({
            where: { id: user.id },
            data: updateData,
          });
        }
      }

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
        // ВАЖНО: НЕ заменяем существующие данные, только дополняем пустые поля
        const mergeUpdateData: any = {
          telegramChatId: user.telegramChatId,
          telegramUsername: user.telegramUsername || existingUser.telegramUsername,
          // Приоритет существующим данным! Telegram данные только если пусто
          firstName: existingUser.firstName || user.firstName,
          lastName: existingUser.lastName || user.lastName,
        };
        
        // Аватар ТОЛЬКО если его не было
        if (!existingUser.avatarUrl && user.avatarUrl) {
          mergeUpdateData.avatarUrl = user.avatarUrl;
        }
        
        await prisma.user.update({
          where: { id: existingUser.id },
          data: mergeUpdateData,
        });

        // Удаляем дубликат
        await prisma.user.delete({
          where: { id: user.id },
        });

        // Создаем токен для автоматической авторизации
        const crypto = await import("crypto");
        const loginToken = crypto.randomBytes(32).toString("hex");
        const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 минут

        await prisma.loginToken.create({
          data: {
            token: loginToken,
            userId: existingUser.id,
            expiresAt,
          },
        });

        // Определяем правильный baseUrl
        const host = request.headers.get("host") || "localhost:3000";
        const isLocalhost = host.includes("localhost") || host.includes("127.0.0.1");
        const baseUrl = isLocalhost 
          ? `http://${host}` 
          : (process.env.NEXT_PUBLIC_APP_URL || "https://myunion.pro");
        
        const loginUrl = `${baseUrl}/api/auth/telegram/auto-login?token=${loginToken}`;

        const name = existingUser.firstName ? `, ${existingUser.firstName}` : "";
        await sendTelegramMessage(
          chatId,
          `✅ <b>Аккаунты успешно синхронизированы${name}!</b>

Ваш аккаунт Telegram теперь привязан к номеру телефона <code>${normalizedPhone}</code>.

Нажмите кнопку ниже для входа в личный кабинет:

⏱ <i>Ссылка действительна 10 минут</i>`
        );

        // Отправляем кнопку для входа
        const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
        if (TELEGRAM_BOT_TOKEN) {
          const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
          
          try {
            await fetch(url, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                chat_id: chatId,
                text: "Войти в аккаунт:",
                parse_mode: "HTML",
                reply_markup: {
                  inline_keyboard: [
                    [
                      {
                        text: "🔐 Войти в аккаунт",
                        url: loginUrl,
                      },
                    ],
                  ],
                },
              }),
            });
          } catch (error) {
            console.error("[Telegram Webhook] Ошибка при отправке кнопки после объединения:", error);
          }
        }

        return NextResponse.json({ ok: true });
      }

      // Проверяем, новый ли это пользователь (нет номера телефона)
      // Если у пользователя раньше не было номера, предлагаем выбор регистрации
      const hadNoPhone = !user.phone;
      
      console.log("[Telegram Webhook] Обработка контакта:", {
        userId: user.id,
        hadNoPhone,
        currentPhone: user.phone,
        newPhone: normalizedPhone,
      });
      
      if (hadNoPhone) {
        // Новый пользователь или пользователь без номера - сохраняем номер и авторизуем на сайте
        console.log("[Telegram Webhook] Пользователь без номера, сохраняем номер и авторизуем на сайте");
        
        // Сохраняем номер
        await prisma.user.update({
          where: { id: user.id },
          data: { phone: normalizedPhone },
        });
        
        // Создаем токен для автоматической авторизации
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

        console.log("[Telegram Webhook] Создан токен для автоматической авторизации");

        // Определяем правильный baseUrl
        const host = request.headers.get("host") || "localhost:3000";
        const isLocalhost = host.includes("localhost") || host.includes("127.0.0.1");
        const baseUrl = isLocalhost 
          ? `http://${host}` 
          : (process.env.NEXT_PUBLIC_APP_URL || "https://myunion.pro");
        
        const loginUrl = `${baseUrl}/api/auth/telegram/auto-login?token=${loginToken}`;
        
        // Отправляем приветствие с кнопкой для входа на сайт
        await sendTelegramMessage(
          chatId,
          `👋 <b>Алоха!</b>

Отлично, ваш номер <code>${normalizedPhone}</code> получен! 

Нажмите кнопку ниже, чтобы перейти на сайт и завершить регистрацию:

⏱ <i>Ссылка действительна 10 минут</i>`
        );
        
        // Отправляем кнопку для входа
        const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
        if (!TELEGRAM_BOT_TOKEN) {
          console.error("[Telegram Webhook] TELEGRAM_BOT_TOKEN не установлен!");
          return NextResponse.json({ ok: false, error: "Bot token not configured" }, { status: 500 });
        }
        
        const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
        
        try {
          const response = await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              chat_id: chatId,
              text: "Перейти на сайт для регистрации:",
              parse_mode: "HTML",
              reply_markup: {
                inline_keyboard: [
                  [
                    {
                      text: "🔐 Перейти на сайт",
                      url: loginUrl,
                    },
                  ],
                ],
              },
            }),
          });
          
          const result = await response.json();
          console.log("[Telegram Webhook] Результат отправки сообщения с кнопкой:", result);
          
          if (!result.ok) {
            console.error("[Telegram Webhook] Ошибка отправки сообщения:", result);
            // Пробуем отправить простое сообщение со ссылкой
            await sendTelegramMessage(
              chatId,
              `🔐 <b>Перейдите на сайт для регистрации:</b>

${loginUrl}

⏱ <i>Ссылка действительна 10 минут</i>`
            );
          }
        } catch (error) {
          console.error("[Telegram Webhook] Ошибка при отправке сообщения:", error);
          // Пробуем отправить простое сообщение со ссылкой
          await sendTelegramMessage(
            chatId,
            `🔐 <b>Перейдите на сайт для регистрации:</b>

${loginUrl}

⏱ <i>Ссылка действительна 10 минут</i>`
          );
        }
      } else {
        // Существующий пользователь - обновляем номер и авторизуем на сайте
        console.log("[Telegram Webhook] Пользователь уже имел номер, обновляем и авторизуем");
        
        // Обновляем номер (если изменился)
        await prisma.user.update({
          where: { id: user.id },
          data: { phone: normalizedPhone },
        });

        // Создаем токен для автоматической авторизации
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

        console.log("[Telegram Webhook] Создан токен для автоматической авторизации (возвращающийся пользователь)");

        // Определяем правильный baseUrl
        const host = request.headers.get("host") || "localhost:3000";
        const isLocalhost = host.includes("localhost") || host.includes("127.0.0.1");
        const baseUrl = isLocalhost 
          ? `http://${host}` 
          : (process.env.NEXT_PUBLIC_APP_URL || "https://myunion.pro");
        
        const loginUrl = `${baseUrl}/api/auth/telegram/auto-login?token=${loginToken}`;
        
        // Отправляем приветствие для возвращающегося пользователя
        const name = user.firstName ? `, ${user.firstName}` : "";
        await sendTelegramMessage(
          chatId,
          `🎉 <b>Рад видеть вас снова${name}!</b>

Ваш номер <code>${normalizedPhone}</code> обновлен.

Нажмите кнопку ниже для входа в личный кабинет:

⏱ <i>Ссылка действительна 10 минут</i>`
        );
        
        // Отправляем кнопку для входа
        const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
        if (!TELEGRAM_BOT_TOKEN) {
          console.error("[Telegram Webhook] TELEGRAM_BOT_TOKEN не установлен!");
          return NextResponse.json({ ok: false, error: "Bot token not configured" }, { status: 500 });
        }
        
        const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
        
        try {
          const response = await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              chat_id: chatId,
              text: "Войти в аккаунт:",
              parse_mode: "HTML",
              reply_markup: {
                inline_keyboard: [
                  [
                    {
                      text: "🔐 Войти в аккаунт",
                      url: loginUrl,
                    },
                  ],
                ],
              },
            }),
          });
          
          const result = await response.json();
          console.log("[Telegram Webhook] Результат отправки сообщения с кнопкой (возвращающийся):", result);
          
          if (!result.ok) {
            console.error("[Telegram Webhook] Ошибка отправки сообщения:", result);
            // Пробуем отправить простое сообщение со ссылкой
            await sendTelegramMessage(
              chatId,
              `🔐 <b>Перейдите на сайт для входа:</b>

${loginUrl}

⏱ <i>Ссылка действительна 10 минут</i>`
            );
          }
        } catch (error) {
          console.error("[Telegram Webhook] Ошибка при отправке сообщения:", error);
          // Пробуем отправить простое сообщение со ссылкой
          await sendTelegramMessage(
            chatId,
            `🔐 <b>Перейдите на сайт для входа:</b>

${loginUrl}

⏱ <i>Ссылка действительна 10 минут</i>`
          );
        }
      }

      return NextResponse.json({ ok: true });
    }

    // Если нет текста и нет контакта - игнорируем
    if (!text) {
      console.log("[Telegram Webhook] Сообщение не содержит текста");
      return NextResponse.json({ ok: true });
    }

    // Команда /start с параметром для привязки номера телефона
    // Форматы: /start AUTH_phone_79991234567 или /start link_phone_79991234567
    // Проверяем ДО всех остальных команд, чтобы не попасть в техподдержку
    const trimmedText = text.trim();
    if (trimmedText.startsWith("/start AUTH_phone_") || trimmedText.startsWith("/start link_phone_")) {
      console.log("[Telegram Webhook] 🔗 Обработка команды привязки телефона:", trimmedText);
      const phoneParam = trimmedText.replace("/start AUTH_phone_", "").replace("/start link_phone_", "").trim();
      // Нормализуем номер (добавляем + если его нет)
      let phone = phoneParam.startsWith("+") ? phoneParam : `+${phoneParam}`;
      
      // Если номер начинается с 7 без +, добавляем +
      if (phone.startsWith("7") && !phone.startsWith("+")) {
        phone = "+" + phone;
      }
      
      console.log("[Telegram Webhook] Попытка привязки Telegram к номеру:", phone);

      // Нормализуем номер для поиска
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
      
      const normalizedPhone = normalizePhone(phone);
      
      // Ищем пользователя по номеру телефона (пробуем разные варианты)
      // Проверяем и phone, и authPhone - ВАЖНО: ищем существующих пользователей, не создаем новых
      const phoneVariants = normalizedPhone.startsWith("+") 
        ? [
            normalizedPhone,
            normalizedPhone.replace("+", ""),
            normalizedPhone.replace("+7", "7"),
            normalizedPhone.replace("+7", "8"),
          ]
        : [normalizedPhone];
      
      let user = await prisma.user.findFirst({
        where: {
          OR: [
            ...phoneVariants.map(phone => ({ phone })),
            ...phoneVariants.map(phone => ({ authPhone: phone })),
          ],
        },
      });
      
      console.log("[Telegram Webhook] Поиск пользователя для привязки:", {
        normalizedPhone,
        phoneVariants,
        найден: !!user,
        userId: user?.id,
        phone: user?.phone,
        authPhone: user?.authPhone,
        telegramChatId: user?.telegramChatId,
      });

      // Если пользователь не найден, НЕ создаем нового при привязке через link_phone
      // Это привязка существующего аккаунта, а не регистрация нового
      if (!user) {
        console.log("[Telegram Webhook] ⚠️ Пользователь не найден для номера:", normalizedPhone);
        console.log("[Telegram Webhook] Это привязка существующего аккаунта, пользователь должен сначала зарегистрироваться через сайт");
        
        await sendTelegramMessage(
          chatId,
          `❌ <b>Аккаунт не найден</b>

Для привязки Telegram к вашему аккаунту:
1. Сначала зарегистрируйтесь на сайте <a href="https://myunion.pro/login">myunion.pro</a>
2. После регистрации вернитесь и привяжите Telegram

Если вы уже зарегистрированы, убедитесь, что номер телефона совпадает: <code>${normalizedPhone}</code>`
        );
        
        return NextResponse.json({ ok: true });
      }
      
      console.log("[Telegram Webhook] ✅ Найден существующий пользователь для привязки:", {
        userId: user.id,
        phone: user.phone,
        authPhone: user.authPhone,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
      });

      // Проверяем, не привязан ли уже этот telegramChatId к другому пользователю
      if (user.telegramChatId && user.telegramChatId !== chatId) {
        console.log("[Telegram Webhook] У пользователя уже есть другой telegramChatId, обновляем");
      }
      
      // Проверяем, не используется ли этот chatId другим пользователем
      const existingUserWithChatId = await prisma.user.findUnique({
        where: { telegramChatId: chatId },
      });
      
      if (existingUserWithChatId && existingUserWithChatId.id !== user.id) {
        console.log("[Telegram Webhook] ⚠️ Этот telegramChatId уже привязан к другому пользователю:", existingUserWithChatId.id);
        // Отвязываем от старого пользователя
        await prisma.user.update({
          where: { id: existingUserWithChatId.id },
          data: { telegramChatId: null },
        });
        console.log("[Telegram Webhook] Старый пользователь отвязан от Telegram");
      }
      
      // Привязываем Telegram chat_id к пользователю (если еще не привязан)
      // ВАЖНО: обновляем ТОЛЬКО telegramChatId и telegramUsername, НЕ трогаем остальные данные
      // Prisma update обновляет только указанные поля, остальные остаются без изменений
      const updateData: any = {
        telegramChatId: chatId,
        telegramUsername: from?.username || user.telegramUsername || null,
      };
      
      // Если authPhone еще не установлен, устанавливаем его (но не перезаписываем если уже есть)
      if (!user.authPhone && normalizedPhone) {
        updateData.authPhone = normalizedPhone;
        console.log("[Telegram Webhook] Устанавливаем authPhone при привязке Telegram:", normalizedPhone);
      }
      
      // Обновляем номер телефона на нормализованный ТОЛЬКО если он отсутствует или пустой
      // НЕ перезаписываем существующий номер, чтобы не потерять данные
      if (!user.phone || user.phone.trim() === "") {
        // Если у пользователя нет номера или он пустой, устанавливаем из authPhone или normalizedPhone
        updateData.phone = user.authPhone || normalizedPhone;
        console.log("[Telegram Webhook] Устанавливаем номер телефона из authPhone:", updateData.phone);
      } else {
        // Если номер уже есть, проверяем только формат (не меняем сам номер)
        const userPhoneDigits = user.phone.replace(/\D/g, "");
        const newPhoneDigits = normalizedPhone.replace(/\D/g, "");
        // Обновляем только если номера действительно разные (не просто формат)
        if (userPhoneDigits !== newPhoneDigits && userPhoneDigits.length > 0) {
          console.log("[Telegram Webhook] ⚠️ Номер телефона отличается, но не обновляем чтобы не потерять данные:", {
            текущий: user.phone,
            новый: normalizedPhone,
          });
          // НЕ обновляем, чтобы не потерять данные
        }
      }
      
      console.log("[Telegram Webhook] Обновление пользователя (сохраняем все существующие данные):", {
        userId: user.id,
        updateData,
        существующиеДанные: {
          firstName: user.firstName,
          lastName: user.lastName,
          email: user.email,
          phone: user.phone,
          authPhone: user.authPhone,
        },
      });
      
      try {
        user = await prisma.user.update({
          where: { id: user.id },
          data: updateData,
        });
      } catch (updateError: any) {
        if (updateError.code === "P2002" && updateError.meta?.target?.includes("telegramChatId")) {
          // Если все еще конфликт, пробуем еще раз после небольшой задержки
          console.log("[Telegram Webhook] Конфликт telegramChatId, пробуем еще раз...");
          await new Promise(resolve => setTimeout(resolve, 100));
          
          // Снова отвязываем от всех других пользователей
          await prisma.user.updateMany({
            where: { 
              telegramChatId: chatId,
              id: { not: user.id },
            },
            data: { telegramChatId: null },
          });
          
          // Теперь обновляем текущего пользователя
          user = await prisma.user.update({
            where: { id: user.id },
            data: updateData,
          });
        } else {
          throw updateError;
        }
      }

      console.log("[Telegram Webhook] ✅ Telegram успешно привязан к пользователю:", user.id);

      // Отправляем сообщение об успешной привязке
      await sendTelegramMessage(
        chatId,
        `✅ <b>Telegram успешно привязан!</b>

Ваш номер телефона <code>${normalizedPhone}</code> теперь связан с Telegram.

Теперь при входе через SMS код будет приходить в Telegram вместо платных SMS.

Используйте команды:
• /start login - войти в аккаунт
• /phone - обновить номер телефона
• /help - помощь`
      );

      return NextResponse.json({ ok: true });
    }

    // Команда /restart - то же самое, что /start
    // НО проверяем, что это НЕ команда с параметром (link_phone_ или AUTH_phone_)
    const isStartCommand = (text === "/restart" || text === "/start") && 
                           !trimmedText.startsWith("/start AUTH_phone_") && 
                           !trimmedText.startsWith("/start link_phone_");

    // Обычная команда /start (без параметра)
    if (isStartCommand) {
      // Проверяем, есть ли уже пользователь с этим chat_id
      let user = await prisma.user.findUnique({
        where: { telegramChatId: chatId },
      });

      // Если не нашли по chat_id, но пользователь мог предоставить номер ранее
      // Проверяем, может быть нужно привязать существующего пользователя
      if (!user) {
        console.log("[Telegram Webhook] Chat ID не найден, запрашиваем номер для привязки");
      }

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
          // У пользователя уже есть номер - создаем токен и отправляем кнопку для входа
          console.log("[Telegram Webhook] Пользователь с номером, создаем токен для входа");
          
          // Создаем токен для автоматической авторизации
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

          // Определяем правильный baseUrl
          const host = request.headers.get("host") || "localhost:3000";
          const isLocalhost = host.includes("localhost") || host.includes("127.0.0.1");
          const baseUrl = isLocalhost 
            ? `http://${host}` 
            : (process.env.NEXT_PUBLIC_APP_URL || "https://myunion.pro");
          
          const loginUrl = `${baseUrl}/api/auth/telegram/auto-login?token=${loginToken}`;
          
          // Отправляем приветствие для возвращающегося пользователя
          const name = user.firstName ? `, ${user.firstName}` : "";
          await sendTelegramMessage(
            chatId,
            `🎉 <b>Рад видеть вас снова${name}!</b>

Нажмите кнопку ниже для входа в личный кабинет:

⏱ <i>Ссылка действительна 10 минут</i>`
          );
          
          // Отправляем кнопку для входа
          const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
          if (TELEGRAM_BOT_TOKEN) {
            const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
            
            try {
              await fetch(url, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  chat_id: chatId,
                  text: "Войти в аккаунт:",
                  parse_mode: "HTML",
                  reply_markup: {
                    inline_keyboard: [
                      [
                        {
                          text: "🔐 Войти в аккаунт",
                          url: loginUrl,
                        },
                      ],
                    ],
                  },
                }),
              });
            } catch (error) {
              console.error("[Telegram Webhook] Ошибка при отправке кнопки:", error);
            }
          }
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
    // НО только если это НЕ команда (команды уже обработаны выше)
    // Игнорируем команды, которые начинаются с /
    if (!text.startsWith("/")) {
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

