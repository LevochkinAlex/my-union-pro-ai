import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getPPOHead, isMemberOfOrganization } from "@/lib/ppo-head-utils";

/**
 * POST /api/ppo-head/chats/[id]/invite
 * Пригласить участников в групповой чат
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } | Promise<{ id: string }> }
) {
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

    const resolvedParams = await Promise.resolve(params);
    const chatId = resolvedParams.id;
    const { participantIds } = await request.json();

    if (!participantIds || !Array.isArray(participantIds) || participantIds.length === 0) {
      return NextResponse.json(
        { error: "Выберите участников для приглашения" },
        { status: 400 }
      );
    }

    // Проверяем, что чат существует и является групповым
    const chat = await prisma.chat.findUnique({
      where: { id: chatId },
      include: {
        participants: {
          where: {
            leftAt: null,
          },
          select: {
            userId: true,
            role: true,
          },
        },
      },
    });

    if (!chat) {
      return NextResponse.json(
        { error: "Чат не найден" },
        { status: 404 }
      );
    }

    if (chat.type !== "GROUP") {
      return NextResponse.json(
        { error: "Можно приглашать только в групповые чаты" },
        { status: 400 }
      );
    }

    // Проверяем, что Председатель является создателем или админом группы
    const isAdmin = chat.createdById === chairman.id || 
      chat.participants.some(p => p.userId === chairman.id && p.role === "admin");

    if (!isAdmin) {
      return NextResponse.json(
        { error: "Только администратор группы может приглашать участников" },
        { status: 403 }
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

    // Фильтруем уже существующих участников
    const existingParticipantIds = chat.participants.map((p) => p.userId);
    const newParticipantIds = participantIds.filter(
      (id: string) => !existingParticipantIds.includes(id)
    );

    if (newParticipantIds.length === 0) {
      return NextResponse.json(
        { error: "Все выбранные пользователи уже являются участниками группы" },
        { status: 400 }
      );
    }

    // Добавляем новых участников
    await prisma.chatParticipant.createMany({
      data: newParticipantIds.map((userId: string) => ({
        chatId,
        userId,
        role: "member",
        invitedById: chairman.id,
      })),
    });

    return NextResponse.json({
      success: true,
      invitedCount: newParticipantIds.length,
    });
  } catch (error: any) {
    console.error("[ppo-head/chats] POST invite error:", error);
    return NextResponse.json(
      {
        error: "Ошибка при приглашении участников",
        details: process.env.NODE_ENV === "development" ? error.message : undefined,
      },
      { status: 500 }
    );
  }
}

