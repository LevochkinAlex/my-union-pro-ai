import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { writeFile, mkdir, unlink } from "fs/promises";
import path from "path";

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

    // Проверяем, есть ли файл в запросе
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

    // Проверяем, что пользователь является участником чата
    const chat = await prisma.chat.findUnique({
      where: { id: chatId },
      select: {
        participant1Id: true,
        participant2Id: true,
      },
    });

    if (!chat) {
      return NextResponse.json({ error: "Чат не найден" }, { status: 404 });
    }

    if (chat.participant1Id !== userId && chat.participant2Id !== userId) {
      return NextResponse.json({ error: "Нет доступа к этому чату" }, { status: 403 });
    }

    // Проверяем, что сообщение существует и принадлежит пользователю
    const message = await prisma.chatMessage.findUnique({
      where: { id: messageId },
      select: {
        senderId: true,
        chatId: true,
        deletedAt: true,
        attachments: true,
      },
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

    if (message.deletedAt) {
      return NextResponse.json({ error: "Нельзя редактировать удаленное сообщение" }, { status: 400 });
    }

    // Если есть новый файл, удаляем старые вложения и создаем новое
    if (file && file.size > 0) {
      // Удаляем старые вложения с диска
      if (message.attachments && message.attachments.length > 0) {
        for (const attachment of message.attachments) {
          try {
            const filePath = path.join(process.cwd(), "public", attachment.filePath.replace(/^\//, ""));
            await unlink(filePath);
          } catch (fileError) {
            console.warn(`[chat] Failed to delete attachment file ${attachment.filePath}:`, fileError);
          }
        }
      }

      // Удаляем старые вложения из БД
      await prisma.chatMessageAttachment.deleteMany({
        where: { messageId: messageId },
      });

      // Создаем директорию для загрузок
      await mkdir(UPLOAD_DIR, { recursive: true });

      const fileExtension = path.extname(file.name);
      const fileName = `${Date.now()}-${Math.random().toString(36).substring(7)}${fileExtension}`;
      const filePath = path.join(UPLOAD_DIR, fileName);

      const bytes = await file.arrayBuffer();
      const buffer = Buffer.from(bytes);
      await writeFile(filePath, buffer);

      // Определяем тип файла
      const mimeType = file.type || "";
      let attachmentType = "file";
      if (mimeType.startsWith("image/")) {
        attachmentType = "image";
      } else if (mimeType.startsWith("video/")) {
        attachmentType = "video";
      }

      // Создаем новое вложение
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
      {
        error: "Внутренняя ошибка сервера",
        details: process.env.NODE_ENV === "development" ? error?.message : undefined,
      },
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
    // Учитываем имперсонализацию: если админ имперсонирует пользователя, используем ID имперсонируемого
    const userId = (session.user as any).originalAdminId && (session.user as any).isImpersonating 
      ? session.user.id 
      : session.user.id;

    // Проверяем, что пользователь является участником чата
    const chat = await prisma.chat.findUnique({
      where: { id: chatId },
      select: {
        participant1Id: true,
        participant2Id: true,
      },
    });

    if (!chat) {
      return NextResponse.json({ error: "Чат не найден" }, { status: 404 });
    }

    if (chat.participant1Id !== userId && chat.participant2Id !== userId) {
      return NextResponse.json({ error: "Нет доступа к этому чату" }, { status: 403 });
    }

    // Проверяем, что сообщение существует
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

    // Помечаем сообщение как удаленное (мягкое удаление)
    const updatedMessage = await prisma.chatMessage.update({
      where: { id: messageId },
      data: {
        deletedAt: new Date(),
        content: "Сообщение удалено",
      },
    });

    console.log(`[chat] Message ${messageId} deleted by user ${userId}, deletedAt: ${updatedMessage.deletedAt}`);

    return NextResponse.json({ success: true, deletedAt: updatedMessage.deletedAt });
  } catch (error: any) {
    console.error("[chat] DELETE Error:", error);
    return NextResponse.json(
      {
        error: "Внутренняя ошибка сервера",
        details: process.env.NODE_ENV === "development" ? error?.message : undefined,
      },
      { status: 500 }
    );
  }
}

