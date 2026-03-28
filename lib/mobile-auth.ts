import { NextRequest } from "next/server";
import { sign, verify } from "jsonwebtoken";

const MOBILE_TOKEN_TTL_SECONDS = 60 * 60 * 24 * 7; // 7 days

function getJwtSecret() {
  const secret = process.env.NEXTAUTH_SECRET;
  if (!secret) {
    throw new Error("NEXTAUTH_SECRET is required for mobile auth");
  }
  return secret;
}

export function issueMobileAccessToken(payload: {
  userId: string;
  role?: string | null;
  email?: string | null;
}) {
  return sign(
    {
      sub: payload.userId,
      role: payload.role || undefined,
      email: payload.email || undefined,
      aud: "mobile-app",
    },
    getJwtSecret(),
    { expiresIn: MOBILE_TOKEN_TTL_SECONDS },
  );
}

export function getBearerToken(request: NextRequest): string | null {
  const authHeader = request.headers.get("authorization");
  if (!authHeader) return null;
  if (!authHeader.toLowerCase().startsWith("bearer ")) return null;
  return authHeader.slice(7).trim();
}

export function verifyMobileAccessToken(token: string): {
  userId: string;
  role?: string;
  email?: string;
} {
  const decoded = verify(token, getJwtSecret()) as {
    sub?: string;
    role?: string;
    email?: string;
    aud?: string;
  };

  if (!decoded?.sub) {
    throw new Error("Invalid token payload");
  }

  return {
    userId: decoded.sub,
    role: decoded.role,
    email: decoded.email,
  };
}
