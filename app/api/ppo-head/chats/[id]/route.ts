import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getPPOHead } from "@/lib/ppo-head-utils";

/**
 * GET /api/ppo-head/chats/[id]
 * Получить детали группового чата с участниками
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } | Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }

    const chairman = await getPPOHead(session.user.id);
    if (!chairman) {
      return NextResponse.json({ error: "Доступ запрещен" }, { status: 403 });
    }

    const resolvedParams = await Promise.resolve(params);
    const chatId = resolvedParams.id;

    const chat = await prisma.chat.findUnique({
      where: { id: chatId },
      include: {
        participants: {
          include: {
            user: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                middleName: true,
                avatarUrl: true,
                phone: true,
              },
            },
          },
        },
      },
    });

    if (!chat) {
      return NextResponse.json({ error: "Чат не найден" }, { status: 404 });
    }

    return NextResponse.json({ chat });
  } catch (error: any) {
    console.error("[ppo-head/chats] GET error:", error);
    return NextResponse.json({ error: "Ошибка загрузки" }, { status: 500 });
  }
}

/**
 * PUT /api/ppo-head/chats/[id]
 * Обновить групповой чат (название, описание, иконка)
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } | Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }

    const chairman = await getPPOHead(session.user.id);
    if (!chairman) {
      return NextResponse.json({ error: "Доступ запрещен" }, { status: 403 });
    }

    const resolvedParams = await Promise.resolve(params);
    const chatId = resolvedParams.id;

    const body = await request.json();
    const { name, description, iconUrl } = body;

    const chat = await prisma.chat.findUnique({
      where: { id: chatId },
      select: { 
        type: true, 
        createdById: true,
        participants: {
          where: { userId: chairman.id },
          select: { role: true }
        }
      },
    });

    console.log("[ppo-head/chats] PUT - chatId:", chatId, "chat:", chat, "chairmanId:", chairman.id);

    if (!chat) {
      return NextResponse.json({ error: "Чат не найден" }, { status: 404 });
    }

    if (chat.type !== "GROUP") {
      return NextResponse.json({ error: "Можно редактировать только группы" }, { status: 400 });
    }

    // Проверяем права:
    // 1. Создатель группы
    // 2. Старые группы без createdById
    // 3. Председатель - участник группы (admin или member)
    const isCreator = chat.createdById === chairman.id;
    const isLegacyGroup = !chat.createdById;
    const isParticipant = chat.participants.length > 0;
    const isAdmin = chat.participants.some(p => p.role === "admin");
    
    const canEdit = isCreator || isLegacyGroup || isParticipant;
    console.log("[ppo-head/chats] PUT - canEdit:", canEdit, "isCreator:", isCreator, "isLegacyGroup:", isLegacyGroup, "isParticipant:", isParticipant, "isAdmin:", isAdmin);
    
    if (!canEdit) {
      return NextResponse.json({ error: "Нет прав на редактирование этой группы" }, { status: 403 });
    }

    const updatedChat = await prisma.chat.update({
      where: { id: chatId },
      data: {
        name: name?.trim() || undefined,
        description: description?.trim() || null,
        iconUrl: iconUrl !== undefined ? iconUrl : undefined,
      },
    });

    return NextResponse.json({ success: true, chat: updatedChat });
  } catch (error: any) {
    console.error("[ppo-head/chats] PUT error:", error);
    return NextResponse.json({ error: "Ошибка обновления" }, { status: 500 });
  }
}

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
        participants: {
          where: { userId: chairman.id },
          select: { role: true }
        }
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

    // Проверяем права:
    // 1. Создатель группы
    // 2. Старые группы без createdById
    // 3. Председатель является админом группы
    const isCreator = chat.createdById === chairman.id;
    const isLegacyGroup = !chat.createdById;
    const isAdmin = chat.participants.some(p => p.role === "admin");
    
    const canDelete = isCreator || isLegacyGroup || isAdmin;
    if (!canDelete) {
      return NextResponse.json(
        { error: "Только создатель или админ группы может её удалить" },
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

