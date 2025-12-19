import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { sendUserNotification } from "@/lib/notifications";
import { getOrCreatePrivateChat } from "@/lib/chat-server-utils";

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
        chat: {
          select: {
            participant1Id: true,
            participant2Id: true,
          },
        },
      },
    });

    if (!originalMessage) {
      return NextResponse.json({ error: "Сообщение не найдено" }, { status: 404 });
    }

    // Проверяем, что пользователь имеет доступ к оригинальному сообщению
    const hasAccess =
      originalMessage.chat.participant1Id === userId ||
      originalMessage.chat.participant2Id === userId;

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

    // Используем утилиту для создания/поиска чата с нормализацией ID
    let chat = await getOrCreatePrivateChat(userId, targetUserId);

    // Подготавливаем текст для lastMessage (реальное содержимое сообщения)
    // Если есть вложения, добавляем пометку
    const hasAttachments = originalMessage.attachments.length > 0;
    const messagePreview = hasAttachments
      ? `📎 ${originalMessage.content || "Вложение"}`
      : originalMessage.content || "Пересланное сообщение";
    
    // Ограничиваем длину preview для lastMessage (обычно ограничение в БД ~255 символов)
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

    // Обновляем последнее сообщение в чате с реальным содержимым
    await prisma.chat.update({
      where: { id: chat.id },
      data: {
        lastMessage: lastMessageText,
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

      // Используем правильный порядок имени: Фамилия Имя Отчество
      // Фильтруем пустые значения и строки из пробелов, затем объединяем
      const senderName = sender
        ? [sender.lastName, sender.firstName, sender.middleName]
            .filter((name) => name && name.trim().length > 0)
            .map((name) => name.trim())
            .join(" ") || "Пользователь"
        : "Пользователь";

      const baseUrl =
        process.env.NEXT_PUBLIC_APP_URL || process.env.NEXTAUTH_URL || "https://myunion.pro";

      // Отправляем уведомление только если targetUserId валиден
      if (targetUserId && typeof targetUserId === 'string' && targetUserId.trim() !== '') {
        await sendUserNotification({
          userId: targetUserId,
          type: "chat_message",
          title: `📨 Пересланное сообщение от ${senderName}`,
          body: originalMessage.content.substring(0, 100),
          url: `${baseUrl}/dashboard/chat?userId=${userId}`,
          senderName,
        });
      }
    } catch (notificationError) {
      console.error("[chat/forward] Error sending notification:", notificationError);
      // Не прерываем пересылку из-за ошибки уведомлений
    }

    return NextResponse.json({ message: forwardedMessage });
  } catch (error: any) {
    console.error("[chat/forward] Error:", error);
    return NextResponse.json(
      {
        error: "Внутренняя ошибка сервера",
        details: process.env.NODE_ENV === "development" ? error?.message : undefined,
      },
      { status: 500 }
    );
  }
}
