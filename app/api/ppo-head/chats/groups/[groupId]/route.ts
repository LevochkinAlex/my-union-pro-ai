import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { checkUserPermissions } from "@/lib/staff-permissions";

/**
 * PATCH /api/ppo-head/chats/groups/[groupId]
 * Обновить групповой чат
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: { groupId: string } | Promise<{ groupId: string }> }
) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }

    const perm = await checkUserPermissions(session.user.id, "chats_create");
    if (!perm.hasAccess || !perm.organizationId) {
      return NextResponse.json({ error: "Доступ запрещен" }, { status: 403 });
    }

    const resolvedParams = await Promise.resolve(params);
    const groupId = resolvedParams.groupId;

    // Проверяем что чат существует и пользователь является админом
    const chat = await prisma.chat.findUnique({
      where: { id: groupId, type: "GROUP" },
      include: {
        participants: {
          where: { leftAt: null },
          include: {
            user: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
              },
            },
          },
        },
      },
    });

    if (!chat) {
      return NextResponse.json({ error: "Группа не найдена" }, { status: 404 });
    }

    const currentParticipant = chat.participants.find(
      (p) => p.userId === session.user.id && p.role === "admin"
    );

    if (!currentParticipant) {
      return NextResponse.json(
        { error: "Только администратор может редактировать группу" },
        { status: 403 }
      );
    }

    const { name, description, iconUrl, participantIds, adminId } = await request.json();

    // Обновляем базовую информацию
    const updateData: any = {};
    if (name !== undefined) updateData.name = name.trim();
    if (description !== undefined) updateData.description = description?.trim() || null;
    if (iconUrl !== undefined) updateData.iconUrl = iconUrl || null;

    await prisma.chat.update({
      where: { id: groupId },
      data: updateData,
    });

    // Обновляем участников если нужно
    if (participantIds && Array.isArray(participantIds)) {
      const currentParticipantIds = chat.participants.map((p) => p.userId);
      const newParticipantIds = [...new Set(participantIds)];

      // Добавляем новых участников
      const toAdd = newParticipantIds.filter((id) => !currentParticipantIds.includes(id));
      for (const userId of toAdd) {
        await prisma.chatParticipant.create({
          data: {
            chatId: groupId,
            userId,
            role: "member",
            invitedById: session.user.id,
          },
        });
      }

      // Удаляем участников (кроме админа)
      const toRemove = currentParticipantIds.filter(
        (id) => !newParticipantIds.includes(id) && id !== adminId
      );
      for (const userId of toRemove) {
        await prisma.chatParticipant.updateMany({
          where: {
            chatId: groupId,
            userId,
            role: { not: "admin" }, // Не удаляем админа
          },
          data: {
            leftAt: new Date(),
          },
        });
      }
    }

    // Меняем админа если нужно
    if (adminId && adminId !== currentParticipant.userId) {
      const newAdmin = chat.participants.find((p) => p.userId === adminId);
      if (newAdmin) {
        // Старый админ становится участником
        await prisma.chatParticipant.updateMany({
          where: {
            chatId: groupId,
            userId: currentParticipant.userId,
            role: "admin",
          },
          data: {
            role: "member",
          },
        });

        // Новый админ
        await prisma.chatParticipant.updateMany({
          where: {
            chatId: groupId,
            userId: adminId,
          },
          data: {
            role: "admin",
          },
        });
      }
    }

    // Возвращаем обновленный чат
    const updatedChat = await prisma.chat.findUnique({
      where: { id: groupId },
      include: {
        participants: {
          where: { leftAt: null },
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

    return NextResponse.json({ chat: updatedChat });
  } catch (error: any) {
    console.error("[groups] PATCH Error:", error);
    return NextResponse.json(
      { error: error.message || "Ошибка обновления группы" },
      { status: 500 }
    );
  }
}
