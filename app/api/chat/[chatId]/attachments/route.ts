import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { writeFile, mkdir } from "fs/promises";
import path from "path";
import { convertHeicToJpegServer } from "@/lib/heic-convert-server";

const UPLOAD_DIR = path.join(process.cwd(), "public", "uploads", "chat");

// POST - загрузка вложений в чат
export async function POST(
  request: NextRequest,
  { params }: { params: { chatId: string } | Promise<{ chatId: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }

    const resolvedParams = await Promise.resolve(params);
    const chatId = resolvedParams.chatId;
    const userId = session.user.id;

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

    const formData = await request.formData();
    const file = formData.get("file") as File;
    const content = (formData.get("content") as string) || "";
    const replyToId = (formData.get("replyToId") as string) || null;

    if (!file || file.size === 0) {
      return NextResponse.json({ error: "Файл не предоставлен" }, { status: 400 });
    }

    // Проверяем, что сообщение для ответа существует и принадлежит этому чату
    if (replyToId) {
      const replyToMessage = await prisma.chatMessage.findUnique({
        where: { id: replyToId },
        select: { chatId: true },
      });

      if (!replyToMessage) {
        return NextResponse.json({ error: "Сообщение для ответа не найдено" }, { status: 404 });
      }

      if (replyToMessage.chatId !== chatId) {
        return NextResponse.json({ error: "Сообщение для ответа не принадлежит этому чату" }, { status: 403 });
      }
    }

    // Создаем директорию для загрузок
    await mkdir(UPLOAD_DIR, { recursive: true });

    const bytes = await file.arrayBuffer();
    let buffer = Buffer.from(bytes);
    let originalName = file.name;
    let mimeType = file.type || "";

    // Конвертируем HEIC/HEIF в JPEG, если это изображение
    if (mimeType.startsWith("image/")) {
      try {
        const converted = await convertHeicToJpegServer(buffer, originalName);
        buffer = converted.buffer;
        originalName = converted.fileName;
        mimeType = converted.mimeType;
      } catch (error) {
        console.error(`[chat/attachments] Error converting HEIC for ${originalName}:`, error);
        // Продолжаем с оригинальным файлом при ошибке конвертации
      }
    }

    const fileExtension = path.extname(originalName);
    const fileName = `${Date.now()}-${Math.random().toString(36).substring(7)}${fileExtension}`;
    const filePath = path.join(UPLOAD_DIR, fileName);
    await writeFile(filePath, buffer);

    // Определяем тип файла
    let attachmentType = "file";
    if (mimeType.startsWith("image/")) {
      attachmentType = "image";
    } else if (mimeType.startsWith("video/")) {
      attachmentType = "video";
    }

    // Создаем сообщение с вложением
    // Если пользователь не ввел текст, оставляем пустую строку (не показываем автоматический текст)
    const message = await prisma.chatMessage.create({
      data: {
        chatId,
        senderId: userId,
        content: content.trim() || "",
        replyToId: replyToId || null,
        attachments: {
          create: {
            type: attachmentType,
            fileName: fileName,
            originalName: originalName,
            filePath: `/uploads/chat/${fileName}`,
            fileSize: file.size,
            mimeType: mimeType || null,
          },
        },
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
      },
    });

    // Определяем получателя сообщения
    const recipientId = chat.participant1Id === userId 
      ? chat.participant2Id 
      : chat.participant1Id;

    // Обновляем последнее сообщение в чате
    // Если есть вложение, показываем тип вложения, иначе - текст сообщения
    const attachmentText = attachmentType === "image" ? "📷 Фото" : attachmentType === "video" ? "🎥 Видео" : "📎 Файл";
    await prisma.chat.update({
      where: { id: chatId },
      data: {
        lastMessage: content.trim() || attachmentText,
        lastMessageAt: new Date(),
        ...(chat.participant1Id === userId
          ? { participant2ReadAt: null }
          : { participant1ReadAt: null }),
      },
    });

    // Отправляем пуш-уведомление получателю
    try {
      const sender = await prisma.user.findUnique({
        where: { id: userId },
        select: {
          firstName: true,
          lastName: true,
          middleName: true,
        },
      });

      const senderName = sender 
        ? `${sender.firstName || ""} ${sender.middleName || ""} ${sender.lastName || ""}`.trim() || "Пользователь"
        : "Пользователь";

      const baseUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.NEXTAUTH_URL || "https://myunion.pro";
      const messagePreview = (content.trim() || attachmentText).substring(0, 100);

      const { sendNotification } = await import("@/lib/notifications");
      await sendNotification({
        userId: recipientId,
        title: `💬 ${attachmentText} от ${senderName}`,
        message: content.trim() || attachmentText,
        link: `${baseUrl}/dashboard/chat?userId=${userId}`,
        data: {
          type: "chat_message",
          chatId: chatId,
          senderId: userId,
        },
      });
    } catch (notificationError) {
      console.error("[chat/attachments] Error sending notification:", notificationError);
    }

    return NextResponse.json({ message });
  } catch (error: any) {
    console.error("[chat/attachments] Error:", error);
    return NextResponse.json(
      { error: "Внутренняя ошибка сервера" },
      { status: 500 }
    );
  }
}

