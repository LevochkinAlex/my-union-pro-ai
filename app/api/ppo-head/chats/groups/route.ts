import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getPPOHead, isMemberOfOrganization } from "@/lib/ppo-head-utils";

/**
 * POST /api/ppo-head/chats/groups
 * Создать групповой чат
 */
export async function POST(request: NextRequest) {
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

    const { name, description, iconUrl, isPublic, participantIds } = await request.json();

    if (!name || !name.trim()) {
      return NextResponse.json(
        { error: "Название группы обязательно" },
        { status: 400 }
      );
    }

    if (!participantIds || !Array.isArray(participantIds) || participantIds.length === 0) {
      return NextResponse.json(
        { error: "Выберите хотя бы одного участника" },
        { status: 400 }
      );
    }

    // Проверяем, что все участники принадлежат организации Председателя
    const members = await prisma.user.findMany({
      where: {
        id: { in: participantIds },
        organizationId: chairman.organizationId!,
      },
      select: { id: true },
    });

    if (members.length !== participantIds.length) {
      return NextResponse.json(
        { error: "Некоторые участники не найдены или не принадлежат вашей организации" },
        { status: 400 }
      );
    }

    // Создаем групповой чат
    const chat = await prisma.chat.create({
      data: {
        type: "GROUP",
        name: name.trim(),
        description: description?.trim() || null,
        iconUrl: iconUrl || null,
        isPublic: Boolean(isPublic),
        createdById: chairman.id,
        participants: {
          create: [
            // Добавляем создателя как админа
            {
              userId: chairman.id,
              role: "admin",
              invitedById: null,
            },
            // Добавляем остальных участников
            ...participantIds.map((userId: string) => ({
              userId,
              role: "member",
              invitedById: chairman.id,
            })),
          ],
        },
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
    });

    return NextResponse.json({ chat }, { status: 201 });
  } catch (error: any) {
    console.error("[ppo-head/chats/groups] POST error:", error);
    return NextResponse.json(
      {
        error: "Ошибка при создании группы",
        details: process.env.NODE_ENV === "development" ? error.message : undefined,
      },
      { status: 500 }
    );
  }
}

