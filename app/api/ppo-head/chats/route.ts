import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getPPOHead } from "@/lib/ppo-head-utils";

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

    // Получаем все чаты, где Председатель является участником
    // Личные чаты
    const privateChats = await prisma.chat.findMany({
      where: {
        type: "PRIVATE",
        OR: [
          { participant1Id: chairman.id },
          { participant2Id: chairman.id },
        ],
      },
      include: {
        participant1: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            avatarUrl: true,
          },
        },
        participant2: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            avatarUrl: true,
          },
        },
        _count: {
          select: {
            messages: true,
          },
        },
      },
      orderBy: {
        lastMessageAt: "desc",
      },
    });

    // Групповые чаты, где Председатель является участником или создателем
    const groupChats = await prisma.chat.findMany({
      where: {
        type: "GROUP",
        OR: [
          { createdById: chairman.id },
          {
            participants: {
              some: {
                userId: chairman.id,
                leftAt: null,
              },
            },
          },
        ],
      },
      include: {
        createdBy: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
          },
        },
        participants: {
          where: {
            leftAt: null,
          },
          include: {
            user: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                avatarUrl: true,
              },
            },
          },
        },
        _count: {
          select: {
            participants: true,
            messages: true,
          },
        },
      },
      orderBy: {
        lastMessageAt: "desc",
      },
    });

    const allChats = [...privateChats, ...groupChats].map((chat) => ({
      id: chat.id,
      type: chat.type,
      name: chat.name,
      description: chat.description,
      iconUrl: chat.iconUrl,
      isPublic: chat.isPublic,
      lastMessage: chat.lastMessage,
      lastMessageAt: chat.lastMessageAt?.toISOString() || null,
      participant1: chat.type === "PRIVATE" ? (chat as typeof privateChats[0]).participant1 : null,
      participant2: chat.type === "PRIVATE" ? (chat as typeof privateChats[0]).participant2 : null,
      participants: chat.type === "GROUP" ? (chat as typeof groupChats[0]).participants.map((p) => ({
        id: p.id,
        user: p.user,
        role: p.role,
      })) : [],
      _count: {
        participants: chat.type === "GROUP" ? (chat as typeof groupChats[0])._count.participants : 2,
        messages: chat._count.messages,
      },
    }));

    return NextResponse.json({ chats: allChats });
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

