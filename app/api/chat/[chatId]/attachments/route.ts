import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { writeFile, mkdir } from "fs/promises";
import path from "path";
import { processMediaFile, detectFileType } from "@/lib/media-processor";
import { initVDSStorageFromEnv, uploadFileToVDS, isVDSStorageConfigured } from "@/lib/vds-storage";

// Инициализируем VDS хранилище при загрузке модуля
if (typeof window === "undefined") {
  initVDSStorageFromEnv();
}

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
    let buffer: Buffer = Buffer.from(bytes) as Buffer;
    let originalName = file.name;
    
    // Используем универсальный медиа-процессор для определения типа и обработки
    let processedFile;
    try {
      processedFile = await processMediaFile(buffer, originalName, {
        convertHeic: true,
        maxWidth: 2048, // Ограничиваем размер для чата
        maxHeight: 2048,
        quality: 85,
      });
      buffer = processedFile.buffer;
      originalName = processedFile.fileName;
    } catch (error) {
      console.error(`[chat/attachments] Error processing media file:`, error);
      // Если обработка не удалась, определяем тип файла хотя бы
      const detectedType = await detectFileType(buffer, originalName);
      if (detectedType) {
        originalName = originalName.replace(/\.[^.]+$/, `.${detectedType.ext}`);
      }
    }
    
    const mimeType = processedFile?.mimeType || file.type || "application/octet-stream";
    const fileExtension = path.extname(originalName);
    const fileName = `${Date.now()}-${Math.random().toString(36).substring(7)}${fileExtension}`;
    const fileKey = `chat/${fileName}`;
    
    let filePath: string;
    let dbFilePath: string; // Путь для сохранения в БД
    
    // Всегда загружаем на VDS, если он настроен
    if (isVDSStorageConfigured()) {
      try {
        filePath = await uploadFileToVDS(fileKey, buffer, mimeType);
        // Для VDS используем путь через API endpoint
        dbFilePath = `/api/uploads/chat/${fileName}`;
        console.log(`[chat/attachments] File uploaded to VDS: ${filePath}, DB path: ${dbFilePath}`);
      } catch (vdsError) {
        console.error("[chat/attachments] VDS upload failed:", vdsError);
        // Пробуем сохранить локально как fallback
        try {
          await mkdir(UPLOAD_DIR, { recursive: true });
          const localFilePath = path.join(UPLOAD_DIR, fileName);
          await writeFile(localFilePath, buffer);
          dbFilePath = `/uploads/chat/${fileName}`;
          filePath = dbFilePath;
          console.log(`[chat/attachments] VDS failed, saved locally as fallback: ${dbFilePath}`);
        } catch (localError) {
          console.error("[chat/attachments] Local fallback also failed:", localError);
          throw new Error(`Не удалось загрузить файл: ${vdsError instanceof Error ? vdsError.message : String(vdsError)}`);
        }
      }
    } else {
      // Локальное хранилище (только для разработки)
      await mkdir(UPLOAD_DIR, { recursive: true });
      const localFilePath = path.join(UPLOAD_DIR, fileName);
      await writeFile(localFilePath, buffer);
      dbFilePath = `/uploads/chat/${fileName}`;
      filePath = dbFilePath;
      console.log(`[chat/attachments] File saved locally (VDS not configured): ${dbFilePath}`);
    }

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
            filePath: dbFilePath,
            fileSize: buffer.length, // Используем размер буфера после возможной конвертации
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
    console.error("[chat/attachments] Error stack:", error?.stack);
    console.error("[chat/attachments] Error details:", {
      message: error?.message,
      name: error?.name,
      code: error?.code,
    });
    return NextResponse.json(
      { 
        error: "Внутренняя ошибка сервера",
        details: process.env.NODE_ENV === "development" ? error?.message : undefined
      },
      { status: 500 }
    );
  }
}

