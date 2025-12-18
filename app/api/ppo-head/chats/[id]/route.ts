import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getPPOHead } from "@/lib/ppo-head-utils";

/**
 * DELETE /api/ppo-head/chats/[id]
 * Удалить групповой чат
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } | Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }

    // Проверяем, что пользователь является Председателем
    const chairman = await getPPOHead(session.user.id);

    if (!chairman) {
      return NextResponse.json(
        { error: "Доступ запрещен или организация не назначена" },
        { status: 403 }
      );
    }

    const resolvedParams = await Promise.resolve(params);
    const chatId = resolvedParams.id;

    // Проверяем, что чат существует и является групповым
    const chat = await prisma.chat.findUnique({
      where: { id: chatId },
      select: {
        type: true,
        createdById: true,
      },
    });

    if (!chat) {
      return NextResponse.json(
        { error: "Чат не найден" },
        { status: 404 }
      );
    }

    if (chat.type !== "GROUP") {
      return NextResponse.json(
        { error: "Можно удалять только групповые чаты" },
        { status: 400 }
      );
    }

    // Проверяем, что Председатель является создателем группы
    if (chat.createdById !== chairman.id) {
      return NextResponse.json(
        { error: "Только создатель группы может её удалить" },
        { status: 403 }
      );
    }

    // Удаляем чат (каскадное удаление участников и сообщений)
    await prisma.chat.delete({
      where: { id: chatId },
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("[ppo-head/chats] DELETE error:", error);
    return NextResponse.json(
      {
        error: "Ошибка при удалении группы",
        details: process.env.NODE_ENV === "development" ? error.message : undefined,
      },
      { status: 500 }
    );
  }
}

