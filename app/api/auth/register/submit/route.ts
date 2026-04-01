import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { prisma } from "@/lib/prisma";
import { capitalizeName } from "@/lib/utils/nameFormatting";
import { normalizePhone, isValidPhone } from "@/lib/utils/phone";
import { sendRegistrationConfirmationEmail } from "@/lib/email";

function normalizeTelegramUsername(raw: string | undefined | null): string | null {
  if (!raw?.trim()) return null;
  const s = raw.trim().replace(/^@+/, "").replace(/\s/g, "");
  if (!/^[a-zA-Z][a-zA-Z0-9_]{3,31}$/.test(s)) return null;
  return s;
}

/**
 * POST /api/auth/register/submit
 * Полноценная регистрация: сохраняем заявку и шлём ссылку подтверждения на email.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const emailRaw = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    const firstNameRaw = typeof body.firstName === "string" ? body.firstName.trim() : "";
    const lastNameRaw = typeof body.lastName === "string" ? body.lastName.trim() : "";
    const middleNameRaw = typeof body.middleName === "string" ? body.middleName.trim() : "";
    const phoneRaw = typeof body.phone === "string" ? body.phone.trim() : "";
    const telegramRaw = body.telegramUsername;

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailRaw)) {
      return NextResponse.json({ success: false, error: "Укажите корректный email" }, { status: 400 });
    }
    if (!firstNameRaw || !lastNameRaw) {
      return NextResponse.json({ success: false, error: "Укажите фамилию и имя" }, { status: 400 });
    }
    if (!phoneRaw || !isValidPhone(phoneRaw)) {
      return NextResponse.json(
        { success: false, error: "Укажите телефон в полном формате (например +7 …)" },
        { status: 400 },
      );
    }

    const phoneNorm = normalizePhone(phoneRaw);
    if (!phoneNorm) {
      return NextResponse.json({ success: false, error: "Не удалось распознать номер телефона" }, { status: 400 });
    }

    let tg: string | null = null;
    if (telegramRaw != null && String(telegramRaw).trim()) {
      tg = normalizeTelegramUsername(String(telegramRaw));
      if (!tg) {
        return NextResponse.json(
          { success: false, error: "Некорректный логин Telegram (латиница, 4–32 символа, без @)" },
          { status: 400 },
        );
      }
    }

    const existingUser = await prisma.user.findFirst({
      where: {
        OR: [{ email: emailRaw }, { phone: phoneNorm }, { authPhone: phoneNorm }],
      },
      select: { id: true, email: true, phone: true },
    });
    if (existingUser) {
      if (existingUser.email === emailRaw) {
        return NextResponse.json(
          { success: false, error: "Пользователь с таким email уже зарегистрирован. Войдите через «Вход»." },
          { status: 409 },
        );
      }
      return NextResponse.json(
        { success: false, error: "Пользователь с таким номером телефона уже зарегистрирован." },
        { status: 409 },
      );
    }

    const pendingOtherEmail = await prisma.pendingRegistration.findFirst({
      where: {
        phone: phoneNorm,
        email: { not: emailRaw },
        expiresAt: { gt: new Date() },
      },
    });
    if (pendingOtherEmail) {
      return NextResponse.json(
        { success: false, error: "Этот номер уже указан в другой заявке на регистрацию." },
        { status: 409 },
      );
    }

    await prisma.pendingRegistration.deleteMany({
      where: { OR: [{ email: emailRaw }, { phone: phoneNorm }] },
    });

    const token = crypto.randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

    await prisma.pendingRegistration.create({
      data: {
        email: emailRaw,
        firstName: capitalizeName(firstNameRaw),
        lastName: capitalizeName(lastNameRaw),
        middleName: middleNameRaw ? capitalizeName(middleNameRaw) : null,
        phone: phoneNorm,
        telegramUsername: tg,
        token,
        expiresAt,
      },
    });

    const envUrl = process.env.NEXTAUTH_URL || process.env.NEXT_PUBLIC_APP_URL;
    const isEnvProduction =
      envUrl && !envUrl.includes("localhost") && !envUrl.includes("127.0.0.1");
    let baseUrl: string;
    if (isEnvProduction) {
      baseUrl = envUrl!.replace(/^http:/, "https:");
    } else {
      try {
        baseUrl = new URL(request.url).origin;
      } catch {
        baseUrl = "http://localhost:3000";
      }
    }
    if (!baseUrl.includes("localhost") && !baseUrl.includes("127.0.0.1")) {
      baseUrl = baseUrl.replace(/^http:/, "https:");
    }

    const confirmLink = `${baseUrl}/api/auth/register/confirm?token=${encodeURIComponent(token)}`;

    const emailResult = await sendRegistrationConfirmationEmail(emailRaw, confirmLink, {
      firstName: capitalizeName(firstNameRaw),
    });

    if (!emailResult.success && !(emailResult as { devMode?: boolean }).devMode) {
      await prisma.pendingRegistration.deleteMany({ where: { token } });
      return NextResponse.json(
        { success: false, error: emailResult.error || "Не удалось отправить письмо" },
        { status: 500 },
      );
    }

    return NextResponse.json({
      success: true,
      message: "Проверьте почту — перейдите по ссылке для завершения регистрации.",
      devMode: (emailResult as { devMode?: boolean }).devMode,
      confirmLink: (emailResult as { devMode?: boolean }).devMode ? confirmLink : undefined,
    });
  } catch (e) {
    console.error("[register/submit]", e);
    return NextResponse.json(
      { success: false, error: "Ошибка сервера" },
      { status: 500 },
    );
  }
}
