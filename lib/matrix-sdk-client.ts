/**
 * Matrix SDK Client Wrapper
 * Uses matrix-js-sdk for robust Matrix protocol support
 */

import * as sdk from 'matrix-js-sdk';

const MATRIX_SERVER_URL = process.env.NEXT_PUBLIC_MATRIX_URL || 'https://matrix.myunion.pro';

export interface MatrixCredentials {
  userId: string;
  accessToken: string;
  deviceId: string;
  homeserverUrl: string;
}

export interface MatrixRoomInfo {
  roomId: string;
  name: string;
  avatarUrl?: string;
  topic?: string;
  lastMessage?: string;
  lastMessageTime?: Date;
  unreadCount: number;
  isDirect: boolean;
  members: string[];
}

export interface MatrixMessageInfo {
  eventId: string;
  roomId: string;
  sender: string;
  senderName: string;
  senderAvatar?: string;
  content: string;
  timestamp: Date;
  type: 'text' | 'image' | 'file' | 'notice';
  isOwn: boolean;
  replyTo?: string;
}

let matrixClient: sdk.MatrixClient | null = null;

/**
 * Initialize Matrix client with credentials
 */
export function initMatrixClient(credentials: MatrixCredentials): sdk.MatrixClient {
  if (matrixClient) {
    matrixClient.stopClient();
  }

  matrixClient = sdk.createClient({
    baseUrl: credentials.homeserverUrl || MATRIX_SERVER_URL,
    accessToken: credentials.accessToken,
    userId: credentials.userId,
    deviceId: credentials.deviceId,
    timelineSupport: true,
    useAuthorizationHeader: true,
  });

  return matrixClient;
}

/**
 * Get current Matrix client
 */
export function getMatrixClient(): sdk.MatrixClient | null {
  return matrixClient;
}

/**
 * Start Matrix client sync
 */
export async function startMatrixSync(
  onSync?: (state: string) => void,
  onRoomTimeline?: (event: sdk.MatrixEvent, room: sdk.Room | undefined) => void
): Promise<void> {
  if (!matrixClient) {
    throw new Error('Matrix client not initialized');
  }

  // Set up event handlers
  if (onSync) {
    matrixClient.on(sdk.ClientEvent.Sync, (state) => {
      onSync(state);
    });
  }

  if (onRoomTimeline) {
    matrixClient.on(sdk.RoomEvent.Timeline, (event, room) => {
      onRoomTimeline(event, room);
    });
  }

  // Start syncing
  await matrixClient.startClient({ initialSyncLimit: 20 });
}

/**
 * Stop Matrix client
 */
export function stopMatrixClient(): void {
  if (matrixClient) {
    matrixClient.stopClient();
    matrixClient = null;
  }
}

/**
 * Get all joined rooms
 */
export function getJoinedRooms(): MatrixRoomInfo[] {
  if (!matrixClient) return [];

  const rooms = matrixClient.getRooms();
  
  return rooms
    .filter(room => room.getMyMembership() === 'join')
    .map(room => {
      const lastEvent = room.timeline[room.timeline.length - 1];
      const dmUserId = room.getDMInviter();
      
      return {
        roomId: room.roomId,
        name: room.name || 'Unnamed Room',
        avatarUrl: room.getAvatarUrl(MATRIX_SERVER_URL, 48, 48, 'crop') || undefined,
        topic: room.currentState.getStateEvents('m.room.topic', '')?.getContent()?.topic,
        lastMessage: lastEvent?.getContent()?.body,
        lastMessageTime: lastEvent ? new Date(lastEvent.getTs()) : undefined,
        unreadCount: room.getUnreadNotificationCount('total') || 0,
        isDirect: !!dmUserId,
        members: room.getJoinedMembers().map(m => m.userId),
      };
    })
    .sort((a, b) => {
      const timeA = a.lastMessageTime?.getTime() || 0;
      const timeB = b.lastMessageTime?.getTime() || 0;
      return timeB - timeA;
    });
}

/**
 * Get room messages
 */
export function getRoomMessages(roomId: string, limit: number = 50): MatrixMessageInfo[] {
  if (!matrixClient) return [];

  const room = matrixClient.getRoom(roomId);
  if (!room) return [];

  const userId = matrixClient.getUserId();
  
  return room.timeline
    .filter(event => event.getType() === 'm.room.message')
    .slice(-limit)
    .map(event => {
      const sender = room.getMember(event.getSender()!);
      const content = event.getContent();
      
      return {
        eventId: event.getId()!,
        roomId: room.roomId,
        sender: event.getSender()!,
        senderName: sender?.name || event.getSender()!.split(':')[0].replace('@', ''),
        senderAvatar: sender?.getAvatarUrl(MATRIX_SERVER_URL, 40, 40, 'crop') || undefined,
        content: content.body || '',
        timestamp: new Date(event.getTs()),
        type: getMessageType(content.msgtype),
        isOwn: event.getSender() === userId,
        replyTo: content['m.relates_to']?.['m.in_reply_to']?.event_id,
      };
    });
}

function getMessageType(msgtype?: string): 'text' | 'image' | 'file' | 'notice' {
  switch (msgtype) {
    case 'm.image': return 'image';
    case 'm.file': return 'file';
    case 'm.notice': return 'notice';
    default: return 'text';
  }
}

/**
 * Send a text message
 */
export async function sendTextMessage(roomId: string, message: string): Promise<string | null> {
  if (!matrixClient) return null;

  try {
    const result = await matrixClient.sendTextMessage(roomId, message);
    return result.event_id;
  } catch (error) {
    console.error('Failed to send message:', error);
    return null;
  }
}

/**
 * Create a direct message room with another user
 */
export async function createDirectRoom(userId: string): Promise<string | null> {
  if (!matrixClient) return null;

  try {
    const result = await matrixClient.createRoom({
      preset: sdk.Preset.TrustedPrivateChat,
      is_direct: true,
      invite: [userId],
    });
    return result.room_id;
  } catch (error) {
    console.error('Failed to create DM room:', error);
    return null;
  }
}

/**
 * Create a group room
 */
export async function createGroupRoom(
  name: string, 
  userIds: string[], 
  topic?: string
): Promise<string | null> {
  if (!matrixClient) return null;

  try {
    const result = await matrixClient.createRoom({
      preset: sdk.Preset.PrivateChat,
      name,
      topic,
      invite: userIds,
    });
    return result.room_id;
  } catch (error) {
    console.error('Failed to create group room:', error);
    return null;
  }
}

/**
 * Mark room as read
 */
export async function markRoomAsRead(roomId: string): Promise<void> {
  if (!matrixClient) return;

  const room = matrixClient.getRoom(roomId);
  if (!room) return;

  const lastEvent = room.timeline[room.timeline.length - 1];
  if (lastEvent) {
    await matrixClient.sendReadReceipt(lastEvent);
  }
}

/**
 * Set user typing indicator
 */
export async function setTyping(roomId: string, isTyping: boolean): Promise<void> {
  if (!matrixClient) return;
  
  try {
    await matrixClient.sendTyping(roomId, isTyping, isTyping ? 30000 : 0);
  } catch (error) {
    // Ignore typing errors
  }
}

/**
 * Search users by name
 */
export async function searchUsers(term: string): Promise<Array<{userId: string; displayName: string; avatarUrl?: string}>> {
  if (!matrixClient) return [];

  try {
    const result = await matrixClient.searchUserDirectory({ term, limit: 20 });
    return result.results.map(user => ({
      userId: user.user_id,
      displayName: user.display_name || user.user_id.split(':')[0].replace('@', ''),
      avatarUrl: user.avatar_url ? matrixClient!.mxcUrlToHttp(user.avatar_url, 40, 40, 'crop') || undefined : undefined,
    }));
  } catch (error) {
    console.error('Failed to search users:', error);
    return [];
  }
}

/**
 * Get user profile
 */
export async function getUserProfile(userId: string): Promise<{displayName?: string; avatarUrl?: string} | null> {
  if (!matrixClient) return null;

  try {
    const profile = await matrixClient.getProfileInfo(userId);
    return {
      displayName: profile.displayname,
      avatarUrl: profile.avatar_url ? matrixClient.mxcUrlToHttp(profile.avatar_url, 80, 80, 'crop') || undefined : undefined,
    };
  } catch (error) {
    return null;
  }
}
