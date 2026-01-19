/**
 * Matrix Threads API
 * Система тредов для обращений, как в Slack
 */

const MATRIX_SERVER_URL = process.env.MATRIX_SERVER_URL || 'https://matrix.myunion.pro';
const MATRIX_ADMIN_TOKEN = process.env.MATRIX_ADMIN_TOKEN;

export interface ThreadInfo {
  threadId: string; // event_id корневого сообщения
  roomId: string; // ID Matrix комнаты
  title: string;
  createdAt: number;
  creatorId: string;
}

/**
 * Создать тред для обращения
 * Создает комнату Matrix, отправляет первое сообщение-тред
 */
export async function createAppealThread(
  appealTitle: string,
  appealContent: string,
  creatorId: string, // MyUnion user ID создателя обращения
  chairmanId: string // MyUnion user ID председателя
): Promise<ThreadInfo | null> {
  try {
    // Получаем Matrix user IDs
    const [creatorUser, chairmanUser] = await Promise.all([
      prisma.user.findUnique({
        where: { id: creatorId },
        select: { matrixUserId: true, matrixAccessToken: true },
      }),
      prisma.user.findUnique({
        where: { id: chairmanId },
        select: { matrixUserId: true },
      }),
    ]);

    if (!creatorUser?.matrixUserId || !chairmanUser?.matrixUserId) {
      console.error('[matrix-threads] Missing Matrix users');
      return null;
    }

    const creatorMatrixId = creatorUser.matrixUserId;
    const chairmanMatrixId = chairmanUser.matrixUserId;
    const accessToken = creatorUser.matrixAccessToken;

    if (!accessToken) {
      console.error('[matrix-threads] Creator has no Matrix access token');
      return null;
    }

    // Создаем Matrix комнату для треда
    const roomResponse = await fetch(
      `${MATRIX_SERVER_URL}/_matrix/client/v3/createRoom`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          preset: 'private_chat',
          name: `Обращение: ${appealTitle}`,
          invite: [chairmanMatrixId],
          power_level_content_override: {
            users: {
              [creatorMatrixId]: 50, // Обычный участник
              [chairmanMatrixId]: 100, // Администратор
            },
            events: {
              'm.room.power_levels': 100,
              'm.room.name': 100,
              'm.room.avatar': 100,
              'm.room.history_visibility': 100,
            },
          },
        }),
      }
    );

    if (!roomResponse.ok) {
      console.error('[matrix-threads] Failed to create room:', await roomResponse.text());
      return null;
    }

    const roomData = await roomResponse.json();
    const roomId = roomData.room_id;

    // Отправляем первое сообщение-тред с содержимым обращения
    const threadMessage = `📋 **Обращение**: ${appealTitle}\n\n${appealContent}`;
    
    const messageResponse = await sendThreadRootMessage(
      accessToken,
      roomId,
      threadMessage
    );

    if (!messageResponse) {
      console.error('[matrix-threads] Failed to send thread root message');
      return null;
    }

    // Делаем председателя администратором комнаты
    await makeRoomAdmin(roomId, chairmanMatrixId);

    return {
      threadId: messageResponse,
      roomId,
      title: appealTitle,
      createdAt: Date.now(),
      creatorId: creatorMatrixId,
    };
  } catch (error) {
    console.error('[matrix-threads] Error creating thread:', error);
    return null;
  }
}

/**
 * Отправить корневое сообщение треда
 */
async function sendThreadRootMessage(
  accessToken: string,
  roomId: string,
  message: string
): Promise<string | null> {
  try {
    const txnId = `m${Date.now()}`;
    const response = await fetch(
      `${MATRIX_SERVER_URL}/_matrix/client/v3/rooms/${encodeURIComponent(roomId)}/send/m.room.message/${txnId}`,
      {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          msgtype: 'm.text',
          body: message,
          format: 'org.matrix.custom.html',
          formatted_body: message.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>').replace(/\n/g, '<br>'),
        }),
      }
    );

    if (response.ok) {
      const data = await response.json();
      return data.event_id;
    }

    return null;
  } catch (error) {
    console.error('[matrix-threads] Error sending thread root:', error);
    return null;
  }
}

/**
 * Ответить в треде (reply в Matrix)
 */
export async function replyToThread(
  accessToken: string,
  roomId: string,
  threadRootEventId: string,
  replyMessage: string
): Promise<string | null> {
  try {
    const txnId = `m${Date.now()}`;
    const response = await fetch(
      `${MATRIX_SERVER_URL}/_matrix/client/v3/rooms/${encodeURIComponent(roomId)}/send/m.room.message/${txnId}`,
      {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          msgtype: 'm.text',
          body: replyMessage,
          'm.relates_to': {
            rel_type: 'm.thread',
            event_id: threadRootEventId,
          },
        }),
      }
    );

    if (response.ok) {
      const data = await response.json();
      return data.event_id;
    }

    return null;
  } catch (error) {
    console.error('[matrix-threads] Error replying to thread:', error);
    return null;
  }
}

/**
 * Получить все ответы в треде
 */
export async function getThreadReplies(
  accessToken: string,
  roomId: string,
  threadRootEventId: string
): Promise<Array<{
  eventId: string;
  sender: string;
  content: string;
  timestamp: number;
}>> {
  try {
    // Используем relations API для получения всех ответов в треде
    const response = await fetch(
      `${MATRIX_SERVER_URL}/_matrix/client/v1/rooms/${encodeURIComponent(roomId)}/relations/${encodeURIComponent(threadRootEventId)}?limit=100`,
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
        },
      }
    );

    if (!response.ok) {
      return [];
    }

    const data = await response.json();
    const events = data.chunk || [];

    return events
      .filter((e: any) => e.type === 'm.room.message')
      .map((e: any) => ({
        eventId: e.event_id,
        sender: e.sender,
        content: e.content?.body || '',
        timestamp: e.origin_server_ts || Date.now(),
      }));
  } catch (error) {
    console.error('[matrix-threads] Error getting thread replies:', error);
    return [];
  }
}

/**
 * Сделать пользователя администратором комнаты
 */
async function makeRoomAdmin(roomId: string, userId: string): Promise<boolean> {
  try {
    if (!MATRIX_ADMIN_TOKEN) {
      console.error('[matrix-threads] MATRIX_ADMIN_TOKEN not set');
      return false;
    }

    // Получаем текущие power levels
    const powerLevelsResponse = await fetch(
      `${MATRIX_SERVER_URL}/_matrix/client/v3/rooms/${encodeURIComponent(roomId)}/state/m.room.power_levels`,
      {
        headers: {
          'Authorization': `Bearer ${MATRIX_ADMIN_TOKEN}`,
        },
      }
    );

    if (!powerLevelsResponse.ok) {
      console.error('[matrix-threads] Failed to get power levels');
      return false;
    }

    const powerLevels = await powerLevelsResponse.json();
    
    // Устанавливаем пользователя как админа (power level 100)
    const updatedPowerLevels = {
      ...powerLevels,
      users: {
        ...(powerLevels.users || {}),
        [userId]: 100,
      },
    };

    const updateResponse = await fetch(
      `${MATRIX_SERVER_URL}/_matrix/client/v3/rooms/${encodeURIComponent(roomId)}/state/m.room.power_levels`,
      {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${MATRIX_ADMIN_TOKEN}`,
        },
        body: JSON.stringify(updatedPowerLevels),
      }
    );

    return updateResponse.ok;
  } catch (error) {
    console.error('[matrix-threads] Error making room admin:', error);
    return false;
  }
}

/**
 * Добавить участника в тред (для председателя, чтобы добавить сотрудников)
 */
export async function addParticipantToThread(
  threadRoomId: string,
  participantUserId: string, // MyUnion user ID
  inviterAccessToken: string
): Promise<boolean> {
  const { prisma } = await import('@/lib/prisma');
  
  try {
    const participant = await prisma.user.findUnique({
      where: { id: participantUserId },
      select: { matrixUserId: true },
    });

    if (!participant?.matrixUserId) {
      return false;
    }

    const response = await fetch(
      `${MATRIX_SERVER_URL}/_matrix/client/v3/rooms/${encodeURIComponent(threadRoomId)}/invite`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${inviterAccessToken}`,
        },
        body: JSON.stringify({
          user_id: participant.matrixUserId,
        }),
      }
    );

    return response.ok;
  } catch (error) {
    console.error('[matrix-threads] Error adding participant:', error);
    return false;
  }
}

import { prisma } from '@/lib/prisma';
