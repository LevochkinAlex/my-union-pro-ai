import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { writeFile, mkdir, unlink } from "fs/promises";
import path from "path";
import { 
  requireChatAccess, 
  ChatAccessError 
} from "@/lib/chat-service";

const UPLOAD_DIR = path.join(process.cwd(), "public", "uploads", "chat");

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

    // Проверяем доступ через сервис
    try {
      await requireChatAccess(chatId, userId);
    } catch (error) {
      if (error instanceof ChatAccessError) {
        return NextResponse.json({ error: error.message }, { status: 403 });
      }
      throw error;
    }

    // Парсим тело запроса
    const contentType = request.headers.get("content-type") || "";
    let content = "";
    let file: File | null = null;

    if (contentType.includes("multipart/form-data")) {
      const formData = await request.formData();
      content = (formData.get("content") as string) || "";
      file = formData.get("file") as File | null;
    } else {
      const body = await request.json();
      content = body.content || "";
    }

    if (!content.trim() && !file) {
      return NextResponse.json({ error: "Сообщение не может быть пустым" }, { status: 400 });
    }

    // TODO: Получаем сообщение из Matrix API
    // const message = await getMatrixMessage(...);
    return NextResponse.json(
      { error: "Редактирование сообщений временно недоступно (миграция на Matrix API)" },
      { status: 501 }
    );

    /* Временная заглушка
    const message = null as any;

    if (!message) {
      return NextResponse.json({ error: "Сообщение не найдено" }, { status: 404 });
    }

    if (message.chatId !== chatId) {
      return NextResponse.json({ error: "Сообщение не принадлежит этому чату" }, { status: 403 });
    }

    if (message.senderId !== userId) {
      return NextResponse.json({ error: "Вы можете редактировать только свои сообщения" }, { status: 403 });
    }

    if (message.deletedAt) {
      return NextResponse.json({ error: "Нельзя редактировать удаленное сообщение" }, { status: 400 });
    }

    // Обработка нового файла
    if (file && file.size > 0) {
      // Удаляем старые вложения
      if (message.attachments && message.attachments.length > 0) {
        for (const attachment of message.attachments) {
          try {
            const filePath = path.join(process.cwd(), "public", attachment.filePath.replace(/^\//, ""));
            await unlink(filePath);
          } catch (fileError) {
            console.warn(`[chat] Failed to delete attachment file:`, fileError);
          }
        }
      }

      await prisma.chatMessageAttachment.deleteMany({
        where: { messageId: messageId },
      });

      await mkdir(UPLOAD_DIR, { recursive: true });

      const fileExtension = path.extname(file.name);
      const fileName = `${Date.now()}-${Math.random().toString(36).substring(7)}${fileExtension}`;
      const filePath = path.join(UPLOAD_DIR, fileName);

      const bytes = await file.arrayBuffer();
      const buffer = Buffer.from(bytes);
      await writeFile(filePath, buffer);

      const mimeType = file.type || "";
      let attachmentType = "file";
      if (mimeType.startsWith("image/")) {
        attachmentType = "image";
      } else if (mimeType.startsWith("video/")) {
        attachmentType = "video";
      }

      await prisma.chatMessageAttachment.create({
        data: {
          messageId: messageId,
          type: attachmentType,
          fileName: fileName,
          originalName: file.name,
          filePath: `/uploads/chat/${fileName}`,
          fileSize: file.size,
          mimeType: mimeType || null,
        },
      });
    }

    // Обновляем сообщение
    const updatedMessage = await prisma.chatMessage.update({
      where: { id: messageId },
      data: {
        content: content.trim() || "",
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
        replyTo: {
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
          },
        },
      },
    });

    return NextResponse.json({ message: updatedMessage });
  } catch (error: any) {
    console.error("[chat] PATCH Error:", error);
    return NextResponse.json(
      { error: "Внутренняя ошибка сервера" },
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

    // Проверяем доступ через сервис
    try {
      await requireChatAccess(chatId, userId);
    } catch (error) {
      if (error instanceof ChatAccessError) {
        return NextResponse.json({ error: error.message }, { status: 403 });
      }
      throw error;
    }

    // Проверяем сообщение
    const message = await prisma.chatMessage.findUnique({
      where: { id: messageId },
      select: {
        senderId: true,
        chatId: true,
        deletedAt: true,
      },
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

    if (message.deletedAt) {
      return NextResponse.json({ error: "Сообщение уже удалено" }, { status: 400 });
    }

    // Мягкое удаление
    const updatedMessage = await prisma.chatMessage.update({
      where: { id: messageId },
      data: {
        deletedAt: new Date(),
        content: "Сообщение удалено",
      },
    });

    return NextResponse.json({ 
      success: true, 
      deletedAt: updatedMessage.deletedAt,
      messageId: messageId,
      chatId: chatId,
    });
  } catch (error: any) {
    console.error("[chat] DELETE Error:", error);
    return NextResponse.json(
      { error: "Внутренняя ошибка сервера" },
      { status: 500 }
    );
  }
}
