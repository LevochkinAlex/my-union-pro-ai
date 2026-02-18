/**
 * POST /api/auth/max/verify
 * Верификация initData из MAX мини-приложения и выдача токена для входа.
 * Документация: https://dev.max.ru/docs/webapps/validation
 */

import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { prisma } from "@/lib/prisma";
import { validateAndParseInitData } from "@/lib/max-webapp-auth";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const initData = body?.initData;

    if (!initData || typeof initData !== "string") {
      return NextResponse.json(
        { error: "initData is required" },
        { status: 400 }
      );
    }

    const parsed = validateAndParseInitData(initData);
    if (!parsed?.user) {
      return NextResponse.json(
        { error: "Invalid or expired initData" },
        { status: 400 }
      );
    }

    const { user: maxUser } = parsed;
    const maxUserIdStr = String(maxUser.id);

    // Ищем пользователя по maxUserId
    let user = await prisma.user.findUnique({
      where: { maxUserId: maxUserIdStr },
    });

    if (!user) {
      // Создаём нового пользователя по MAX
      try {
        user = await prisma.user.create({
          data: {
            maxUserId: maxUserIdStr,
            maxChatId: maxUserIdStr, // для личного чата chat_id обычно совпадает с user_id
            maxUsername: maxUser.username ?? null,
            firstName: maxUser.first_name ?? null,
            lastName: maxUser.last_name ?? null,
            role: "PENDING_MEMBER",
            membershipStatus: "PROFILE_INCOMPLETE",
          },
        });
        console.log("[MAX Auth] Новый пользователь создан:", user.id);
      } catch (e: unknown) {
        const prismaError = e as { code?: string };
        if (prismaError?.code === "P2002") {
          user = await prisma.user.findUnique({
            where: { maxUserId: maxUserIdStr },
          });
        }
        if (!user) throw e;
      }
    } else {
      // Обновляем профиль из MAX при повторном входе
      await prisma.user.update({
        where: { id: user.id },
        data: {
          maxUsername: maxUser.username ?? user.maxUsername,
          firstName: maxUser.first_name ?? user.firstName,
          lastName: maxUser.last_name ?? user.lastName,
        },
      });
    }

    const loginToken = crypto.randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 минут

    await prisma.loginToken.create({
      data: {
        token: loginToken,
        userId: user.id,
        expiresAt,
      },
    });

    const host = request.headers.get("host") || "localhost:3000";
    const isLocalhost = host.includes("localhost") || host.includes("127.0.0.1");
    let baseUrl: string;
    if (process.env.NEXTAUTH_URL) {
      baseUrl = process.env.NEXTAUTH_URL;
    } else if (process.env.NEXT_PUBLIC_APP_URL) {
      baseUrl = process.env.NEXT_PUBLIC_APP_URL;
    } else if (isLocalhost) {
      baseUrl = `http://${host}`;
    } else {
      const proto =
        request.headers.get("x-forwarded-proto") ||
        (request.url.startsWith("https") ? "https" : "http");
      baseUrl = `${proto}://${host}`;
    }

    const redirectUrl = `${baseUrl}/auth/max/success?token=${loginToken}`;

    return NextResponse.json({
      success: true,
      loginToken,
      redirectUrl,
    });
  } catch (error) {
    console.error("[MAX Auth] Ошибка:", error);
    return NextResponse.json(
      { error: "Verification failed" },
      { status: 500 }
    );
  }
}
