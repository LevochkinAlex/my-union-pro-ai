import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { requireChatAccess } from "@/lib/chat-service";

// PATCH - редактирование сообщения
export async function PATCH(
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

    await requireChatAccess(chatId, userId);

    const body = await request.json();
    const { content } = body;

    if (!content || !content.trim()) {
      return NextResponse.json({ error: "Сообщение не может быть пустым" }, { status: 400 });
    }

    // Проверяем, что сообщение принадлежит текущему пользователю
    const message = await prisma.chatMessage.findUnique({
      where: { id: messageId },
      select: { senderId: true, chatId: true },
    });

    if (!message) {
      return NextResponse.json({ error: "Сообщение не найдено" }, { status: 404 });
    }

    if (message.chatId !== chatId) {
      return NextResponse.json({ error: "Сообщение не принадлежит этому чату" }, { status: 403 });
    }

    if (message.senderId !== userId) {
      return NextResponse.json({ error: "Вы можете редактировать только свои сообщения" }, { status: 403 });
    }

    // Обновляем сообщение
    const updatedMessage = await prisma.chatMessage.update({
      where: { id: messageId },
      data: {
        content: content.trim(),
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
        replyTo: {
          include: {
            sender: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                avatarUrl: true,
              },
            },
          },
        },
        attachments: true,
      },
    });

    return NextResponse.json({
      message: {
        id: updatedMessage.id,
        chatId: updatedMessage.chatId,
        sender: updatedMessage.sender,
        content: updatedMessage.content,
        messageType: updatedMessage.messageType,
        replyTo: updatedMessage.replyTo,
        threadRootId: updatedMessage.threadRootId,
        attachments: updatedMessage.attachments,
        editedAt: updatedMessage.editedAt,
        createdAt: updatedMessage.createdAt,
        updatedAt: updatedMessage.updatedAt,
      },
    });
  } catch (error: any) {
    console.error("[PATCH /api/chat/[chatId]/messages/[messageId]] Error:", error);
    return NextResponse.json(
      { error: error.message || "Ошибка редактирования сообщения" },
      { status: 500 }
    );
  }
}

// DELETE - удаление сообщения
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

    await requireChatAccess(chatId, userId);

    // Проверяем, что сообщение принадлежит текущему пользователю
    const message = await prisma.chatMessage.findUnique({
      where: { id: messageId },
      select: { senderId: true, chatId: true },
    });

    if (!message) {
      return NextResponse.json({ error: "Сообщение не найдено" }, { status: 404 });
    }

    if (message.chatId !== chatId) {
      return NextResponse.json({ error: "Сообщение не принадлежит этому чату" }, { status: 403 });
    }

    if (message.senderId !== userId) {
      return NextResponse.json({ error: "Вы можете удалять только свои сообщения" }, { status: 403 });
    }

    // Удаляем сообщение (каскадно удалятся реакции, вложения и т.д.)
    await prisma.chatMessage.delete({
      where: { id: messageId },
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
