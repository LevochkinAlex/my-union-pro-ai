/**
 * Matrix Integration Client
 * Handles user registration and chat management with Matrix/Synapse server
 */

const MATRIX_SERVER_URL = process.env.MATRIX_SERVER_URL || 'https://matrix.myunion.pro';
const MATRIX_ADMIN_TOKEN = process.env.MATRIX_ADMIN_TOKEN;

interface MatrixUser {
  userId: string;
  accessToken: string;
  deviceId: string;
}

interface MatrixRoom {
  roomId: string;
  name: string;
}

/**
 * Register a new Matrix user (called when user registers in MyUnion)
 */
export async function registerMatrixUser(
  username: string, 
  password: string,
  displayName?: string
): Promise<MatrixUser | null> {
  try {
    // First, check if registration is open
    const response = await fetch(`${MATRIX_SERVER_URL}/_matrix/client/v3/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username,
        password,
        initial_device_display_name: 'MyUnion Web',
        auth: { type: 'm.login.dummy' }
      })
    });

    if (response.ok) {
      const data = await response.json();
      
      // Set display name
      if (displayName && data.access_token) {
        await setMatrixDisplayName(data.user_id, data.access_token, displayName);
      }
      
      return {
        userId: data.user_id,
        accessToken: data.access_token,
        deviceId: data.device_id
      };
    }

    // Handle 401 with flows (need to complete registration flow)
    if (response.status === 401) {
      const flowData = await response.json();
      
      // Complete dummy auth flow
      const regResponse = await fetch(`${MATRIX_SERVER_URL}/_matrix/client/v3/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username,
          password,
          initial_device_display_name: 'MyUnion Web',
          auth: {
            type: 'm.login.dummy',
            session: flowData.session
          }
        })
      });

      if (regResponse.ok) {
        const data = await regResponse.json();
        
        if (displayName && data.access_token) {
          await setMatrixDisplayName(data.user_id, data.access_token, displayName);
        }
        
        return {
          userId: data.user_id,
          accessToken: data.access_token,
          deviceId: data.device_id
        };
      }
    }

    console.error('Matrix registration failed:', await response.text());
    return null;
  } catch (error) {
    console.error('Matrix registration error:', error);
    return null;
  }
}

/**
 * Login existing Matrix user
 */
export async function loginMatrixUser(
  username: string,
  password: string
): Promise<MatrixUser | null> {
  try {
    const response = await fetch(`${MATRIX_SERVER_URL}/_matrix/client/v3/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'm.login.password',
        identifier: {
          type: 'm.id.user',
          user: username
        },
        password,
        initial_device_display_name: 'MyUnion Web'
      })
    });

    if (response.ok) {
      const data = await response.json();
      return {
        userId: data.user_id,
        accessToken: data.access_token,
        deviceId: data.device_id
      };
    }

    return null;
  } catch (error) {
    console.error('Matrix login error:', error);
    return null;
  }
}

/**
 * Set Matrix user display name
 */
async function setMatrixDisplayName(
  userId: string,
  accessToken: string,
  displayName: string
): Promise<void> {
  try {
    await fetch(`${MATRIX_SERVER_URL}/_matrix/client/v3/profile/${encodeURIComponent(userId)}/displayname`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${accessToken}`
      },
      body: JSON.stringify({ displayname: displayName })
    });
  } catch (error) {
    console.error('Failed to set display name:', error);
  }
}

/**
 * Create a direct message room between two users
 */
export async function createDirectRoom(
  accessToken: string,
  otherUserId: string
): Promise<string | null> {
  try {
    const response = await fetch(`${MATRIX_SERVER_URL}/_matrix/client/v3/createRoom`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${accessToken}`
      },
      body: JSON.stringify({
        preset: 'trusted_private_chat',
        is_direct: true,
        invite: [otherUserId]
      })
    });

    if (response.ok) {
      const data = await response.json();
      return data.room_id;
    }

    return null;
  } catch (error) {
    console.error('Failed to create room:', error);
    return null;
  }
}

/**
 * Create a group room (for organization chats)
 */
export async function createGroupRoom(
  accessToken: string,
  name: string,
  userIds: string[]
): Promise<MatrixRoom | null> {
  try {
    const response = await fetch(`${MATRIX_SERVER_URL}/_matrix/client/v3/createRoom`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${accessToken}`
      },
      body: JSON.stringify({
        preset: 'private_chat',
        name,
        invite: userIds
      })
    });

    if (response.ok) {
      const data = await response.json();
      return {
        roomId: data.room_id,
        name
      };
    }

    return null;
  } catch (error) {
    console.error('Failed to create group room:', error);
    return null;
  }
}

/**
 * Send a message to a room
 */
export async function sendMessage(
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
          'Authorization': `Bearer ${accessToken}`
        },
        body: JSON.stringify({
          msgtype: 'm.text',
          body: message
        })
      }
    );

    if (response.ok) {
      const data = await response.json();
      return data.event_id;
    }

    return null;
  } catch (error) {
    console.error('Failed to send message:', error);
    return null;
  }
}

/**
 * Get joined rooms for user
 */
export async function getJoinedRooms(accessToken: string): Promise<string[]> {
  try {
    const response = await fetch(`${MATRIX_SERVER_URL}/_matrix/client/v3/joined_rooms`, {
      headers: { 'Authorization': `Bearer ${accessToken}` }
    });

    if (response.ok) {
      const data = await response.json();
      return data.joined_rooms || [];
    }

    return [];
  } catch (error) {
    console.error('Failed to get rooms:', error);
    return [];
  }
}

/**
 * Sync - get updates (messages, room changes, etc)
 */
export async function sync(
  accessToken: string,
  since?: string,
  timeout: number = 30000
): Promise<{ nextBatch: string; rooms: Record<string, unknown> } | null> {
  try {
    const params = new URLSearchParams({
      timeout: timeout.toString()
    });
    if (since) params.set('since', since);

    const response = await fetch(
      `${MATRIX_SERVER_URL}/_matrix/client/v3/sync?${params}`,
      {
        headers: { 'Authorization': `Bearer ${accessToken}` }
      }
    );

    if (response.ok) {
      const data = await response.json();
      return {
        nextBatch: data.next_batch,
        rooms: data.rooms || {}
      };
    }

    return null;
  } catch (error) {
    console.error('Sync error:', error);
    return null;
  }
}

/**
 * Generate Matrix username from MyUnion user ID
 */
export function generateMatrixUsername(userId: string): string {
  // Remove special chars and use lowercase
  return `myunion_${userId.toLowerCase().replace(/[^a-z0-9]/g, '')}`;
}

/**
 * Generate Matrix user ID from username
 */
export function getMatrixUserId(username: string): string {
  return `@${username}:matrix.myunion.pro`;
}
