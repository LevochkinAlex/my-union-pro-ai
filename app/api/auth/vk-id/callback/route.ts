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

function normalizePhone(phone: string): string {
  let cleaned = phone.replace(/[\s\-\(\)]/g, "");
  if (cleaned.startsWith("8")) cleaned = "+7" + cleaned.slice(1);
  if (cleaned.startsWith("7") && !cleaned.startsWith("+")) cleaned = "+" + cleaned;
  return cleaned;
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
  const email = userInfo?.email ?? null;
  const phone = userInfo?.phone ? normalizePhone(userInfo.phone) : null;

  let user = await prisma.user.findUnique({ where: { vkId: vkUserId } });

  if (!user) {
    const searchConditions: { OR: Array<Record<string, string>> } = { OR: [] };
    if (email) searchConditions.OR.push({ email });
    if (phone) searchConditions.OR.push({ phone }, { authPhone: phone });
    if (searchConditions.OR.length > 0) {
      user = await prisma.user.findFirst({ where: searchConditions });
    }
  }

  if (user) {
    await prisma.user.update({
      where: { id: user.id },
      data: {
        vkId: vkUserId,
        firstName: userInfo?.first_name ?? user.firstName,
        lastName: userInfo?.last_name ?? user.lastName,
        avatarUrl: userInfo?.avatar ?? user.avatarUrl,
        ...(email && !user.email && { email }),
        ...(phone && !user.phone && { phone }),
      },
    });
  } else {
    user = await prisma.user.create({
      data: {
        vkId: vkUserId,
        firstName: userInfo?.first_name ?? null,
        lastName: userInfo?.last_name ?? null,
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
