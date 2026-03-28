import crypto from "crypto";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

const BOT_USERNAME = process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME || "myunionpro_bot";

/**
 * POST /api/mobile/auth/bot-login/start
 * Создаёт одноразовую сессию и URL deep link в бота: https://t.me/BOT?start=app_<key>
 */
export async function POST() {
  try {
    await prisma.botAppLoginSession.deleteMany({
      where: { expiresAt: { lt: new Date() } },
    });

    const sessionKey = crypto.randomBytes(16).toString("hex");
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000);

    await prisma.botAppLoginSession.create({
      data: { sessionKey, expiresAt },
    });

    const botUrl = `https://t.me/${BOT_USERNAME}?start=app_${sessionKey}`;

    return NextResponse.json({ botUrl });
  } catch (error) {
    console.error("[mobile/auth/bot-login/start]", error);
    return NextResponse.json({ error: "Не удалось начать вход" }, { status: 500 });
  }
}
