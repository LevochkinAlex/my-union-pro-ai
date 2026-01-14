import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getPPOHead, isMemberOfOrganization } from "@/lib/ppo-head-utils";
import { sendPushNotification } from "@/lib/push-notifications";

const MATRIX_SERVER = process.env.MATRIX_SERVER_URL || 'http://localhost:8008';
const MATRIX_ADMIN_TOKEN = process.env.MATRIX_ADMIN_TOKEN;

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

    if (!participantIds || !Array.isArray(participantIds)) {
      return NextResponse.json(
        { error: "Выберите хотя бы одного участника" },
        { status: 400 }
      );
    }

    // Фильтруем participantIds - убираем ID председателя (он добавится как админ) и дубликаты
    const filteredParticipantIds = [...new Set(participantIds)].filter(
      (id: string) => id !== chairman.id
    );

    // Группа должна иметь хотя бы одного участника помимо председателя
    if (filteredParticipantIds.length === 0) {
      return NextResponse.json(
        { error: "Выберите хотя бы одного участника помимо себя" },
        { status: 400 }
      );
    }

    // Проверяем, что все участники принадлежат организации Председателя
    const members = await prisma.user.findMany({
      where: {
        id: { in: filteredParticipantIds },
        organizationId: chairman.organizationId!,
      },
      select: { id: true },
    });

    if (members.length !== filteredParticipantIds.length) {
      return NextResponse.json(
        { error: "Некоторые участники не найдены или не принадлежат вашей организации" },
        { status: 400 }
      );
    }

    // Get all participants' Matrix IDs for room creation
    const allParticipantIds = [chairman.id, ...filteredParticipantIds];
    const usersWithMatrix = await prisma.user.findMany({
      where: { id: { in: allParticipantIds } },
      select: { id: true, matrixUserId: true, matrixAccessToken: true }
    });

    // Create Matrix room if we have admin token
    let matrixRoomId: string | null = null;
    if (MATRIX_ADMIN_TOKEN) {
      try {
        // Create room with admin
        const createRoomResp = await fetch(`${MATRIX_SERVER}/_matrix/client/v3/createRoom`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${MATRIX_ADMIN_TOKEN}`
          },
          body: JSON.stringify({
            name: name.trim(),
            topic: description?.trim() || undefined,
            preset: 'private_chat'
          })
        });

        if (createRoomResp.ok) {
          const roomData = await createRoomResp.json();
          matrixRoomId = roomData.room_id;

          // Join all users to the room
          for (const user of usersWithMatrix) {
            if (user.matrixUserId) {
              try {
                await fetch(`${MATRIX_SERVER}/_synapse/admin/v1/join/${encodeURIComponent(matrixRoomId)}`, {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${MATRIX_ADMIN_TOKEN}`
                  },
                  body: JSON.stringify({ user_id: user.matrixUserId })
                });
              } catch (joinErr) {
                console.error(`Failed to join user ${user.matrixUserId} to room:`, joinErr);
              }
            }
          }
        }
      } catch (matrixErr) {
        console.error('Failed to create Matrix room:', matrixErr);
      }
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
        matrixRoomId,
        participants: {
          create: [
            // Добавляем создателя как админа
            {
              userId: chairman.id,
              role: "admin",
              invitedById: null,
            },
            // Добавляем остальных участников (без создателя - он уже добавлен как админ)
            ...filteredParticipantIds.map((userId: string) => ({
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

    // Отправляем push-уведомления добавленным участникам
    const chairmanName = [chairman.lastName, chairman.firstName].filter(Boolean).join(" ") || "Председатель";
    
    // Создаем уведомления в БД и отправляем push для каждого участника (кроме создателя)
    await Promise.all(
      filteredParticipantIds.map(async (userId: string) => {
        try {
          // Создаем уведомление в БД
          await prisma.userNotification.create({
            data: {
              userId,
              type: "CHAT",
              title: `Вас добавили в группу "${name.trim()}"`,
              body: `${chairmanName} добавил вас в групповой чат`,
              url: `/dashboard/chat?chatId=${chat.id}`,
            },
          });

          // Отправляем push-уведомление
          await sendPushNotification(userId, {
            title: `Вас добавили в группу "${name.trim()}"`,
            body: `${chairmanName} добавил вас в групповой чат`,
            url: `/dashboard/chat?chatId=${chat.id}`,
          });
        } catch (notifyError) {
          console.error(`[ppo-head/chats/groups] Failed to notify user ${userId}:`, notifyError);
        }
      })
    );

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

