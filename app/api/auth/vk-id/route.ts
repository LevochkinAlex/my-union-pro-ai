/**
 * GET /api/auth/vk-id
 * Старт входа через VK ID: генерируем PKCE, сохраняем code_verifier в cookie, редирект на id.vk.ru
 */
import { NextRequest, NextResponse } from "next/server";
import {
  isVkIdConfigured,
  generatePkce,
  generateState,
  getVkIdAuthorizeUrl,
} from "@/lib/vk-id-auth";

const PKCE_COOKIE = "vkid_pkce";
const PKCE_MAX_AGE = 600; // 10 min

function getBaseUrl(request: NextRequest): string {
  const host = request.headers.get("host") || "localhost:3000";
  const isLocalhost = host.includes("localhost") || host.includes("127.0.0.1");
  if (process.env.NEXTAUTH_URL) return process.env.NEXTAUTH_URL;
  if (process.env.NEXT_PUBLIC_APP_URL) return process.env.NEXT_PUBLIC_APP_URL;
  if (isLocalhost) return `http://${host}`;
  const proto = request.headers.get("x-forwarded-proto") || "https";
  return `${proto}://${host}`;
}

export async function GET(request: NextRequest) {
  if (!isVkIdConfigured()) {
    return NextResponse.redirect(new URL("/login?error=vk_id_not_configured", getBaseUrl(request)));
  }

  const baseUrl = getBaseUrl(request);
  const redirectUri = `${baseUrl}/api/auth/vk-id/callback`;

  const { codeVerifier, codeChallenge } = generatePkce();
  const state = generateState();
  const authUrl = getVkIdAuthorizeUrl({ redirectUri, codeChallenge, state });

  const cookieValue = Buffer.from(
    JSON.stringify({ codeVerifier, state })
  ).toString("base64url");

  const res = NextResponse.redirect(authUrl);
  res.cookies.set(PKCE_COOKIE, cookieValue, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: PKCE_MAX_AGE,
    path: "/",
  });
  return res;
}
