/**
 * Matrix Messages API
 * Утилиты для работы с сообщениями через Matrix API
 */

const MATRIX_SERVER_URL = process.env.MATRIX_SERVER_URL || 'https://matrix.myunion.pro';

export interface MatrixMessage {
  eventId: string;
  sender: string;
  senderName: string;
  content: string;
  timestamp: number;
  msgtype: 'm.text' | 'm.image' | 'm.file' | 'm.video' | 'm.audio';
}

/**
 * Получить историю сообщений из Matrix комнаты
 */
export async function getMatrixMessages(
  accessToken: string,
  roomId: string,
  limit: number = 50,
  from?: string
): Promise<MatrixMessage[]> {
  try {
    const params = new URLSearchParams({
      limit: limit.toString(),
      dir: 'b', // backward (новые сообщения в конце)
    });
    
    if (from) {
      params.set('from', from);
    }

    const response = await fetch(
      `${MATRIX_SERVER_URL}/_matrix/client/v3/rooms/${encodeURIComponent(roomId)}/messages?${params}`,
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
        },
      }
    );

    if (!response.ok) {
      console.error(`Failed to get messages: ${response.status}`);
      return [];
    }

    const data = await response.json();
    const events = data.chunk || [];

    const messages: MatrixMessage[] = [];
    
    for (const event of events) {
      if (event.type === 'm.room.message' && event.content?.msgtype === 'm.text') {
        messages.push({
          eventId: event.event_id,
          sender: event.sender,
          senderName: event.content?.body || '', // Имя будем получать отдельно
          content: event.content?.body || '',
          timestamp: event.origin_server_ts || Date.now(),
          msgtype: event.content?.msgtype || 'm.text',
        });
      }
    }

    return messages;
  } catch (error) {
    console.error('Error getting Matrix messages:', error);
    return [];
  }
}

/**
 * Отправить сообщение в Matrix комнату
 */
export async function sendMatrixMessage(
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
        }),
      }
    );

    if (response.ok) {
      const data = await response.json();
      return data.event_id;
    }

    console.error(`Failed to send message: ${response.status}`, await response.text());
    return null;
  } catch (error) {
    console.error('Error sending Matrix message:', error);
    return null;
  }
}

/**
 * Получить информацию о пользователе Matrix (displayname)
 */
export async function getMatrixUserDisplayName(
  accessToken: string,
  userId: string
): Promise<string | null> {
  try {
    const response = await fetch(
      `${MATRIX_SERVER_URL}/_matrix/client/v3/profile/${encodeURIComponent(userId)}/displayname`,
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
        },
      }
    );

    if (response.ok) {
      const data = await response.json();
      return data.displayname || null;
    }

    return null;
  } catch (error) {
    console.error('Error getting Matrix display name:', error);
    return null;
  }
}
