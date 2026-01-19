import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getPPOHead } from "@/lib/ppo-head-utils";
import { getUserChats, ChatFilter, formatChatInfo } from "@/lib/chat-service";
import { prisma } from "@/lib/prisma";

/**
 * GET /api/ppo-head/chats
 * Получить список чатов для Председателя
 */
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }

    // Проверяем, что пользователь является Председателем
    const chairman = await getPPOHead(session.user.id);

    if (!chairman) {
      return NextResponse.json(
        { error: "Доступ запрещен или организация не назначена" },
        { status: 403 }
      );
    }

    // Получаем параметры фильтрации
    const { searchParams } = new URL(request.url);
    const typeParam = searchParams.get("type");
    const hasTicketParam = searchParams.get("hasTicket");

    // Строим фильтр
    const filter: ChatFilter = {};
    
    if (typeParam === "PRIVATE" || typeParam === "GROUP") {
      filter.type = typeParam;
    }

    if (hasTicketParam === "true") {
      filter.hasTicket = true;
    } else if (hasTicketParam === "false") {
      filter.hasTicket = false;
    }

    // Для председателя: если фильтр по обращениям, нужно включить ВСЕ обращения его организации
    // а не только те, где он участник
    let chats;
    
    if (filter?.hasTicket === true && chairman.organizationId) {
      // Получаем все обращения организации председателя
      const organizationTickets = await prisma.ticket.findMany({
        where: {
          organizationId: chairman.organizationId,
          matrixRoomId: { not: null },
        },
        select: { matrixRoomId: true },
      });
      
      const ticketMatrixRoomIds = organizationTickets
        .map(t => t.matrixRoomId)
        .filter((id): id is string => typeof id === 'string' && id.length > 0);
      
      if (ticketMatrixRoomIds.length > 0) {
        // Получаем чаты по matrixRoomId обращений организации
        const appealChats = await prisma.chat.findMany({
          where: {
            matrixRoomId: { in: ticketMatrixRoomIds },
          },
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
                    phone: true,
                  },
                },
              },
            },
            _count: {
              select: {
                participants: true,
              },
            },
          },
          orderBy: {
            lastMessageAt: "desc",
          },
        });
        
        // Форматируем как ChatInfo (без проверки непрочитанных для упрощения)
        chats = appealChats.map((chat) => {
          return formatChatInfo(chat, chairman.id, 0);
        });
      } else {
        chats = [];
      }
    } else {
      // Для обычных чатов используем стандартный метод
      chats = await getUserChats(chairman.id, filter);
    }

    // Форматируем для совместимости с фронтендом
    const formattedChats = chats.map((chat) => ({
      id: chat.id,
      type: chat.type,
      name: chat.displayName,
      description: chat.description || chat.ticketTitle,
      iconUrl: chat.displayAvatar,
      isPublic: chat.isPublic,
      // lastMessage: chat.lastMessage, // Поле удалено, сообщения в Matrix
      lastMessageAt: chat.lastMessageAt?.toISOString() || null,
      unreadCount: chat.unreadCount,
      createdAt: chat.createdAt,
      ticketId: chat.ticketId,
      ticketPublicId: chat.ticketPublicId,
      ticketTitle: chat.ticketTitle,
      otherUser: chat.otherUser,
      participants: chat.participants.map((p) => ({
        id: p.id,
        userId: p.userId,
        user: p.user,
        role: p.role,
      })),
      participantsCount: chat.participantsCount,
      _count: {
        participants: chat.participantsCount,
      },
    }));

    return NextResponse.json({ chats: formattedChats });
  } catch (error: any) {
    console.error("[ppo-head/chats] GET error:", error);
    return NextResponse.json(
      {
        error: "Ошибка при получении чатов",
        details: process.env.NODE_ENV === "development" ? error.message : undefined,
      },
      { status: 500 }
    );
  }
}
