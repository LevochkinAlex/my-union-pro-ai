import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import * as Sentry from "@sentry/nextjs";

/**
 * Проверяет, является ли пользователь председателем или сотрудником
 */
async function canManageFolders(userId: string): Promise<boolean> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      isPPOHead: true,
      isMPOHead: true,
      isRPOHead: true,
      role: true,
    },
  });

  if (!user) return false;

  // Председатели
  if (user.isPPOHead || user.isMPOHead || user.isRPOHead) return true;

  // Системные роли (ADMIN, SUPER_ADMIN, SYSTEM)
  if (["ADMIN", "SUPER_ADMIN", "SYSTEM"].includes(user.role)) return true;

  // Проверяем наличие активных позиций сотрудника отдельным запросом
  const staffCount = await prisma.organizationStaff.count({
    where: {
      userId,
      status: "ACTIVE",
    },
  });
  
  if (staffCount > 0) return true;

  return false;
}

/**
 * GET /api/chat/folders - Получить список папок пользователя
 */
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }

    const userId = session.user.id;

    // Получаем папки пользователя
    const folders = await prisma.chatFolder.findMany({
      where: {
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
      orderBy: {
        order: "asc",
      },
    });

    // Подсчитываем непрочитанные для каждой папки
    const foldersWithUnread = await Promise.all(
      folders.map(async (folder) => {
        let totalUnread = 0;

        for (const folderChat of folder.chats) {
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

          if (participant) {
          const unreadCount = await prisma.chatMessage.count({
            where: {
              chatId: folderChat.chatId,
              createdAt: participant.readAt
                ? { gt: participant.readAt }
                : undefined,
              senderId: { not: userId },
            },
          });
            totalUnread += unreadCount;
          }
        }

        return {
          id: folder.id,
          name: folder.name,
          icon: folder.icon,
          color: folder.color,
          order: folder.order,
          chatCount: folder.chats.length,
          unreadCount: totalUnread,
          chats: folder.chats.map((fc) => ({
          id: fc.chat.id,
          type: fc.chat.type,
          name: fc.chat.name,
          description: fc.chat.description,
          iconUrl: fc.chat.iconUrl,
          lastMessage: fc.chat.lastMessage,
          lastMessageAt: fc.chat.lastMessageAt,
          participantCount: fc.chat._count.participants,
          order: fc.order,
        })),
          createdAt: folder.createdAt,
          updatedAt: folder.updatedAt,
        };
      })
    );

    return NextResponse.json({ folders: foldersWithUnread });
  } catch (error) {
    console.error("[chat/folders] GET error:", error);
    Sentry.captureException(error);
    return NextResponse.json(
      { error: "Ошибка загрузки папок" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/chat/folders - Создать новую папку
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }

    const userId = session.user.id;

    // Проверяем права
    const hasAccess = await canManageFolders(userId);
    if (!hasAccess) {
      return NextResponse.json(
        { error: "Недостаточно прав для создания папок" },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { name, chatIds, icon, color } = body;

    if (!name || typeof name !== "string" || name.trim().length === 0) {
      return NextResponse.json(
        { error: "Укажите название папки" },
        { status: 400 }
      );
    }

    if (!chatIds || !Array.isArray(chatIds) || chatIds.length < 2) {
      return NextResponse.json(
        { error: "Выберите минимум 2 чата для создания папки" },
        { status: 400 }
      );
    }

    // Проверяем, что пользователь является участником всех выбранных чатов
    const participantChats = await prisma.chatParticipant.findMany({
      where: {
        userId: userId,
        chatId: { in: chatIds },
        leftAt: null,
      },
      select: {
        chatId: true,
      },
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

    // Получаем максимальный порядок
    const maxOrderFolder = await prisma.chatFolder.findFirst({
      where: { createdById: userId },
      orderBy: { order: "desc" },
      select: { order: true },
    });
    const nextOrder = (maxOrderFolder?.order ?? -1) + 1;

    // Создаём папку с чатами
    const folder = await prisma.chatFolder.create({
      data: {
        name: name.trim(),
        icon: icon || "📁",
        color: color || null,
        order: nextOrder,
        createdById: userId,
        chats: {
          create: chatIds.map((chatId: string, index: number) => ({
            chatId,
            order: index,
          })),
        },
      },
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
        },
      },
    });

    return NextResponse.json({
      success: true,
      folder: {
        id: folder.id,
        name: folder.name,
        icon: folder.icon,
        color: folder.color,
        order: folder.order,
        chatCount: folder.chats.length,
        chats: folder.chats.map((fc) => ({
          id: fc.chat.id,
          type: fc.chat.type,
          name: fc.chat.name,
          iconUrl: fc.chat.iconUrl,
        })),
      },
    });
  } catch (error) {
    console.error("[chat/folders] POST error:", error);
    Sentry.captureException(error);
    return NextResponse.json(
      { error: "Ошибка создания папки" },
      { status: 500 }
    );
  }
}
