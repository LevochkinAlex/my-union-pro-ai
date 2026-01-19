import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { sendUserNotification } from "@/lib/notifications";
import { 
  getOrCreatePrivateChat, 
  checkChatAccess 
} from "@/lib/chat-service";

// POST - пересылка сообщения
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }

    const { messageId, targetUserId } = await request.json();

    if (!messageId || !targetUserId) {
      return NextResponse.json(
        { error: "Необходимо указать messageId и targetUserId" },
        { status: 400 }
      );
    }

    const userId = session.user.id;

    if (userId === targetUserId) {
      return NextResponse.json(
        { error: "Нельзя переслать сообщение самому себе" },
        { status: 400 }
      );
    }

    // TODO: Пересылка сообщений требует полной переделки на Matrix API
    // Нужно получить сообщение из Matrix, создать новый тред или отправить в существующий чат
    return NextResponse.json(
      { error: "Пересылка сообщений временно недоступна (миграция на Matrix API)" },
      { status: 501 }
    );
  } catch (error: any) {
    console.error("[chat/forward] Error:", error);
    return NextResponse.json(
      { error: "Внутренняя ошибка сервера" },
      { status: 500 }
    );
  }
}
