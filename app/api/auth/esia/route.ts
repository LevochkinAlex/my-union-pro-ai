/**
 * GET /api/auth/esia
 * Старт входа через Госуслуги (ЕСИА): генерируем state + timestamp, подписываем, редирект на ЕСИА.
 */
import { NextRequest, NextResponse } from "next/server";
import {
  isEsiaConfigured,
  generateState,
  getEsiaTimestamp,
  getEsiaAuthorizeUrl,
} from "@/lib/esia-auth";

const ESIA_COOKIE = "esia_auth";
const ESIA_MAX_AGE = 600; // 10 min

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
  if (!isEsiaConfigured()) {
    return NextResponse.redirect(
      new URL("/login?error=esia_not_configured", getBaseUrl(request)),
    );
  }

  const baseUrl = getBaseUrl(request);
  const redirectUri = `${baseUrl}/api/auth/esia/callback`;

  const state = generateState();
  const timestamp = getEsiaTimestamp();

  let authUrl: string;
  try {
    authUrl = getEsiaAuthorizeUrl({ redirectUri, state, timestamp });
  } catch (err) {
    console.error("[ESIA] Failed to build authorize URL:", err);
    return NextResponse.redirect(
      new URL("/login?error=esia_sign_failed", getBaseUrl(request)),
    );
  }

  const cookieValue = Buffer.from(
    JSON.stringify({ state, timestamp }),
  ).toString("base64url");

  const res = NextResponse.redirect(authUrl);
  res.cookies.set(ESIA_COOKIE, cookieValue, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: ESIA_MAX_AGE,
    path: "/",
  });
  return res;
}
