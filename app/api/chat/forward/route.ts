import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { sendUserNotification } from "@/lib/notifications";
import { 
  getOrCreatePrivateChat, 
  checkChatAccess,
  requireChatAccess 
} from "@/lib/chat-service";
import { normalizeUserAvatar } from "@/lib/api-helpers";

// Динамический импорт для избежания проблем при сборке
let socketModule: typeof import('@/server/socket') | null = null;
async function emitNewMessage(chatId: string, message: any) {
  try {
    if (!socketModule) {
      socketModule = await import('@/server/socket');
    }
    socketModule.emitNewMessage(chatId, message);
  } catch (error) {
    console.error('[chat/forward] Failed to emit message via WebSocket:', error);
  }
}

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

    // Получаем исходное сообщение
    const sourceMessage = await prisma.chatMessage.findUnique({
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
        chat: {
          select: {
            id: true,
            type: true,
            name: true,
            newsChannelId: true,
          },
        },
        attachments: true,
      },
    });

    if (!sourceMessage) {
      return NextResponse.json(
        { error: "Сообщение не найдено" },
        { status: 404 }
      );
    }

    // Проверяем доступ к исходному сообщению
    try {
      await requireChatAccess(sourceMessage.chatId, userId);
    } catch (error) {
      return NextResponse.json(
        { error: "Нет доступа к исходному сообщению" },
        { status: 403 }
      );
    }

    // Создаем или получаем личный чат с получателем
    const { chat: targetChat } = await getOrCreatePrivateChat(userId, targetUserId);

    // Обрабатываем разные типы сообщений
    let forwardedContent = sourceMessage.content;
    let forwardedMessageType = sourceMessage.messageType;
    let forwardedAttachments: any[] = [];

    // Если это пост из канала
    if (sourceMessage.messageType === 'channel_post') {
      try {
        const postData = JSON.parse(sourceMessage.content);
        const postId = postData.postId;

        if (postId) {
          // Проверяем, состоит ли получатель в канале
          const targetUserInChannel = sourceMessage.chat.newsChannelId
            ? await prisma.chatParticipant.findFirst({
                where: {
                  chatId: sourceMessage.chatId,
                  userId: targetUserId,
                  leftAt: null,
                },
              })
            : null;

          // Получаем данные поста
          const newsPost = await prisma.newsPost.findUnique({
            where: { id: postId },
            select: {
              id: true,
              title: true,
              content: true,
              coverImage: true,
              channelId: true,
              channel: {
                select: {
                  id: true,
                  name: true,
                },
              },
            },
          });

          if (newsPost) {
            // Формируем контент для пересылки
            if (targetUserInChannel) {
              // Если получатель в канале - пересылаем со ссылкой на канал
              forwardedContent = JSON.stringify({
                type: "channel_post",
                postId: newsPost.id,
                title: newsPost.title,
                content: newsPost.content,
                coverImage: newsPost.coverImage,
                channelId: newsPost.channelId,
                channelName: newsPost.channel?.name,
                forwarded: true,
                originalChatId: sourceMessage.chatId,
              });
            } else {
              // Если получатель не в канале - пересылаем без ссылки на канал
              forwardedContent = JSON.stringify({
                type: "channel_post",
                postId: newsPost.id,
                title: newsPost.title,
                content: newsPost.content,
                coverImage: newsPost.coverImage,
                forwarded: true,
                originalChatId: sourceMessage.chatId,
                // Не включаем channelId и channelName
              });
            }
            forwardedMessageType = 'channel_post';
          }
        }
      } catch (parseError) {
        console.error('[chat/forward] Error parsing channel_post:', parseError);
        // Продолжаем с обычной пересылкой
      }
    } else {
      // Для обычных сообщений копируем вложения
      if (sourceMessage.attachments && sourceMessage.attachments.length > 0) {
        forwardedAttachments = sourceMessage.attachments.map(att => ({
          type: att.type,
          url: att.url,
          name: att.name,
          size: att.size,
          mimeType: att.mimeType,
          thumbnailUrl: att.thumbnailUrl,
          width: att.width,
          height: att.height,
        }));
      }
    }

    // Создаем пересланное сообщение
    const forwardedMessage = await prisma.chatMessage.create({
      data: {
        chatId: targetChat.id,
        senderId: userId,
        content: forwardedContent,
        messageType: forwardedMessageType,
        attachments: forwardedAttachments.length > 0 ? {
          create: forwardedAttachments,
        } : undefined,
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

    // Обновляем lastMessage в целевом чате
    await prisma.chat.update({
      where: { id: targetChat.id },
      data: {
        lastMessageId: forwardedMessage.id,
        lastMessageAt: forwardedMessage.createdAt,
      },
    });

    // Отправляем уведомление получателю
    const senderName = `${session.user.firstName || ''} ${session.user.lastName || ''}`.trim() || 'Пользователь';
    const notificationContent = sourceMessage.messageType === 'channel_post' 
      ? 'Переслан пост из канала'
      : forwardedContent.length > 100 
        ? forwardedContent.substring(0, 100) + '...' 
        : forwardedContent;

    try {
      await sendUserNotification({
        userId: targetUserId,
        type: 'chat_message',
        title: `Пересланное сообщение от ${senderName}`,
        body: notificationContent,
        url: `/dashboard/chat?chatId=${targetChat.id}`,
        senderName: senderName,
        metadata: {
          chatId: targetChat.id,
          messageId: forwardedMessage.id,
          forwarded: true,
        },
      });
    } catch (notifError) {
      console.error('[chat/forward] Error sending notification:', notifError);
    }

    // Отправляем через WebSocket
    await emitNewMessage(targetChat.id, {
      id: forwardedMessage.id,
      chatId: targetChat.id,
      senderId: forwardedMessage.senderId,
      content: forwardedMessage.content,
      messageType: forwardedMessage.messageType,
      createdAt: forwardedMessage.createdAt,
      sender: normalizeUserAvatar(forwardedMessage.sender),
      attachments: forwardedMessage.attachments,
    });

    return NextResponse.json({
      success: true,
      message: {
        id: forwardedMessage.id,
        chatId: targetChat.id,
      },
    });
  } catch (error: any) {
    console.error("[chat/forward] Error:", error);
    return NextResponse.json(
      { error: error.message || "Внутренняя ошибка сервера" },
      { status: 500 }
    );
  }
}
