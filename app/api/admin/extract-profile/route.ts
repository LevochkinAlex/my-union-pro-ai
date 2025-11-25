import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { extractProfileDataFromMessages } from "@/lib/profile-extraction";

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id || session.user.role !== "SUPER_ADMIN") {
      return NextResponse.json(
        { error: "Доступ запрещён" },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { sessionId } = body;

    if (!sessionId) {
      return NextResponse.json(
        { error: "Не указан ID сессии" },
        { status: 400 }
      );
    }

    // Получаем сообщения сессии
    const messages = await prisma.chatMessage.findMany({
      where: { sessionId },
      orderBy: { createdAt: "asc" },
      select: {
        role: true,
        content: true,
      },
    });

    if (messages.length === 0) {
      return NextResponse.json(
        { error: "Сессия пуста" },
        { status: 404 }
      );
    }

    console.log(`[admin/extract-profile] Extracting profile from ${messages.length} messages`);

    // Извлекаем данные
    const profileData = await extractProfileDataFromMessages(messages);

    console.log(`[admin/extract-profile] Extracted ${Object.keys(profileData).length} fields`);

    // Форматируем дату для отображения
    const formatted = {
      ...profileData,
      dateOfBirth: profileData.dateOfBirth
        ? new Date(profileData.dateOfBirth).toLocaleDateString("ru-RU")
        : undefined,
    };

    return NextResponse.json({
      profileData: formatted,
      messagesCount: messages.length,
    });
  } catch (error) {
    console.error("Error extracting profile:", error);
    return NextResponse.json(
      { error: "Ошибка извлечения данных" },
      { status: 500 }
    );
  }
}

