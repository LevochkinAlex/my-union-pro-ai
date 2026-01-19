/**
 * PUT /api/chat/[chatId]/messages/[messageId] - Редактировать сообщение
 * DELETE /api/chat/[chatId]/messages/[messageId] - Удалить сообщение
 */
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { requireChatAccess } from "@/lib/chat-service";

export async function PUT(
  request: NextRequest,
  { params }: { params: { chatId: string; messageId: string } | Promise<{ chatId: string; messageId: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }

    const resolvedParams = await Promise.resolve(params);
    const { chatId, messageId } = resolvedParams;
    const userId = session.user.id;

    // Проверяем доступ к чату
    await requireChatAccess(chatId, userId);

    const { content } = await request.json();

    // Проверяем что сообщение принадлежит пользователю
    const message = await prisma.chatMessage.findUnique({
      where: { id: messageId },
      select: { senderId: true, chatId: true },
    });

    if (!message) {
      return NextResponse.json({ error: "Сообщение не найдено" }, { status: 404 });
    }

    if (message.chatId !== chatId) {
      return NextResponse.json({ error: "Неверный чат" }, { status: 400 });
    }

    if (message.senderId !== userId) {
      return NextResponse.json({ error: "Нет прав на редактирование" }, { status: 403 });
    }

    // Обновляем сообщение
    const updatedMessage = await prisma.chatMessage.update({
      where: { id: messageId },
      data: {
        content,
        editedAt: new Date(),
      },
      include: {
        sender: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            middleName: true,
            avatarUrl: true,
          },
        },
        attachments: true,
        reactions: {
          include: {
            user: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                avatarUrl: true,
              },
            },
          },
        },
      },
    });

    return NextResponse.json({ message: updatedMessage });
  } catch (error: any) {
    console.error("[PUT /api/chat/[chatId]/messages/[messageId]] Error:", error);
    return NextResponse.json(
      { error: error.message || "Ошибка редактирования сообщения" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { chatId: string; messageId: string } | Promise<{ chatId: string; messageId: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }

    const resolvedParams = await Promise.resolve(params);
    const { chatId, messageId } = resolvedParams;
    const userId = session.user.id;

    // Проверяем доступ к чату
    await requireChatAccess(chatId, userId);

    // Проверяем что сообщение принадлежит пользователю или пользователь - админ чата
    const message = await prisma.chatMessage.findUnique({
      where: { id: messageId },
      include: {
        chat: {
          include: {
            participants: {
              where: { userId, leftAt: null },
            },
          },
        },
      },
    });

    if (!message) {
      return NextResponse.json({ error: "Сообщение не найдено" }, { status: 404 });
    }

    if (message.chatId !== chatId) {
      return NextResponse.json({ error: "Неверный чат" }, { status: 400 });
    }

    const isOwner = message.senderId === userId;
    const isAdmin = message.chat.participants.some((p) => p.role === "admin" && p.userId === userId);

    if (!isOwner && !isAdmin) {
      return NextResponse.json({ error: "Нет прав на удаление" }, { status: 403 });
    }

    // Удаляем сообщение (каскадно удалятся реакции, вложения, прочитанные)
    await prisma.chatMessage.delete({
      where: { id: messageId },
    });

    // Если это было последнее сообщение в чате, обновляем lastMessageId
    const lastMessage = await prisma.chatMessage.findFirst({
      where: { chatId },
      orderBy: { createdAt: "desc" },
      select: { id: true, createdAt: true },
    });

    await prisma.chat.update({
      where: { id: chatId },
      data: {
        lastMessageId: lastMessage?.id || null,
        lastMessageAt: lastMessage?.createdAt || null,
      },
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("[DELETE /api/chat/[chatId]/messages/[messageId]] Error:", error);
    return NextResponse.json(
      { error: error.message || "Ошибка удаления сообщения" },
      { status: 500 }
    );
  }
}
