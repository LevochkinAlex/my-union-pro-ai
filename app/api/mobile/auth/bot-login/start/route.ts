import crypto from "crypto";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

const BOT_USERNAME = process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME || "myunionpro_bot";

/**
 * POST /api/mobile/auth/bot-login/start
 * Создаёт одноразовую сессию и URL deep link в бота: https://t.me/BOT?start=app_<key>
 */
export async function POST(request: Request) {
  try {
    let expoHost: string | null = null;
    try {
      const body = (await request.json()) as { expoHost?: string | null };
      const candidate = body?.expoHost?.trim();
      if (candidate && /^[a-zA-Z0-9.\-:]+$/.test(candidate)) {
        expoHost = candidate;
      }
    } catch {
      // body is optional
    }

    await prisma.botAppLoginSession.deleteMany({
      where: { expiresAt: { lt: new Date() } },
    });

    const sessionKey = crypto.randomBytes(16).toString("hex");
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000);

    await prisma.botAppLoginSession.create({
      data: { sessionKey, expiresAt },
    });

    let hostPayload = "";
    if (expoHost) {
      hostPayload = `_${Buffer.from(expoHost, "utf8").toString("base64url")}`;
    }

    const botUrl = `https://t.me/${BOT_USERNAME}?start=app_${sessionKey}${hostPayload}`;

    return NextResponse.json({ botUrl });
  } catch (error) {
    console.error("[mobile/auth/bot-login/start]", error);
    return NextResponse.json({ error: "Не удалось начать вход" }, { status: 500 });
  }
}
