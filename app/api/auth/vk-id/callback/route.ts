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
import { mergeUsers } from "@/lib/account-merge";

const PKCE_COOKIE = "vkid_pkce";

function getBaseUrl(request: NextRequest): string {
  const host = request.headers.get("host") || "localhost:3000";
  const isLocalhost = host.includes("localhost") || host.includes("127.0.0.1");
  // В проде используем явный URL из env, чтобы редирект с VK/встроенного браузера всегда вёл на один и тот же домен
  if (!isLocalhost && process.env.NEXT_PUBLIC_APP_URL) return process.env.NEXT_PUBLIC_APP_URL.replace(/\/$/, "");
  if (!isLocalhost && process.env.NEXTAUTH_URL) return process.env.NEXTAUTH_URL.replace(/\/$/, "");
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

  // Собираем кандидатов для объединения (включая уже найденного по vkId).
  const candidateIds = new Set<string>();
  let byEmail: { id: string; telegramChatId: string | null }[] = [];
  let byPhone: { id: string; telegramChatId: string | null }[] = [];
  let byPhoneFallback: { id: string; telegramChatId: string | null }[] = [];

  if (user) {
    candidateIds.add(user.id);
  }

  if (email) {
    byEmail = await prisma.user.findMany({
      where: { email: { equals: email, mode: "insensitive" } },
      select: { id: true, telegramChatId: true },
    });
    byEmail.forEach((u) => candidateIds.add(u.id));
  }
  if (phone) {
    byPhone = await prisma.user.findMany({
      where: { OR: [{ phone }, { authPhone: phone }] },
      select: { id: true, telegramChatId: true },
    });
    byPhone.forEach((u) => candidateIds.add(u.id));
  }
  if (candidateIds.size === 0 && phone) {
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
    byPhoneFallback = matches.map((u) => ({ id: u.id, telegramChatId: u.telegramChatId }));
    matches.forEach((u) => candidateIds.add(u.id));
  }

  // Приоритет primary-аккаунта: с telegramChatId (чтобы не ломать вход через Telegram), иначе первый найденный.
  const allCandidates = [
    ...(user ? [{ id: user.id, telegramChatId: user.telegramChatId ?? null }] : []),
    ...byEmail,
    ...byPhone,
    ...byPhoneFallback,
  ];
  const uniqueById = Array.from(new Map(allCandidates.map((u) => [u.id, u])).values());
  const preferred = uniqueById.find((u) => u.telegramChatId != null) ?? uniqueById[0];

  if (preferred) {
    const primaryId = preferred.id;

    if (candidateIds.size > 1) {
      for (const id of candidateIds) {
        if (id === primaryId) continue;
        const { ok, error } = await mergeUsers(prisma, primaryId, id);
        if (!ok) console.warn("[VK ID] Не удалось слить аккаунт:", id, error);
      }
    }

    user = await prisma.user.findUnique({ where: { id: primaryId } }) ?? user;
  }

  // VK ID может отдавать ФИО латиницей — переводим в кириллицу для профиля
  const firstName =
    userInfo?.first_name != null ? translitLatinToCyrillic(userInfo.first_name) : null;
  const lastName =
    userInfo?.last_name != null ? translitLatinToCyrillic(userInfo.last_name) : null;

  // Парсим дату рождения (формат VK: "DD.MM.YYYY" или "D.M.YYYY")
  let dateOfBirth: Date | null = null;
  if (userInfo?.birthday) {
    const parts = String(userInfo.birthday).trim().split(".").map((p) => parseInt(p, 10));
    if (parts.length >= 3 && parts[0] && parts[1] && parts[2]) {
      const [d, m, y] = parts;
      if (y >= 1900 && y <= 2100 && m >= 1 && m <= 12 && d >= 1 && d <= 31) {
        dateOfBirth = new Date(y, m - 1, d);
        if (isNaN(dateOfBirth.getTime())) dateOfBirth = null;
      }
    }
  }

  if (user) {
    // Существующий пользователь: только дополняем пустые поля
    const hasFirstName = user.firstName != null && String(user.firstName).trim() !== "";
    const hasLastName = user.lastName != null && String(user.lastName).trim() !== "";
    const hasAvatar = user.avatarUrl != null && String(user.avatarUrl).trim() !== "";
    const hasDateOfBirth = user.dateOfBirth != null;

    await prisma.user.update({
      where: { id: user.id },
      data: {
        vkId: vkUserId,
        ...(hasFirstName ? {} : { firstName: firstName ?? user.firstName }),
        ...(hasLastName ? {} : { lastName: lastName ?? user.lastName }),
        ...(hasAvatar ? {} : { avatarUrl: userInfo?.avatar ?? user.avatarUrl }),
        ...(hasDateOfBirth ? {} : dateOfBirth && { dateOfBirth }),
        ...(email && !user.email && { email }),
        ...(phone && !user.phone && { phone }),
        ...(phone && !user.authPhone && { authPhone: phone }),
      },
    });
  } else {
    user = await prisma.user.create({
      data: {
        vkId: vkUserId,
        firstName: firstName ?? null,
        lastName: lastName ?? null,
        avatarUrl: userInfo?.avatar ?? null,
        ...(dateOfBirth && { dateOfBirth }),
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
