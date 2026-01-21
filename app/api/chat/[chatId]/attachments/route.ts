import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { mkdir } from "fs/promises";
import path from "path";
import { processMediaFile, detectFileType } from "@/lib/media-processor";
import { initVDSStorageFromEnv, uploadFileToVDS, isVDSStorageConfigured } from "@/lib/vds-storage";
import { optimizeWithPreset, getMimeType } from "@/lib/image-optimizer";
import { sendUserNotification } from "@/lib/notifications";
import { 
  requireChatAccess, 
  ChatAccessError,
  getChatParticipantIds,
} from "@/lib/chat-service";

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

    // Проверяем доступ через сервис
    let chat: any;
    try {
      const result = await requireChatAccess(chatId, userId);
      chat = result.chat;
    } catch (error) {
      if (error instanceof ChatAccessError) {
        return NextResponse.json({ error: error.message }, { status: 403 });
      }
      throw error;
    }

    // Получаем полную информацию о чате
    const fullChat = await prisma.chat.findUnique({
      where: { id: chatId },
      select: {
        type: true,
        name: true,
      },
    });

    const formData = await request.formData();
    const file = formData.get("file") as File;
    const content = (formData.get("content") as string) || "";
    const replyToId = (formData.get("replyToId") as string) || null;

    if (!file || file.size === 0) {
      return NextResponse.json({ error: "Файл не предоставлен" }, { status: 400 });
    }

    // TODO: Проверка replyToId теперь через Matrix API
    // if (replyToId) {
    //   // Проверка через Matrix API
    // }

    // Создаем директорию для загрузок
    await mkdir(UPLOAD_DIR, { recursive: true });

    const bytes = await file.arrayBuffer();
    let buffer: Buffer = Buffer.from(bytes) as Buffer;
    let originalName = file.name;
    
    // Обрабатываем медиа-файл
    let processedFile;
    try {
      processedFile = await processMediaFile(buffer, originalName, {
        convertHeic: true,
        maxWidth: 2048,
        maxHeight: 2048,
        quality: 85,
      });
      buffer = processedFile.buffer;
      originalName = processedFile.fileName;
    } catch (error) {
      console.error(`[chat/attachments] Error processing media file:`, error);
      const detectedType = await detectFileType(buffer, originalName);
      if (detectedType) {
        originalName = originalName.replace(/\.[^.]+$/, `.${detectedType.ext}`);
      }
    }
    
    let mimeType = processedFile?.mimeType || file.type || "application/octet-stream";
    let fileExtension = path.extname(originalName);
    
    // Оптимизация изображений
    if (mimeType.startsWith("image/") && mimeType !== "image/gif") {
      try {
        const originalSize = buffer.length;
        const optimized = await optimizeWithPreset(buffer, "post");
        buffer = optimized.buffer;
        mimeType = getMimeType(optimized.format);
        fileExtension = `.${optimized.format}`;
        originalName = originalName.replace(/\.[^.]+$/, fileExtension);
        
        console.log(`[chat/attachments] Image optimized: ${(originalSize / 1024).toFixed(1)}KB -> ${(optimized.size / 1024).toFixed(1)}KB (${optimized.savings}% saved)`);
      } catch (optError) {
        console.error(`[chat/attachments] Optimization failed, using original:`, optError);
      }
    }
    
    const fileName = `${Date.now()}-${Math.random().toString(36).substring(7)}${fileExtension}`;
    const fileKey = `chat/${fileName}`;
    
    // Загружаем на VDS
    if (!isVDSStorageConfigured()) {
      throw new Error("VDS storage не настроен");
    }

    let filePath: string;
    try {
      filePath = await uploadFileToVDS(fileKey, buffer, mimeType);
      console.log(`[chat/attachments] File uploaded to VDS: ${filePath}`);
    } catch (vdsError) {
      console.error("[chat/attachments] VDS upload failed:", vdsError);
      throw new Error(`Не удалось загрузить файл на сервер`);
    }

    // Определяем тип файла
    let attachmentType = "file";
    if (mimeType.startsWith("image/")) {
      attachmentType = "image";
    } else if (mimeType.startsWith("video/")) {
      attachmentType = "video";
    }

    // TODO: Реализовать загрузку файлов
    // Пока возвращаем ошибку
    return NextResponse.json(
      { error: "Загрузка файлов временно недоступна" },
      { status: 501 }
    );

    // Обновляем чат
    const attachmentText = attachmentType === "image" ? "📷 Фото" : attachmentType === "video" ? "🎥 Видео" : "📎 Файл";
    await prisma.chat.update({
      where: { id: chatId },
      data: {
        lastMessageAt: new Date(),
      },
    });

    // Сбрасываем readAt для участников
    await prisma.chatParticipant.updateMany({
      where: {
        chatId,
        userId: { not: userId },
        leftAt: null,
      },
      data: {
        readAt: null,
      },
    });

    // TODO: Отправить файл через Matrix Media API и создать сообщение в Matrix
    // Пока возвращаем информацию о загруженном файле
    const message = {
      id: 'temp',
      sender: { id: userId },
      content: content.trim() || attachmentText,
      attachments: [{
        type: attachmentType,
        fileName: fileName,
        originalName: originalName,
        filePath: filePath,
        fileSize: buffer.length,
        mimeType: mimeType || null,
      }],
    };

    // Отправляем уведомления
    const recipientIds = await getChatParticipantIds(chatId, userId);
    if (recipientIds.length > 0) {
      try {
        const sender = await prisma.user.findUnique({
          where: { id: userId },
          select: { firstName: true, lastName: true },
        });

        const senderName = sender 
          ? `${sender.firstName || ""} ${sender.lastName || ""}`.trim() || "Пользователь"
          : "Пользователь";

        const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://myunion.pro";
        const isGroupChat = fullChat?.type === "GROUP";

        await Promise.all(
          recipientIds.map((recipientId) =>
            sendUserNotification({
              userId: recipientId,
              type: "chat_message",
              title: `💬 ${attachmentText} от ${senderName}`,
              body: content.trim() || attachmentText,
              url: isGroupChat
                ? `${baseUrl}/dashboard/chats/ppo-head?chatId=${chatId}`
                : `${baseUrl}/dashboard/chat?chatId=${chatId}`,
              senderName,
            }).catch(console.error)
          )
        );
      } catch (notificationError) {
        console.error("[chat/attachments] Error sending notification:", notificationError);
      }
    }

    return NextResponse.json({ message });
  } catch (error: any) {
    console.error("[chat/attachments] Error:", error);
    return NextResponse.json(
      { 
        error: "Внутренняя ошибка сервера",
        details: process.env.NODE_ENV === "development" ? error?.message : undefined
      },
      { status: 500 }
    );
  }
}
