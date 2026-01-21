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
// Динамический импорт для избежания проблем при сборке
// Кэшируем модуль для производительности
let socketModule: typeof import('@/server/socket') | null = null;
async function emitNewMessage(chatId: string, message: any) {
  try {
    if (!socketModule) {
      socketModule = await import('@/server/socket');
    }
    socketModule.emitNewMessage(chatId, message);
  } catch (error) {
    console.error('[chat/attachments] Failed to emit message via WebSocket:', error);
    // Не пробрасываем ошибку, чтобы не прерывать основной поток
  }
}
import { normalizeUserAvatar } from "@/lib/api-helpers";

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

    // Получаем отправителя
    const sender = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        avatarUrl: true,
      },
    });

    if (!sender) {
      return NextResponse.json({ error: "Пользователь не найден" }, { status: 404 });
    }

    // Создаем сообщение с вложением
    const attachmentText = content.trim() || (attachmentType === "image" ? "📷 Фото" : attachmentType === "video" ? "🎥 Видео" : "📎 Файл");
    
    const message = await prisma.chatMessage.create({
      data: {
        chatId,
        senderId: userId,
        content: attachmentText,
        messageType: 'text',
        replyToId: replyToId || null,
        attachments: {
          create: {
            type: attachmentType,
            url: filePath,
            name: originalName,
            size: buffer.length,
            mimeType: mimeType || null,
            ...(attachmentType === "image" && processedFile?.width && processedFile?.height ? {
              width: processedFile.width,
              height: processedFile.height,
            } : {}),
          },
        },
      },
      include: {
        sender: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
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

    // Обновляем чат
    await prisma.chat.update({
      where: { id: chatId },
      data: {
        lastMessageId: message.id,
        lastMessageAt: message.createdAt,
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

    // Нормализуем сообщение для ответа
    const normalizedMessage = {
      id: message.id,
      chatId: message.chatId,
      senderId: message.senderId,
      content: message.content,
      messageType: message.messageType,
      createdAt: message.createdAt,
      editedAt: message.editedAt,
      sender: {
        id: message.sender.id,
        firstName: message.sender.firstName,
        lastName: message.sender.lastName,
        avatarUrl: normalizeUserAvatar(message.sender).avatarUrl,
      },
      replyTo: message.replyTo && message.replyTo.sender ? {
        id: message.replyTo.id,
        content: message.replyTo.content,
        sender: {
          id: message.replyTo.sender.id,
          firstName: message.replyTo.sender.firstName,
          lastName: message.replyTo.sender.lastName,
          avatarUrl: normalizeUserAvatar(message.replyTo.sender).avatarUrl,
        },
      } : null,
      attachments: message.attachments.map((att: any) => ({
        id: att.id,
        type: att.type,
        url: att.url,
        name: att.name,
        size: att.size,
        mimeType: att.mimeType,
        thumbnailUrl: att.thumbnailUrl,
        width: att.width,
        height: att.height,
      })),
      reactions: {},
    };

    // Отправляем сообщение через WebSocket другим участникам
    try {
      await emitNewMessage(chatId, normalizedMessage);
      console.log('[chat/attachments] Message emitted via WebSocket to room:', chatId, normalizedMessage.id);
    } catch (wsError) {
      console.error('[chat/attachments] Error emitting message via WebSocket:', wsError);
    }

    // Отправляем уведомления другим участникам (push + запись в БД для раздела уведомлений)
    try {
      const participants = await prisma.chatParticipant.findMany({
        where: {
          chatId,
          userId: { not: userId },
          leftAt: null,
        },
        select: { userId: true },
      });

      if (participants.length > 0) {
        const senderName = `${sender.firstName || ''} ${sender.lastName || ''}`.trim() || 'Пользователь';
        const notificationContent = attachmentText.length > 100 ? attachmentText.substring(0, 100) + '...' : attachmentText;
        const notificationUrl = `/dashboard/chat?chatId=${chatId}`;

        // Отправляем уведомления каждому участнику через sendUserNotification
        // Это создаст записи в БД и отправит push-уведомления
        await Promise.allSettled(
          participants.map(async (participant) => {
            try {
              await sendUserNotification({
                userId: participant.userId,
                type: 'chat_message',
                title: `Новое сообщение от ${senderName}`,
                body: notificationContent,
                url: notificationUrl,
                senderName: senderName,
                metadata: {
                  chatId,
                  messageId: normalizedMessage.id,
                },
              });
            } catch (err) {
              console.error(`[chat/attachments] Error sending notification to user ${participant.userId}:`, err);
            }
          })
        );
      }
    } catch (notifError) {
      console.error('[chat/attachments] Error preparing notifications:', notifError);
    }

    return NextResponse.json({ message: normalizedMessage });
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
