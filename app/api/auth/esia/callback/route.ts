/**
 * GET /api/auth/esia/callback
 * Callback от ЕСИА: обмен code на access_token, получение профиля, поиск/создание User, LoginToken, редирект.
 * В настройках системы на partners.gosuslugi.ru redirect_uri: https://myunion.pro/api/auth/esia/callback
 */
import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { prisma } from "@/lib/prisma";
import {
  exchangeCodeForTokens,
  extractOidFromToken,
  getEsiaUserInfo,
  getEsiaContacts,
} from "@/lib/esia-auth";

const ESIA_COOKIE = "esia_auth";

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
  if (!cleaned.startsWith("+")) cleaned = "+" + cleaned;
  return cleaned;
}

export async function GET(request: NextRequest) {
  const baseUrl = getBaseUrl(request);
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const error = searchParams.get("error");

  if (error) {
    console.error("[ESIA] Callback error:", error, searchParams.get("error_description"));
    return NextResponse.redirect(new URL(`/login?error=esia_${error}`, baseUrl));
  }

  if (!code || !state) {
    return NextResponse.redirect(new URL("/login?error=esia_invalid_callback", baseUrl));
  }

  // Validate state from cookie
  const cookieValue = request.cookies.get(ESIA_COOKIE)?.value;
  if (!cookieValue) {
    return NextResponse.redirect(new URL("/login?error=esia_session_expired", baseUrl));
  }

  let savedState: string;
  try {
    const decoded = JSON.parse(Buffer.from(cookieValue, "base64url").toString("utf8"));
    savedState = decoded.state;
  } catch {
    return NextResponse.redirect(new URL("/login?error=esia_invalid_cookie", baseUrl));
  }

  if (savedState !== state) {
    return NextResponse.redirect(new URL("/login?error=esia_state_mismatch", baseUrl));
  }

  const redirectUri = `${baseUrl}/api/auth/esia/callback`;

  // Exchange code for tokens
  let tokens: Awaited<ReturnType<typeof exchangeCodeForTokens>>;
  try {
    tokens = await exchangeCodeForTokens({ code, redirectUri, state });
  } catch (e) {
    console.error("[ESIA] Token exchange failed:", e);
    return NextResponse.redirect(new URL("/login?error=esia_token_failed", baseUrl));
  }

  // Extract oid from access_token JWT
  let oid: string;
  try {
    oid = extractOidFromToken(tokens.access_token);
  } catch (e) {
    console.error("[ESIA] Failed to extract oid:", e);
    return NextResponse.redirect(new URL("/login?error=esia_no_oid", baseUrl));
  }

  // Fetch user info and contacts
  const [userInfo, contacts] = await Promise.all([
    getEsiaUserInfo(tokens.access_token, oid),
    getEsiaContacts(tokens.access_token, oid),
  ]);

  const esiaId = oid;
  const email = contacts.email ?? null;
  const phone = contacts.phone ? normalizePhone(contacts.phone) : null;

  // Find or create user
  let user = await prisma.user.findUnique({ where: { esiaId } });

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
        esiaId,
        firstName: userInfo?.firstName ?? user.firstName,
        lastName: userInfo?.lastName ?? user.lastName,
        middleName: userInfo?.middleName ?? user.middleName,
        ...(email && !user.email && { email }),
        ...(phone && !user.phone && { phone }),
      },
    });
  } else {
    user = await prisma.user.create({
      data: {
        esiaId,
        firstName: userInfo?.firstName ?? null,
        lastName: userInfo?.lastName ?? null,
        middleName: userInfo?.middleName ?? null,
        email,
        phone,
        authPhone: phone,
        role: "PENDING_MEMBER",
        membershipStatus: "PROFILE_INCOMPLETE",
      },
    });
  }

  // Create login token
  const loginToken = crypto.randomBytes(32).toString("hex");
  await prisma.loginToken.create({
    data: {
      token: loginToken,
      userId: user.id,
      expiresAt: new Date(Date.now() + 10 * 60 * 1000),
    },
  });

  const res = NextResponse.redirect(
    new URL(`/auth/esia/success?token=${loginToken}`, baseUrl),
  );
  res.cookies.delete(ESIA_COOKIE);
  return res;
}
