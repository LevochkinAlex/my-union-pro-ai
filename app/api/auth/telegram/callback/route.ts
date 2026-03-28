import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { verifyTelegramOAuthSearchParams, resolveTelegramLoginUser } from "@/lib/telegram-oauth-login";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);

    console.log("[Telegram Login] Получен callback:", Object.fromEntries(searchParams));

    const verified = verifyTelegramOAuthSearchParams(searchParams);
    if (verified.ok === false) {
      const err = verified.error;
      console.error("[Telegram Login] Верификация не прошла:", err);
      const map: Record<string, string> = {
        missing_params: "missing_params",
        server_config: "server_config",
        invalid_signature: "invalid_signature",
        data_outdated: "data_outdated",
      };
      return NextResponse.redirect(new URL(`/login?error=${map[err] || "server_error"}`, request.url));
    }

    const { fields } = verified;
    const { id, first_name } = fields;

    console.log("[Telegram Login] Подпись проверена успешно");

    const session = await getServerSession(authOptions);

    const { user, isNewUser } = await resolveTelegramLoginUser(fields, session?.user?.id);

    if (session?.user?.id) {
      console.log("[Telegram Login] ✅ Telegram привязан к существующему аккаунту");
    }

    const source = searchParams.get("source");
    const isWidgetAuth = source === "widget";

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
