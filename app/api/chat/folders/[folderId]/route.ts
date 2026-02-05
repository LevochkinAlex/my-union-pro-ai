import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import * as Sentry from "@sentry/nextjs";

interface RouteParams {
  params: Promise<{
    folderId: string;
  }>;
}

/**
 * GET /api/chat/folders/[folderId] - Получить папку с чатами
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }

    const { folderId } = await params;
    const userId = session.user.id;

    const folder = await prisma.chatFolder.findFirst({
      where: {
        id: folderId,
        createdById: userId,
      },
      include: {
        chats: {
          include: {
            chat: {
              include: {
                participants: {
                  where: { leftAt: null },
                  include: {
                    user: {
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
                lastMessage: {
                  select: {
                    id: true,
                    content: true,
                    createdAt: true,
                    senderId: true,
                  },
                },
                _count: {
                  select: {
                    messages: true,
                    participants: true,
                  },
                },
              },
            },
          },
          orderBy: {
            order: "asc",
          },
        },
      },
    });

    if (!folder) {
      return NextResponse.json({ error: "Папка не найдена" }, { status: 404 });
    }

    // Подсчитываем непрочитанные для каждого чата
    const chatsWithUnread = await Promise.all(
      folder.chats.map(async (folderChat) => {
        const participant = await prisma.chatParticipant.findFirst({
          where: {
            chatId: folderChat.chatId,
            userId: userId,
            leftAt: null,
          },
          select: {
            readAt: true,
          },
        });

        let unreadCount = 0;
        if (participant) {
          unreadCount = await prisma.chatMessage.count({
            where: {
              chatId: folderChat.chatId,
              createdAt: participant.readAt
                ? { gt: participant.readAt }
                : undefined,
              senderId: { not: userId },
            },
          });
        }

        return {
          id: folderChat.chat.id,
          type: folderChat.chat.type,
          name: folderChat.chat.name,
          description: folderChat.chat.description,
          iconUrl: folderChat.chat.iconUrl,
          lastMessage: folderChat.chat.lastMessage,
          lastMessageAt: folderChat.chat.lastMessageAt,
          participantCount: folderChat.chat._count.participants,
          messageCount: folderChat.chat._count.messages,
          unreadCount,
          order: folderChat.order,
          participants: folderChat.chat.participants.map((p) => ({
            id: p.user.id,
            firstName: p.user.firstName,
            lastName: p.user.lastName,
            avatarUrl: p.user.avatarUrl,
            role: p.role,
          })),
        };
      })
    );

    return NextResponse.json({
      folder: {
        id: folder.id,
        name: folder.name,
        icon: folder.icon,
        color: folder.color,
        order: folder.order,
        chatCount: folder.chats.length,
        chats: chatsWithUnread,
        createdAt: folder.createdAt,
        updatedAt: folder.updatedAt,
      },
    });
  } catch (error) {
    console.error("[chat/folders/[folderId]] GET error:", error);
    Sentry.captureException(error);
    return NextResponse.json(
      { error: "Ошибка загрузки папки" },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/chat/folders/[folderId] - Обновить папку
 */
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }

    const { folderId } = await params;
    const userId = session.user.id;

    // Проверяем, что папка принадлежит пользователю
    const folder = await prisma.chatFolder.findFirst({
      where: {
        id: folderId,
        createdById: userId,
      },
    });

    if (!folder) {
      return NextResponse.json({ error: "Папка не найдена" }, { status: 404 });
    }

    const body = await request.json();
    const { name, icon, color, chatIds, order } = body;

    const updateData: {
      name?: string;
      icon?: string;
      color?: string | null;
      order?: number;
    } = {};

    if (name !== undefined) {
      if (typeof name !== "string" || name.trim().length === 0) {
        return NextResponse.json(
          { error: "Название папки не может быть пустым" },
          { status: 400 }
        );
      }
      updateData.name = name.trim();
    }

    if (icon !== undefined) {
      updateData.icon = icon;
    }

    if (color !== undefined) {
      updateData.color = color || null;
    }

    if (order !== undefined) {
      updateData.order = order;
    }

    // Обновляем основные данные папки
    if (Object.keys(updateData).length > 0) {
      await prisma.chatFolder.update({
        where: { id: folderId },
        data: updateData,
      });
    }

    // Если переданы chatIds, обновляем список чатов
    if (chatIds !== undefined) {
      if (!Array.isArray(chatIds)) {
        return NextResponse.json(
          { error: "chatIds должен быть массивом" },
          { status: 400 }
        );
      }

      if (chatIds.length < 2) {
        return NextResponse.json(
          { error: "В папке должно быть минимум 2 чата" },
          { status: 400 }
        );
      }

      // Проверяем, что пользователь является участником всех чатов
      const participantChats = await prisma.chatParticipant.findMany({
        where: {
          userId: userId,
          chatId: { in: chatIds },
          leftAt: null,
        },
        select: { chatId: true },
      });

      const participantChatIds = participantChats.map((p) => p.chatId);
      const invalidChatIds = chatIds.filter(
        (id: string) => !participantChatIds.includes(id)
      );

      if (invalidChatIds.length > 0) {
        return NextResponse.json(
          { error: "Вы не являетесь участником некоторых выбранных чатов" },
          { status: 400 }
        );
      }

      // Удаляем старые связи и создаём новые
      await prisma.$transaction([
        prisma.chatFolderChat.deleteMany({
          where: { folderId },
        }),
        prisma.chatFolderChat.createMany({
          data: chatIds.map((chatId: string, index: number) => ({
            folderId,
            chatId,
            order: index,
          })),
        }),
      ]);
    }

    // Возвращаем обновлённую папку
    const updatedFolder = await prisma.chatFolder.findUnique({
      where: { id: folderId },
      include: {
        chats: {
          include: {
            chat: {
              select: {
                id: true,
                type: true,
                name: true,
                iconUrl: true,
              },
            },
          },
          orderBy: { order: "asc" },
        },
      },
    });

    return NextResponse.json({
      success: true,
      folder: {
        id: updatedFolder!.id,
        name: updatedFolder!.name,
        icon: updatedFolder!.icon,
        color: updatedFolder!.color,
        order: updatedFolder!.order,
        chatCount: updatedFolder!.chats.length,
        chats: updatedFolder!.chats.map((fc) => ({
          id: fc.chat.id,
          type: fc.chat.type,
          name: fc.chat.name,
          iconUrl: fc.chat.iconUrl,
        })),
      },
    });
  } catch (error) {
    console.error("[chat/folders/[folderId]] PATCH error:", error);
    Sentry.captureException(error);
    return NextResponse.json(
      { error: "Ошибка обновления папки" },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/chat/folders/[folderId] - Удалить (разобрать) папку
 * Чаты не удаляются, только папка и связи
 */
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }

    const { folderId } = await params;
    const userId = session.user.id;

    // Проверяем, что папка принадлежит пользователю
    const folder = await prisma.chatFolder.findFirst({
      where: {
        id: folderId,
        createdById: userId,
      },
      include: {
        chats: {
          select: {
            chatId: true,
          },
        },
      },
    });

    if (!folder) {
      return NextResponse.json({ error: "Папка не найдена" }, { status: 404 });
    }

    // Сохраняем ID чатов для ответа
    const chatIds = folder.chats.map((fc) => fc.chatId);

    // Удаляем папку (связи удалятся каскадно)
    await prisma.chatFolder.delete({
      where: { id: folderId },
    });

    return NextResponse.json({
      success: true,
      message: "Папка разобрана",
      releasedChatIds: chatIds,
    });
  } catch (error) {
    console.error("[chat/folders/[folderId]] DELETE error:", error);
    Sentry.captureException(error);
    return NextResponse.json(
      { error: "Ошибка удаления папки" },
      { status: 500 }
    );
  }
}
