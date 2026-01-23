import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { requireChatAccess } from "@/lib/chat-service";

export async function POST(
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
    const { emoji } = body;

    if (!emoji) {
      return NextResponse.json({ error: "Эмодзи не указан" }, { status: 400 });
    }

    // Обработка виртуальных сообщений (для постов канала, которые еще не созданы как ChatMessage)
    let actualMessageId = messageId;
    if (messageId.startsWith('virtual_')) {
      const postId = messageId.replace('virtual_', '');
      // Ищем реальное сообщение для этого поста
      const channelPostMessages = await prisma.chatMessage.findMany({
        where: {
          chatId: chatId,
          messageType: 'channel_post',
        },
        select: {
          id: true,
          content: true,
        },
      });

      // Находим сообщение с нужным postId
      for (const msg of channelPostMessages) {
        try {
          const parsed = JSON.parse(msg.content);
          if (parsed.postId === postId) {
            actualMessageId = msg.id;
            break;
          }
        } catch (e) {
          // Игнорируем ошибки парсинга
        }
      }

      // Если не нашли реальное сообщение, создаем его
      if (actualMessageId === messageId) {
        // Получаем пост из NewsPost
        const newsPost = await prisma.newsPost.findUnique({
          where: { id: postId },
          include: {
            author: {
              select: {
                id: true,
              },
            },
            polls: {
              select: {
                id: true,
              },
            },
          },
        });

        if (!newsPost) {
          return NextResponse.json({ error: "Пост не найден" }, { status: 404 });
        }

        // Создаем ChatMessage для поста
        const messageContent = JSON.stringify({
          type: "channel_post",
          postId: newsPost.id,
          title: newsPost.title,
          content: newsPost.content,
          coverImage: newsPost.coverImage,
          hasPolls: (newsPost.polls?.length || 0) > 0,
        });

        const newMessage = await prisma.chatMessage.create({
          data: {
            chatId,
            senderId: newsPost.authorId,
            content: messageContent,
            messageType: "channel_post",
          },
        });

        actualMessageId = newMessage.id;
      }
    }

    // Получаем сообщение для проверки типа (канал или обычный чат)
    const message = await prisma.chatMessage.findUnique({
      where: { id: actualMessageId },
      select: {
        id: true,
        messageType: true,
        content: true,
      },
    });

    if (!message) {
      return NextResponse.json({ error: "Сообщение не найдено" }, { status: 404 });
    }

    // Проверяем, есть ли уже такая реакция от этого пользователя
    const existingReaction = await prisma.chatMessageReaction.findUnique({
      where: {
        messageId_userId_emoji: {
          messageId: actualMessageId,
          userId,
          emoji,
        },
      },
    });

    // Для каналов: если реакция ❤️, синхронизируем с NewsLike
    let newsPostId: string | null = null;
    if (message.messageType === 'channel_post') {
      try {
        const postData = JSON.parse(message.content);
        newsPostId = postData.postId || null;
      } catch (e) {
        // Игнорируем ошибки парсинга
      }
    }

    if (existingReaction) {
      // Удаляем реакцию
      await prisma.chatMessageReaction.delete({
        where: {
          id: existingReaction.id,
        },
      });

      // Если это канал и реакция ❤️, удаляем лайк из новостной ленты
      if (newsPostId && emoji === '❤️') {
        try {
          await prisma.newsLike.deleteMany({
            where: {
              newsPostId,
              userId,
            },
          });
        } catch (err) {
          console.error('[reactions] Error removing news like:', err);
        }
      }
    } else {
      // Добавляем реакцию
      await prisma.chatMessageReaction.create({
        data: {
          messageId: actualMessageId,
          userId,
          emoji,
        },
      });

      // Если это канал и реакция ❤️, добавляем лайк в новостную ленту
      if (newsPostId && emoji === '❤️') {
        try {
          await prisma.newsLike.upsert({
            where: {
              newsPostId_userId: {
                newsPostId,
                userId,
              },
            },
            create: {
              newsPostId,
              userId,
            },
            update: {},
          });
        } catch (err) {
          console.error('[reactions] Error adding news like:', err);
        }
      }
    }

    // Получаем все реакции для этого сообщения
    const reactions = await prisma.chatMessageReaction.findMany({
      where: { messageId: actualMessageId },
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
          },
        },
      },
    });

    // Группируем по эмодзи в формате, совместимом с MessageReactions
    const groupedReactions = reactions.reduce((acc, reaction) => {
      if (!acc[reaction.emoji]) {
        acc[reaction.emoji] = {
          count: 0,
          userIds: [] as string[],
          users: [] as Array<{ id: string; firstName: string; lastName: string }>,
        };
      }
      acc[reaction.emoji].count++;
      acc[reaction.emoji].userIds.push(reaction.user.id);
      acc[reaction.emoji].users.push({
        id: reaction.user.id,
        firstName: reaction.user.firstName || '',
        lastName: reaction.user.lastName || '',
      });
      return acc;
    }, {} as Record<string, { count: number; userIds: string[]; users: Array<{ id: string; firstName: string; lastName: string }> }>);

    // Возвращаем объект в том же формате, что и при загрузке сообщений
    return NextResponse.json({
      reactions: groupedReactions,
    });
  } catch (error: any) {
    console.error("[POST /api/chat/[chatId]/messages/[messageId]/reactions] Error:", error);
    return NextResponse.json(
      { error: error.message || "Ошибка добавления реакции" },
      { status: 500 }
    );
  }
}
