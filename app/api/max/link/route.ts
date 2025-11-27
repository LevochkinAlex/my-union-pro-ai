import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

/**
 * POST /api/max/link
 * Генерирует deep link для привязки MAX к аккаунту
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    const { chatId } = await request.json();

    if (!chatId || typeof chatId !== "string") {
      return NextResponse.json(
        { error: "chatId is required" },
        { status: 400 }
      );
    }

    // Обновляем maxChatId пользователя
    await prisma.user.update({
      where: { id: session.user.id },
      data: {
        maxChatId: chatId,
      },
    });

    console.log("[MAX Link] ✅ MAX Chat ID привязан к пользователю:", session.user.id);

    return NextResponse.json({
      success: true,
      message: "MAX успешно привязан",
    });
  } catch (error) {
    console.error("[MAX Link] Ошибка при привязке MAX:", error);
    return NextResponse.json(
      {
        error: "Link error",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}

/**
 * GET /api/max/link
 * Проверяет, привязан ли MAX к аккаунту
 */
export async function GET() {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: {
        maxChatId: true,
        maxUsername: true,
      },
    });

    return NextResponse.json({
      linked: !!user?.maxChatId,
      maxChatId: user?.maxChatId || null,
      maxUsername: user?.maxUsername || null,
    });
  } catch (error) {
    console.error("[MAX Link] Ошибка при проверке привязки:", error);
    return NextResponse.json(
      {
        error: "Check error",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}

