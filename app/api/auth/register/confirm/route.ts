import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { prisma } from "@/lib/prisma";
import { syncBestBenefitsIfEligible } from "@/lib/best-benefits-sync-eligible";

function baseUrlFromRequest(request: NextRequest): string {
  const host = request.headers.get("host") || "";
  const isLocalHost = host.includes("localhost") || host.includes("127.0.0.1");
  if (!isLocalHost && host) {
    return `https://${host}`;
  }
  const envUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.NEXTAUTH_URL;
  if (envUrl && !envUrl.includes("localhost")) {
    return envUrl.replace(/^http:/, "https:");
  }
  return isLocalHost ? `http://${host}` : "https://myunion.pro";
}

/**
 * GET /api/auth/register/confirm?token=...
 * Создаёт пользователя, открывает сессию через одноразовый LoginToken, синхронизирует BestBenefits.
 */
export async function GET(request: NextRequest) {
  const baseUrl = baseUrlFromRequest(request);
  const { searchParams } = new URL(request.url);
  const token = searchParams.get("token");

  if (!token) {
    return NextResponse.redirect(new URL("/login?error=missing_token", baseUrl));
  }

  try {
    const pending = await prisma.pendingRegistration.findUnique({
      where: { token },
    });

    if (!pending) {
      return NextResponse.redirect(new URL("/login?error=invalid_token", baseUrl));
    }
    if (pending.expiresAt < new Date()) {
      await prisma.pendingRegistration.delete({ where: { id: pending.id } }).catch(() => {});
      return NextResponse.redirect(new URL("/login?error=token_expired", baseUrl));
    }

    const clash = await prisma.user.findFirst({
      where: {
        OR: [
          { email: pending.email },
          { phone: pending.phone },
          { authPhone: pending.phone },
        ],
      },
      select: { id: true },
    });
    if (clash) {
      await prisma.pendingRegistration.delete({ where: { id: pending.id } }).catch(() => {});
      return NextResponse.redirect(new URL("/login?error=email_or_phone_taken", baseUrl));
    }

    const loginTokenStr = crypto.randomBytes(32).toString("hex");
    const loginExpires = new Date(Date.now() + 15 * 60 * 1000);

    const user = await prisma.$transaction(async (tx) => {
      const u = await tx.user.create({
        data: {
          email: pending.email,
          firstName: pending.firstName,
          lastName: pending.lastName,
          middleName: pending.middleName,
          phone: pending.phone,
          authPhone: pending.phone,
          telegramUsername: pending.telegramUsername,
          role: "PENDING_MEMBER",
          membershipStatus: "PROFILE_INCOMPLETE",
          emailVerified: new Date(),
        },
      });

      await tx.loginToken.create({
        data: {
          token: loginTokenStr,
          userId: u.id,
          expiresAt: loginExpires,
        },
      });

      await tx.pendingRegistration.delete({ where: { id: pending.id } });

      return u;
    });

    await syncBestBenefitsIfEligible(user.id, "registration-confirm");

    return NextResponse.redirect(
      new URL(`/auth/email/success?token=${encodeURIComponent(loginTokenStr)}`, baseUrl),
    );
  } catch (e) {
    console.error("[register/confirm]", e);
    return NextResponse.redirect(new URL("/login?error=server_error", baseUrl));
  }
}
