/**
 * GET /api/auth/vk-id/callback
 * Callback от VK ID: обмен code на токены, получение профиля, поиск/создание User, LoginToken, редирект на success
 * В настройках приложения VK ID (id.vk.com) Trusted redirect URL должен быть: https://myunion.pro/api/auth/vk-id/callback
 */
import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { prisma } from "@/lib/prisma";
import {
  isVkIdConfigured,
  exchangeCodeForTokens,
  getVkIdUserInfo,
} from "@/lib/vk-id-auth";
import { translitLatinToCyrillic } from "@/lib/translit-latin-to-cyrillic";

const PKCE_COOKIE = "vkid_pkce";

function getBaseUrl(request: NextRequest): string {
  const host = request.headers.get("host") || "localhost:3000";
  const isLocalhost = host.includes("localhost") || host.includes("127.0.0.1");
  if (process.env.NEXTAUTH_URL) return process.env.NEXTAUTH_URL;
  if (process.env.NEXT_PUBLIC_APP_URL) return process.env.NEXT_PUBLIC_APP_URL;
  if (isLocalhost) return `http://${host}`;
  const proto = request.headers.get("x-forwarded-proto") || "https";
  return `${proto}://${host}`;
}

function normalizePhone(phone: string | null | undefined): string | null {
  if (phone == null || typeof phone !== "string") return null;
  let cleaned = phone.replace(/\D/g, "");
  if (cleaned.length < 10) return null;
  if (cleaned.startsWith("8")) cleaned = "7" + cleaned.slice(1);
  if (cleaned.startsWith("7") && cleaned.length > 11) cleaned = cleaned.slice(0, 11);
  if (!cleaned.startsWith("7")) cleaned = "7" + cleaned;
  return "+" + cleaned;
}

/** Нормализация email для поиска и хранения (нижний регистр, trim). */
function normalizeEmail(email: string | null | undefined): string | null {
  if (email == null || typeof email !== "string") return null;
  const trimmed = email.trim().toLowerCase();
  return trimmed === "" ? null : trimmed;
}

export async function GET(request: NextRequest) {
  const baseUrl = getBaseUrl(request);
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const deviceId = searchParams.get("device_id") ?? "";
  const error = searchParams.get("error");

  if (error) {
    console.error("[VK ID] Callback error:", error, searchParams.get("error_description"));
    return NextResponse.redirect(new URL(`/login?error=vk_id_${error}`, baseUrl));
  }

  if (!isVkIdConfigured() || !code || !state) {
    return NextResponse.redirect(new URL("/login?error=vk_id_invalid_callback", baseUrl));
  }

  const cookieValue = request.cookies.get(PKCE_COOKIE)?.value;
  if (!cookieValue) {
    return NextResponse.redirect(new URL("/login?error=vk_id_session_expired", baseUrl));
  }

  let codeVerifier: string;
  let savedState: string;
  try {
    const decoded = JSON.parse(Buffer.from(cookieValue, "base64url").toString("utf8"));
    codeVerifier = decoded.codeVerifier;
    savedState = decoded.state;
  } catch {
    return NextResponse.redirect(new URL("/login?error=vk_id_invalid_cookie", baseUrl));
  }

  if (savedState !== state) {
    return NextResponse.redirect(new URL("/login?error=vk_id_state_mismatch", baseUrl));
  }

  const redirectUri = `${baseUrl}/api/auth/vk-id/callback`;

  let tokens: Awaited<ReturnType<typeof exchangeCodeForTokens>>;
  try {
    tokens = await exchangeCodeForTokens({
      code,
      redirectUri,
      codeVerifier,
      state,
      deviceId,
    });
  } catch (e) {
    console.error("[VK ID] Token exchange failed:", e);
    return NextResponse.redirect(new URL("/login?error=vk_id_token_failed", baseUrl));
  }

  const vkUserId = String(tokens.user_id);
  const userInfo = await getVkIdUserInfo(tokens.access_token);
  const email = normalizeEmail(userInfo?.email);
  const phone = userInfo?.phone ? normalizePhone(userInfo.phone) : null;

  let user = await prisma.user.findUnique({ where: { vkId: vkUserId } });

  if (!user) {
    // Слияние с существующим аккаунтом: ищем по email и по телефону. При нескольких совпадениях
    // предпочитаем пользователя с telegramChatId (аккаунт из Telegram), чтобы не «переключить»
    // привязку на дубликат и не сломать вход через Telegram.
    if (email) {
      const byEmail = await prisma.user.findMany({
        where: { email: { equals: email, mode: "insensitive" } },
        select: { id: true, telegramChatId: true },
      });
      const preferred = byEmail.find((u) => u.telegramChatId != null) ?? byEmail[0];
      if (preferred) user = await prisma.user.findUnique({ where: { id: preferred.id } });
    }
    if (!user && phone) {
      const byPhone = await prisma.user.findMany({
        where: { OR: [{ phone }, { authPhone: phone }] },
        select: { id: true, telegramChatId: true },
      });
      const preferred = byPhone.find((u) => u.telegramChatId != null) ?? byPhone[0];
      if (preferred) user = await prisma.user.findUnique({ where: { id: preferred.id } });
    }
    // Fallback: телефон в БД мог быть сохранён в другом формате (+7 (963) 977-12-86 и т.д.)
    if (!user && phone) {
      const phoneDigits = phone.replace(/\D/g, "");
      const allWithPhone = await prisma.user.findMany({
        where: { OR: [{ phone: { not: null } }, { authPhone: { not: null } }] },
        select: { id: true, phone: true, authPhone: true, telegramChatId: true },
      });
      const matches = allWithPhone.filter(
        (u) =>
          (u.phone && normalizePhone(u.phone)?.replace(/\D/g, "") === phoneDigits) ||
          (u.authPhone && normalizePhone(u.authPhone)?.replace(/\D/g, "") === phoneDigits),
      );
      const preferred = matches.find((u) => u.telegramChatId != null) ?? matches[0];
      if (preferred) user = await prisma.user.findUnique({ where: { id: preferred.id } });
    }
  }

  // VK ID может отдавать ФИО латиницей — переводим в кириллицу для профиля
  const firstName =
    userInfo?.first_name != null ? translitLatinToCyrillic(userInfo.first_name) : null;
  const lastName =
    userInfo?.last_name != null ? translitLatinToCyrillic(userInfo.last_name) : null;

  if (user) {
    // Существующий пользователь (найден по vkId, email или телефону): только дополняем пустые поля, не перезаписываем уже сохранённые (ФИО, аватар и т.д.)
    const hasFirstName = user.firstName != null && String(user.firstName).trim() !== "";
    const hasLastName = user.lastName != null && String(user.lastName).trim() !== "";
    const hasAvatar = user.avatarUrl != null && String(user.avatarUrl).trim() !== "";

    await prisma.user.update({
      where: { id: user.id },
      data: {
        vkId: vkUserId,
        ...(hasFirstName ? {} : { firstName: firstName ?? user.firstName }),
        ...(hasLastName ? {} : { lastName: lastName ?? user.lastName }),
        ...(hasAvatar ? {} : { avatarUrl: userInfo?.avatar ?? user.avatarUrl }),
        ...(email && !user.email && { email }),
        ...(phone && !user.phone && { phone }),
      },
    });
  } else {
    user = await prisma.user.create({
      data: {
        vkId: vkUserId,
        firstName: firstName ?? null,
        lastName: lastName ?? null,
        avatarUrl: userInfo?.avatar ?? null,
        email,
        phone,
        authPhone: phone,
        role: "PENDING_MEMBER",
        membershipStatus: "PROFILE_INCOMPLETE",
      },
    });
  }

  const loginToken = crypto.randomBytes(32).toString("hex");
  await prisma.loginToken.create({
    data: {
      token: loginToken,
      userId: user.id,
      expiresAt: new Date(Date.now() + 10 * 60 * 1000),
    },
  });

  const res = NextResponse.redirect(new URL(`/auth/vk-id/success?token=${loginToken}`, baseUrl));
  res.cookies.delete(PKCE_COOKIE);
  return res;
}
