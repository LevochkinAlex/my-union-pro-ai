import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { sendUserNotification } from "@/lib/notifications";
import { 
  getOrCreatePrivateChat, 
  checkChatAccess 
} from "@/lib/chat-service";

// POST - пересылка сообщения
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }

    const { messageId, targetUserId } = await request.json();

    if (!messageId || !targetUserId) {
      return NextResponse.json(
        { error: "Необходимо указать messageId и targetUserId" },
        { status: 400 }
      );
    }

    const userId = session.user.id;

    if (userId === targetUserId) {
      return NextResponse.json(
        { error: "Нельзя переслать сообщение самому себе" },
        { status: 400 }
      );
    }

    // Получаем оригинальное сообщение
    const originalMessage = await prisma.chatMessage.findUnique({
      where: { id: messageId },
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

    if (!originalMessage) {
      return NextResponse.json({ error: "Сообщение не найдено" }, { status: 404 });
    }

    // Проверяем доступ к оригинальному сообщению через сервис
    const { hasAccess } = await checkChatAccess(originalMessage.chatId, userId);

    if (!hasAccess) {
      return NextResponse.json(
        { error: "Нет доступа к этому сообщению" },
        { status: 403 }
      );
    }

    // Проверяем существование целевого пользователя
    const targetUser = await prisma.user.findUnique({
      where: { id: targetUserId },
      select: { id: true },
    });

    if (!targetUser) {
      return NextResponse.json({ error: "Пользователь не найден" }, { status: 404 });
    }

    // Создаем/находим чат через сервис
    const { chat } = await getOrCreatePrivateChat(userId, targetUserId);

    // Подготавливаем preview
    const hasAttachments = originalMessage.attachments.length > 0;
    const messagePreview = hasAttachments
      ? `📎 ${originalMessage.content || "Вложение"}`
      : originalMessage.content || "Пересланное сообщение";
    
    const lastMessageText = messagePreview.length > 200 
      ? messagePreview.substring(0, 200) + "..."
      : messagePreview;

    // Создаем пересланное сообщение
    const forwardedMessage = await prisma.chatMessage.create({
      data: {
        chatId: chat.id,
        senderId: userId,
        content: originalMessage.content,
        forwardedFromId: messageId,
        attachments: {
          create: originalMessage.attachments.map((attachment) => ({
            type: attachment.type,
            fileName: attachment.fileName,
            originalName: attachment.originalName,
            filePath: attachment.filePath,
            fileSize: attachment.fileSize,
            mimeType: attachment.mimeType,
            thumbnailPath: attachment.thumbnailPath,
          })),
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
        forwardedFrom: {
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

    // Обновляем чат
    await prisma.chat.update({
      where: { id: chat.id },
      data: {
        lastMessage: lastMessageText,
        lastMessageAt: new Date(),
      },
    });

    // Сбрасываем readAt через ChatParticipant
    await prisma.chatParticipant.updateMany({
      where: {
        chatId: chat.id,
        userId: { not: userId },
        leftAt: null,
      },
      data: {
        readAt: null,
      },
    });

    // Также для старой схемы
    if (chat.participant1Id || chat.participant2Id) {
      const updateData: any = {};
      if (chat.participant1Id === userId) {
        updateData.participant2ReadAt = null;
      } else if (chat.participant2Id === userId) {
        updateData.participant1ReadAt = null;
      }
      if (Object.keys(updateData).length > 0) {
        await prisma.chat.update({
          where: { id: chat.id },
          data: updateData,
        });
      }
    }

    // Отправляем уведомление
    try {
      const sender = await prisma.user.findUnique({
        where: { id: userId },
        select: { firstName: true, lastName: true, middleName: true },
      });

      const senderName = sender
        ? [sender.lastName, sender.firstName, sender.middleName]
            .filter((name) => name && name.trim().length > 0)
            .map((name) => name.trim())
            .join(" ") || "Пользователь"
        : "Пользователь";

      const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://myunion.pro";

      if (targetUserId) {
        await sendUserNotification({
          userId: targetUserId,
          type: "chat_message",
          title: `📨 Пересланное сообщение от ${senderName}`,
          body: originalMessage.content.substring(0, 100),
          url: `${baseUrl}/dashboard/chat?chatId=${chat.id}`,
          senderName,
        });
      }
    } catch (notificationError) {
      console.error("[chat/forward] Error sending notification:", notificationError);
    }

    return NextResponse.json({ message: forwardedMessage });
  } catch (error: any) {
    console.error("[chat/forward] Error:", error);
    return NextResponse.json(
      { error: "Внутренняя ошибка сервера" },
      { status: 500 }
    );
  }
}
