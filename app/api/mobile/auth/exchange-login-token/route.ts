import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { issueMobileAccessToken } from "@/lib/mobile-auth";

type Body = {
  token?: string;
};

/**
 * Обмен одноразового токена из письма (magic link) на JWT приложения.
 * Тот же токен, что использует NextAuth credentials «login-token».
 */
export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as Body;
    const token = (body.token || "").trim();

    if (!token) {
      return NextResponse.json({ error: "Токен обязателен" }, { status: 400 });
    }

    const tokenRecord = await prisma.loginToken.findUnique({
      where: { token },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            role: true,
            firstName: true,
            lastName: true,
            avatarUrl: true,
          },
        },
      },
    });

    if (!tokenRecord || tokenRecord.used || tokenRecord.expiresAt < new Date()) {
      return NextResponse.json(
        { error: "Ссылка недействительна, истекла или уже использована" },
        { status: 401 },
      );
    }

    await prisma.loginToken.update({
      where: { id: tokenRecord.id },
      data: { used: true, usedAt: new Date() },
    });

    const u = tokenRecord.user;
    const accessToken = issueMobileAccessToken({
      userId: u.id,
      role: u.role,
      email: u.email,
    });

    return NextResponse.json({
      accessToken,
      user: {
        id: u.id,
        email: u.email,
        role: u.role,
        firstName: u.firstName,
        lastName: u.lastName,
        avatarUrl: u.avatarUrl,
      },
    });
  } catch (error) {
    console.error("[mobile/auth/exchange-login-token]", error);
    return NextResponse.json({ error: "Ошибка сервера" }, { status: 500 });
  }
}
