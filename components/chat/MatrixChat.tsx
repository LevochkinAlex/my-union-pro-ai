'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { useSession } from 'next-auth/react';

// Simple Avatar component
function Avatar({ className, children }: { className?: string; children: React.ReactNode }) {
  return <div className={`rounded-full overflow-hidden flex items-center justify-center ${className || ''}`}>{children}</div>;
}

function AvatarFallback({ className, children }: { className?: string; children: React.ReactNode }) {
  return <div className={`w-full h-full flex items-center justify-center ${className || ''}`}>{children}</div>;
}

interface MatrixCredentials {
  userId: string;
  accessToken: string;
  serverUrl: string;
}

interface MatrixRoom {
  roomId: string;
  name: string;
  avatarUrl?: string;
  lastMessage?: string;
  lastMessageTime?: number;
  unreadCount: number;
  isDirect: boolean;
}

interface DbRoomInfo {
  matrixRoomId: string;
  displayName: string;
  avatarUrl?: string;
  isDirect: boolean;
  participantCount: number;
  participants: Array<{
    id: string;
    firstName?: string;
    lastName?: string;
    avatarUrl?: string;
    matrixUserId?: string;
  }>;
}

interface MessageReaction {
  key: string;
  users: string[];
  count: number;
  eventIds?: Map<string, string>; // userId -> reactionEventId for redaction
}

interface MessageAttachment {
  type: 'image' | 'file' | 'video' | 'audio';
  url: string;
  name: string;
  size?: number;
  mimeType?: string;
  thumbnailUrl?: string;
  width?: number;
  height?: number;
}

interface ReplyInfo {
  eventId: string;
  sender: string;
  senderName: string;
  content: string;
}

interface MatrixMessage {
  eventId: string;
  sender: string;
  senderName: string;
  senderAvatar?: string;
  content: string;
  timestamp: number;
  isOwn: boolean;
  msgtype: 'm.text' | 'm.image' | 'm.file' | 'm.video' | 'm.audio';
  reactions?: MessageReaction[];
  replyTo?: ReplyInfo;
  attachment?: MessageAttachment;
}

interface TypingUser {
  userId: string;
  name: string;
}

interface MatrixChatProps {
  isPPOHead?: boolean;
}

export default function MatrixChat({ isPPOHead = false }: MatrixChatProps) {
  const { data: session } = useSession();
  const [credentials, setCredentials] = useState<MatrixCredentials | null>(null);
  const [rooms, setRooms] = useState<MatrixRoom[]>([]);
  const [dbRoomInfo, setDbRoomInfo] = useState<Map<string, DbRoomInfo>>(new Map());
  const [selectedRoomId, setSelectedRoomId] = useState<string | null>(null);
  const [messages, setMessages] = useState<MatrixMessage[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showNewChat, setShowNewChat] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [searchResults, setSearchResults] = useState<Array<{userId: string; displayName: string; avatarUrl?: string; position?: string; organization?: string}>>([]);
  const [typingUsers, setTypingUsers] = useState<TypingUser[]>([]);
  const [dbRoomInfoLoaded, setDbRoomInfoLoaded] = useState(false);
  // Group creation state (for PPO Head)
  const [showCreateGroup, setShowCreateGroup] = useState(false);
  const [groupName, setGroupName] = useState('');
  const [groupDescription, setGroupDescription] = useState('');
  const [orgMembers, setOrgMembers] = useState<Array<{id: string; firstName: string; lastName: string; avatarUrl?: string; matrixUserId?: string}>>([]);
  const [selectedMembers, setSelectedMembers] = useState<string[]>([]);
  const [creatingGroup, setCreatingGroup] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [connected, setConnected] = useState(false);
  const [replyTo, setReplyTo] = useState<MatrixMessage | null>(null);
  const [uploading, setUploading] = useState(false);
  const [showReactions, setShowReactions] = useState<string | null>(null);
  const [forwardMessage, setForwardMessage] = useState<MatrixMessage | null>(null);
  const [showForwardModal, setShowForwardModal] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const syncTokenRef = useRef<string | null>(null);
  const syncAbortRef = useRef<AbortController | null>(null);

  // Auth with Matrix
  useEffect(() => {
    async function authenticate() {
      if (!session?.user) return;

      try {
        const response = await fetch('/api/chat/matrix/auth', { method: 'POST' });
        if (response.ok) {
          const data = await response.json();
          setCredentials(data);
          
          // Load room info from our DB FIRST
          await loadDbRoomInfo();
          // Then ensure user has a chat with AI bot
          ensureBotChat(data);
        } else {
          setError('Не удалось подключиться к чату');
        }
      } catch {
        setError('Ошибка подключения');
      } finally {
        setLoading(false);
      }
    }
    authenticate();
  }, [session]);

  // Load room info from our database (proper names, avatars)
  const loadDbRoomInfo = useCallback(async () => {
    try {
      const resp = await fetch('/api/chat/rooms');
      if (resp.ok) {
        const data = await resp.json();
        const infoMap = new Map<string, DbRoomInfo>();
        for (const room of data.rooms || []) {
          if (room.matrixRoomId) {
            infoMap.set(room.matrixRoomId, room);
          }
        }
        setDbRoomInfo(infoMap);
      }
    } catch (err) {
      console.error('Failed to load room info from DB:', err);
    } finally {
      setDbRoomInfoLoaded(true);
    }
  }, []);

  // Load organization members for group creation (PPO Head only)
  const loadOrgMembers = useCallback(async () => {
    if (!isPPOHead) return;
    try {
      const resp = await fetch('/api/ppo-head/members?status=approved');
      if (resp.ok) {
        const data = await resp.json();
        setOrgMembers(data.members || []);
      }
    } catch (err) {
      console.error('Failed to load org members:', err);
    }
  }, [isPPOHead]);

  // Create group chat (PPO Head only)
  const handleCreateGroup = useCallback(async () => {
    if (!credentials || !groupName.trim() || selectedMembers.length === 0) return;
    
    setCreatingGroup(true);
    try {
      // Create group via our API (which creates in DB and Matrix)
      const resp = await fetch('/api/ppo-head/chats/groups', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: groupName.trim(),
          description: groupDescription.trim() || null,
          participantIds: selectedMembers
        })
      });

      if (!resp.ok) {
        const err = await resp.json();
        throw new Error(err.error || 'Ошибка создания группы');
      }

      const data = await resp.json();
      
      // Refresh rooms
      await loadDbRoomInfo();
      
      // Reset form
      setShowCreateGroup(false);
      setGroupName('');
      setGroupDescription('');
      setSelectedMembers([]);
      
      // Select new room if it has matrixRoomId
      if (data.chat?.matrixRoomId) {
        setSelectedRoomId(data.chat.matrixRoomId);
      }
    } catch (err) {
      console.error('Failed to create group:', err);
      setError(err instanceof Error ? err.message : 'Ошибка создания группы');
    } finally {
      setCreatingGroup(false);
    }
  }, [credentials, groupName, groupDescription, selectedMembers, loadDbRoomInfo]);

  // Load org members when showing create group modal
  useEffect(() => {
    if (showCreateGroup && isPPOHead) {
      loadOrgMembers();
    }
  }, [showCreateGroup, isPPOHead, loadOrgMembers]);

  // Ensure user has a DM chat with AI bot
  const ensureBotChat = useCallback(async (creds: MatrixCredentials) => {
    const BOT_USER_ID = '@myunion_bot:matrix.myunion.pro';
    
    try {
      // Check if DM with bot exists by looking at account data
      const accountDataResp = await fetch(
        `${creds.serverUrl}/_matrix/client/v3/user/${encodeURIComponent(creds.userId)}/account_data/m.direct`,
        { headers: { 'Authorization': `Bearer ${creds.accessToken}` } }
      );
      
      let hasBotRoom = false;
      if (accountDataResp.ok) {
        const directRooms = await accountDataResp.json();
        hasBotRoom = directRooms[BOT_USER_ID]?.length > 0;
      }
      
      if (!hasBotRoom) {
        // Create DM room with bot
        const createResp = await fetch(
          `${creds.serverUrl}/_matrix/client/v3/createRoom`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${creds.accessToken}`
            },
            body: JSON.stringify({
              preset: 'trusted_private_chat',
              is_direct: true,
              invite: [BOT_USER_ID],
              initial_state: [{
                type: 'm.room.name',
                content: { name: 'МойСоюз Помощник' }
              }]
            })
          }
        );
        
        if (createResp.ok) {
          const room = await createResp.json();
          
          // Update m.direct account data
          const newDirectRooms = { [BOT_USER_ID]: [room.room_id] };
          await fetch(
            `${creds.serverUrl}/_matrix/client/v3/user/${encodeURIComponent(creds.userId)}/account_data/m.direct`,
            {
              method: 'PUT',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${creds.accessToken}`
              },
              body: JSON.stringify(newDirectRooms)
            }
          );
          
          console.log('Created bot chat room:', room.room_id);
        }
      }
    } catch (err) {
      console.error('Failed to ensure bot chat:', err);
    }
  }, []);

  // Matrix API helpers
  const matrixFetch = useCallback(async (
    endpoint: string, 
    options: RequestInit = {}
  ) => {
    if (!credentials) return null;
    
    const url = `${credentials.serverUrl}/_matrix/client/v3${endpoint}`;
    const response = await fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${credentials.accessToken}`,
        ...options.headers,
      },
    });
    
    if (!response.ok) return null;
    return response.json();
  }, [credentials]);

  // Sync with Matrix server
  const sync = useCallback(async (initialSync = false) => {
    if (!credentials) return;
    
    try {
      const params = new URLSearchParams({
        timeout: initialSync ? '0' : '30000',
        filter: JSON.stringify({
          room: {
            timeline: { limit: 50 },
            state: { 
              lazy_load_members: false,  // Load all members to get names
              types: ['m.room.name', 'm.room.member', 'm.room.avatar', 'm.room.canonical_alias']
            },
          },
        }),
      });
      
      if (syncTokenRef.current) {
        params.set('since', syncTokenRef.current);
      }

      syncAbortRef.current = new AbortController();
      
      const data = await matrixFetch(`/sync?${params}`, {
        signal: syncAbortRef.current.signal,
      });

      if (!data) return;

      syncTokenRef.current = data.next_batch;
      setConnected(true);

      // Process rooms
      const joinedRooms = data.rooms?.join || {};
      const roomList: MatrixRoom[] = [];

      for (const [roomId, roomData] of Object.entries(joinedRooms)) {
        interface MemberContent { 
          displayname?: string; 
          avatar_url?: string; 
          is_direct?: boolean;
          membership?: string;
        }
        interface StateEvent { 
          type: string; 
          state_key?: string;
          sender?: string;
          content: { name?: string } & MemberContent;
        }
        
        const rd = roomData as {
          state?: { events?: StateEvent[] };
          timeline?: { events?: Array<{ type: string; content: { body?: string }; origin_server_ts?: number }> };
          unread_notifications?: { notification_count?: number };
          ephemeral?: { events?: Array<{ type: string; content: { user_ids?: string[] } }> };
        };
        
        const stateEvents = rd.state?.events || [];
        const nameEvent = stateEvents.find(e => e.type === 'm.room.name');
        
        // Get all member events
        const allMemberEvents = stateEvents.filter(e => e.type === 'm.room.member');
        
        // Count joined/invited members
        const activeMembers = allMemberEvents.filter(e => 
          e.content?.membership === 'join' || e.content?.membership === 'invite'
        );
        
        // Check if this is a bot room
        const isBotRoom = allMemberEvents.some(
          e => e.state_key?.includes('myunion_bot')
        );
        
        // Find other members (not the current user)
        const otherMembers = allMemberEvents.filter(
          e => e.state_key !== credentials.userId && 
               (e.content?.membership === 'join' || e.content?.membership === 'invite')
        );
        
        // Check if we have DB info for this room (preferred source)
        const dbInfo = dbRoomInfo.get(roomId);
        
        // Determine if this is a direct chat
        const isDirect = dbInfo?.isDirect ?? (activeMembers.length <= 2 && !nameEvent?.content?.name);
        
        // Get room name - priority: DB info > explicit name > member name > fallback
        let roomName = dbInfo?.displayName || nameEvent?.content?.name;
        let roomAvatar: string | undefined = dbInfo?.avatarUrl;
        
        // For rooms without name from DB, try to determine from Matrix data
        if (!roomName && otherMembers.length > 0) {
          const otherMember = otherMembers[0];
          
          // Check if it's the bot
          if (otherMember.state_key?.includes('myunion_bot') || otherMember.state_key?.includes('ai_assistant')) {
            roomName = 'МойСоюз Помощник';
          } else {
            // Get display name from member event
            roomName = otherMember.content?.displayname;
            if (!roomAvatar) roomAvatar = otherMember.content?.avatar_url;
            
            // If no display name, try to create readable name from Matrix ID
            if (!roomName && otherMember.state_key) {
              const username = otherMember.state_key.split(':')[0].replace('@', '');
              if (username.startsWith('myunion_')) {
                roomName = 'Пользователь';
              } else {
                roomName = username.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
              }
            }
          }
        }
        
        // Fallback names based on room type
        if (!roomName) {
          if (isBotRoom) {
            roomName = 'МойСоюз Помощник';
          } else if (activeMembers.length === 1) {
            roomName = 'Новый чат';
          } else if (isDirect) {
            roomName = 'Личный чат';
          } else {
            roomName = 'Групповой чат';
          }
        }
        
        const timelineEvents = rd.timeline?.events || [];
        const lastMsg = [...timelineEvents].reverse().find(e => e.type === 'm.room.message');

        // ONLY add rooms that exist in our database
        if (dbInfo) {
          roomList.push({
            roomId,
            name: dbInfo.displayName || roomName || 'Чат',
            avatarUrl: dbInfo.avatarUrl || roomAvatar,
            lastMessage: lastMsg?.content?.body,
            lastMessageTime: lastMsg?.origin_server_ts,
            unreadCount: rd.unread_notifications?.notification_count || 0,
            isDirect: dbInfo.isDirect,
          });
        }

        // Handle typing indicators
        const typingEvent = rd.ephemeral?.events?.find(e => e.type === 'm.typing');
        if (typingEvent && roomId === selectedRoomId) {
          const typingUserIds = typingEvent.content?.user_ids || [];
          setTypingUsers(
            typingUserIds
              .filter(id => id !== credentials.userId)
              .map(id => ({ userId: id, name: id.split(':')[0].replace('@', '') }))
          );
        }

        // Update messages for selected room
        if (roomId === selectedRoomId && !initialSync) {
          type TimelineEvent = { type: string; event_id: string; sender: string; content: { body?: string; msgtype?: string; url?: string; info?: any; 'm.relates_to'?: any }; origin_server_ts: number };
          const newMsgs: MatrixMessage[] = (timelineEvents as TimelineEvent[])
            .filter(e => e.type === 'm.room.message')
            .map(e => {
              const msgtype = (e.content?.msgtype || 'm.text') as MatrixMessage['msgtype'];
              let attachment: MessageAttachment | undefined;
              
              // Handle attachments
              if (msgtype === 'm.image' && e.content?.url) {
                attachment = {
                  type: 'image',
                  url: e.content.url.replace('mxc://', `${credentials.serverUrl}/_matrix/media/v3/download/`),
                  name: e.content.body || 'image',
                  mimeType: e.content.info?.mimetype,
                  width: e.content.info?.w,
                  height: e.content.info?.h,
                  size: e.content.info?.size
                };
              } else if (msgtype === 'm.file' && e.content?.url) {
                attachment = {
                  type: 'file',
                  url: e.content.url.replace('mxc://', `${credentials.serverUrl}/_matrix/media/v3/download/`),
                  name: e.content.body || 'file',
                  mimeType: e.content.info?.mimetype,
                  size: e.content.info?.size
                };
              } else if (msgtype === 'm.video' && e.content?.url) {
                attachment = {
                  type: 'video',
                  url: e.content.url.replace('mxc://', `${credentials.serverUrl}/_matrix/media/v3/download/`),
                  name: e.content.body || 'video',
                  mimeType: e.content.info?.mimetype,
                  size: e.content.info?.size
                };
              } else if (msgtype === 'm.audio' && e.content?.url) {
                attachment = {
                  type: 'audio',
                  url: e.content.url.replace('mxc://', `${credentials.serverUrl}/_matrix/media/v3/download/`),
                  name: e.content.body || 'audio',
                  mimeType: e.content.info?.mimetype,
                  size: e.content.info?.size
                };
              }
              
              // Get sender name from our DB data
              let senderName = 'Пользователь';
              let senderAvatar: string | undefined;
              
              if (e.sender.includes('myunion_bot') || e.sender.includes('ai_assistant')) {
                senderName = 'МойСоюз Помощник';
              } else if (dbInfo?.participants) {
                // Find sender in our DB participants
                const participant = dbInfo.participants.find(p => p.matrixUserId === e.sender);
                if (participant) {
                  senderName = [participant.firstName, participant.lastName].filter(Boolean).join(' ') || 'Пользователь';
                  senderAvatar = participant.avatarUrl || undefined;
                }
              }
              
              // Fallback to Matrix display name
              if (senderName === 'Пользователь') {
                const memberEvent = allMemberEvents.find(m => m.state_key === e.sender);
                if (memberEvent?.content?.displayname) {
                  senderName = memberEvent.content.displayname;
                }
              }
              
              return {
                eventId: e.event_id,
                sender: e.sender,
                senderName,
                senderAvatar,
                content: e.content?.body || '',
                timestamp: e.origin_server_ts,
                isOwn: e.sender === credentials.userId,
                msgtype,
                attachment
              };
            });

          if (newMsgs.length > 0) {
            setMessages(prev => {
              const existing = new Set(prev.map(m => m.eventId));
              const unique = newMsgs.filter(m => !existing.has(m.eventId));
              return [...prev, ...unique].sort((a, b) => a.timestamp - b.timestamp);
            });
            scrollToBottom();
          }
        }
      }

      if (initialSync || roomList.length > 0) {
        setRooms(prev => {
          const updated = new Map(prev.map(r => [r.roomId, r]));
          roomList.forEach(r => updated.set(r.roomId, r));
          return Array.from(updated.values()).sort((a, b) => (b.lastMessageTime || 0) - (a.lastMessageTime || 0));
        });
        
        // For rooms with generic names, fetch member info asynchronously
        if (initialSync) {
          roomList.forEach(async (room) => {
            if (room.name === 'Чат' || room.name === 'Групповой чат' || room.name === 'Личный чат' || !room.avatarUrl) {
              try {
                const membersData = await matrixFetch(`/rooms/${encodeURIComponent(room.roomId)}/members`);
                if (!membersData?.chunk) return;
                
                const members = membersData.chunk.filter((m: any) => 
                  m.content?.membership === 'join' || m.content?.membership === 'invite'
                );
                
                const otherMember = members.find((m: any) => m.state_key !== credentials.userId);
                const isBotRoom = members.some((m: any) => m.state_key?.includes('myunion_bot'));
                
                let name = room.name;
                let avatar = room.avatarUrl;
                
                if (isBotRoom) {
                  name = 'МойСоюз Помощник';
                } else if (otherMember) {
                  name = otherMember.content?.displayname || '';
                  avatar = otherMember.content?.avatar_url || '';
                  
                  if (!name && otherMember.state_key) {
                    const username = otherMember.state_key.split(':')[0].replace('@', '');
                    if (username.startsWith('myunion_')) {
                      name = 'Пользователь';
                    } else {
                      name = username.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
                    }
                  }
                }
                
                if (name && name !== room.name) {
                  setRooms(prev => prev.map(r => 
                    r.roomId === room.roomId 
                      ? { ...r, name: name || r.name, avatarUrl: avatar || r.avatarUrl, isDirect: members.length <= 2 }
                      : r
                  ));
                }
              } catch (err) {
                console.error('Failed to fetch room members for', room.roomId, err);
              }
            }
          });
        }
      }

    } catch (err: unknown) {
      if (err instanceof Error && err.name !== 'AbortError') {
        console.error('Sync error:', err);
        setConnected(false);
      }
    }
  }, [credentials, matrixFetch, selectedRoomId, dbRoomInfo]);

  // Start sync loop
  useEffect(() => {
    if (!credentials) return;
    // Wait for dbRoomInfo to load before starting sync
    if (!dbRoomInfoLoaded) return;

    let running = true;
    
    const syncLoop = async () => {
      // Initial sync
      await sync(true);
      
      // Long poll loop
      while (running) {
        await sync(false);
        await new Promise(r => setTimeout(r, 1000)); // Small delay between syncs
      }
    };

    syncLoop();

    return () => {
      running = false;
      syncAbortRef.current?.abort();
    };
  }, [credentials, sync, dbRoomInfoLoaded]);

  // Load room messages with reactions, replies, and attachments
  const loadRoomMessages = useCallback(async (roomId: string) => {
    const data = await matrixFetch(`/rooms/${encodeURIComponent(roomId)}/messages?dir=b&limit=50`);
    if (!data) return;

    // First pass: collect all messages
    const messageEvents = (data.chunk || []).filter((e: { type: string }) => e.type === 'm.room.message');
    
    // Second pass: collect reactions
    const reactionEvents = (data.chunk || []).filter((e: { type: string }) => e.type === 'm.reaction');
    const reactionsMap = new Map<string, MessageReaction[]>();
    
    for (const event of reactionEvents) {
      const relatesTo = event.content?.['m.relates_to'];
      if (relatesTo?.rel_type === 'm.annotation') {
        const targetId = relatesTo.event_id;
        const key = relatesTo.key;
        
        if (!reactionsMap.has(targetId)) {
          reactionsMap.set(targetId, []);
        }
        
        const reactions = reactionsMap.get(targetId)!;
        const existing = reactions.find(r => r.key === key);
        if (existing) {
          if (!existing.users.includes(event.sender)) {
            existing.count++;
            existing.users.push(event.sender);
            if (!existing.eventIds) existing.eventIds = new Map();
            existing.eventIds.set(event.sender, event.event_id);
          }
        } else {
          const eventIds = new Map<string, string>();
          eventIds.set(event.sender, event.event_id);
          reactions.push({ key, count: 1, users: [event.sender], eventIds });
        }
      }
    }

    // Build messages map for replies
    const messagesById = new Map<string, { sender: string; content: string }>();
    for (const e of messageEvents) {
      messagesById.set(e.event_id, {
        sender: e.sender,
        content: e.content?.body || ''
      });
    }

    const msgs: MatrixMessage[] = messageEvents.map((e: any) => {
      const msgtype = e.content?.msgtype || 'm.text';
      let attachment: MessageAttachment | undefined;
      
      // Handle attachments
      if (msgtype === 'm.image' && e.content?.url) {
        attachment = {
          type: 'image',
          url: e.content.url.replace('mxc://', `${credentials?.serverUrl}/_matrix/media/v3/download/`),
          thumbnailUrl: e.content.info?.thumbnail_url?.replace('mxc://', `${credentials?.serverUrl}/_matrix/media/v3/thumbnail/`) + '?width=400&height=400',
          name: e.content.body || 'image',
          mimeType: e.content.info?.mimetype,
          width: e.content.info?.w,
          height: e.content.info?.h,
          size: e.content.info?.size
        };
      } else if (msgtype === 'm.file' && e.content?.url) {
        attachment = {
          type: 'file',
          url: e.content.url.replace('mxc://', `${credentials?.serverUrl}/_matrix/media/v3/download/`),
          name: e.content.body || 'file',
          mimeType: e.content.info?.mimetype,
          size: e.content.info?.size
        };
      } else if (msgtype === 'm.video' && e.content?.url) {
        attachment = {
          type: 'video',
          url: e.content.url.replace('mxc://', `${credentials?.serverUrl}/_matrix/media/v3/download/`),
          thumbnailUrl: e.content.info?.thumbnail_url?.replace('mxc://', `${credentials?.serverUrl}/_matrix/media/v3/thumbnail/`),
          name: e.content.body || 'video',
          mimeType: e.content.info?.mimetype,
          width: e.content.info?.w,
          height: e.content.info?.h,
          size: e.content.info?.size
        };
      } else if (msgtype === 'm.audio' && e.content?.url) {
        attachment = {
          type: 'audio',
          url: e.content.url.replace('mxc://', `${credentials?.serverUrl}/_matrix/media/v3/download/`),
          name: e.content.body || 'audio',
          mimeType: e.content.info?.mimetype,
          size: e.content.info?.size
        };
      }
      
      // Handle reply
      let replyTo: ReplyInfo | undefined;
      const relatesTo = e.content?.['m.relates_to'];
      if (relatesTo?.['m.in_reply_to']?.event_id) {
        const replyEventId = relatesTo['m.in_reply_to'].event_id;
        const replyMsg = messagesById.get(replyEventId);
        if (replyMsg) {
          replyTo = {
            eventId: replyEventId,
            sender: replyMsg.sender,
            senderName: replyMsg.sender.split(':')[0].replace('@', ''),
            content: replyMsg.content.slice(0, 100)
          };
        }
      }
      
      // Get sender name from our DB data
      let senderName = 'Пользователь';
      let senderAvatar: string | undefined;
      
      const roomDbInfo = dbRoomInfo.get(roomId);
      
      if (e.sender.includes('myunion_bot') || e.sender.includes('ai_assistant')) {
        senderName = 'МойСоюз Помощник';
      } else if (roomDbInfo?.participants) {
        const participant = roomDbInfo.participants.find(p => p.matrixUserId === e.sender);
        if (participant) {
          senderName = [participant.firstName, participant.lastName].filter(Boolean).join(' ') || 'Пользователь';
          senderAvatar = participant.avatarUrl || undefined;
        }
      }
      
      return {
        eventId: e.event_id,
        sender: e.sender,
        senderName,
        senderAvatar,
        content: e.content?.body || '',
        timestamp: e.origin_server_ts,
        isOwn: e.sender === credentials?.userId,
        msgtype: msgtype as MatrixMessage['msgtype'],
        reactions: reactionsMap.get(e.event_id),
        replyTo,
        attachment
      };
    }).reverse();

    setMessages(msgs);
    scrollToBottom();
  }, [credentials, matrixFetch, dbRoomInfo]);

  // Select room
  // Fetch room members to get proper names
  const fetchRoomMembers = useCallback(async (roomId: string) => {
    if (!credentials) return null;
    
    try {
      const data = await matrixFetch(`/rooms/${encodeURIComponent(roomId)}/members`);
      if (!data?.chunk) return null;
      
      const members = data.chunk.filter((m: any) => 
        m.content?.membership === 'join' || m.content?.membership === 'invite'
      );
      
      // Find other member (not current user)
      const otherMember = members.find((m: any) => m.state_key !== credentials.userId);
      const isBotRoom = members.some((m: any) => m.state_key?.includes('myunion_bot'));
      
      let name = '';
      let avatar = '';
      
      if (isBotRoom) {
        name = 'МойСоюз Помощник';
      } else if (otherMember) {
        name = otherMember.content?.displayname || '';
        avatar = otherMember.content?.avatar_url || '';
        
        if (!name && otherMember.state_key) {
          const username = otherMember.state_key.split(':')[0].replace('@', '');
          if (username.startsWith('myunion_')) {
            name = 'Пользователь';
          } else {
            name = username.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
          }
        }
      }
      
      return {
        name: name || 'Личный чат',
        avatarUrl: avatar,
        isDirect: members.length <= 2,
        memberCount: members.length
      };
    } catch (err) {
      console.error('Failed to fetch room members:', err);
      return null;
    }
  }, [credentials, matrixFetch]);

  const handleSelectRoom = async (roomId: string) => {
    setSelectedRoomId(roomId);
    setMessages([]);
    setTypingUsers([]);
    setIsMobileMenuOpen(false);
    
    // Load messages
    loadRoomMessages(roomId);
    
    // Fetch room members to update room info
    const memberInfo = await fetchRoomMembers(roomId);
    if (memberInfo) {
      setRooms(prev => prev.map(r => {
        if (r.roomId === roomId && (!r.name || r.name === 'Чат' || r.name === 'Групповой чат' || r.name === 'Личный чат')) {
          return {
            ...r,
            name: memberInfo.name,
            avatarUrl: memberInfo.avatarUrl || r.avatarUrl,
            isDirect: memberInfo.isDirect
          };
        }
        return r;
      }));
    }
  };

  // Send message (with reply support)
  const handleSend = async () => {
    if (!selectedRoomId || !newMessage.trim() || sending || !credentials) return;

    setSending(true);
    const content = newMessage.trim();
    setNewMessage('');
    const currentReplyTo = replyTo;
    setReplyTo(null);
    
    // Reset textarea height
    if (inputRef.current) {
      inputRef.current.style.height = '48px';
    }

    try {
      const txnId = `m${Date.now()}`;
      
      // Build message content
      const messageContent: Record<string, unknown> = {
        msgtype: 'm.text',
        body: content
      };
      
      // Add reply reference if replying
      if (currentReplyTo) {
        messageContent['m.relates_to'] = {
          'm.in_reply_to': {
            event_id: currentReplyTo.eventId
          }
        };
        // Include fallback for clients that don't support rich replies
        messageContent.body = `> <${currentReplyTo.sender}> ${currentReplyTo.content.slice(0, 50)}...\n\n${content}`;
        messageContent['format'] = 'org.matrix.custom.html';
        messageContent['formatted_body'] = `<mx-reply><blockquote><a href="#">In reply to</a> <a href="#">${currentReplyTo.senderName}</a><br>${currentReplyTo.content.slice(0, 100)}</blockquote></mx-reply>${content}`;
      }
      
      const data = await matrixFetch(
        `/rooms/${encodeURIComponent(selectedRoomId)}/send/m.room.message/${txnId}`,
        {
          method: 'PUT',
          body: JSON.stringify(messageContent),
        }
      );

      if (data?.event_id) {
        setMessages(prev => [...prev, {
          eventId: data.event_id,
          sender: credentials.userId,
          senderName: session?.user?.name || 'Вы',
          content,
          timestamp: Date.now(),
          isOwn: true,
          msgtype: 'm.text',
          replyTo: currentReplyTo ? {
            eventId: currentReplyTo.eventId,
            sender: currentReplyTo.sender,
            senderName: currentReplyTo.senderName,
            content: currentReplyTo.content
          } : undefined
        }]);
        scrollToBottom();
      }
    } catch (err) {
      console.error('Send error:', err);
      setNewMessage(content);
      setReplyTo(currentReplyTo);
    } finally {
      setSending(false);
      inputRef.current?.focus();
    }
  };

  // Send reaction
  const handleReaction = async (eventId: string, emoji: string) => {
    if (!selectedRoomId || !credentials) return;
    setShowReactions(null);
    
    // Check if user already reacted with this emoji
    const msg = messages.find(m => m.eventId === eventId);
    const existingReaction = msg?.reactions?.find(r => r.key === emoji);
    const userAlreadyReacted = existingReaction?.users.includes(credentials.userId);
    
    try {
      if (userAlreadyReacted && existingReaction?.eventIds?.get(credentials.userId)) {
        // Remove existing reaction via redaction
        const reactionEventId = existingReaction.eventIds.get(credentials.userId);
        await matrixFetch(
          `/rooms/${encodeURIComponent(selectedRoomId)}/redact/${encodeURIComponent(reactionEventId!)}/${Date.now()}`,
          { method: 'PUT', body: JSON.stringify({ reason: 'User toggled reaction' }) }
        );
        
        // Update UI - remove reaction
        setMessages(prev => prev.map(m => {
          if (m.eventId === eventId) {
            const reactions = (m.reactions || []).map(r => {
              if (r.key === emoji) {
                const newUsers = r.users.filter(u => u !== credentials.userId);
                const newEventIds = new Map(r.eventIds);
                newEventIds.delete(credentials.userId);
                return { ...r, users: newUsers, count: Math.max(0, r.count - 1), eventIds: newEventIds };
              }
              return r;
            }).filter(r => r.count > 0);
            return { ...m, reactions };
          }
          return m;
        }));
      } else {
        // Add new reaction
        const txnId = `r${Date.now()}`;
        const result = await matrixFetch(
          `/rooms/${encodeURIComponent(selectedRoomId)}/send/m.reaction/${txnId}`,
          {
            method: 'PUT',
            body: JSON.stringify({
              'm.relates_to': {
                rel_type: 'm.annotation',
                event_id: eventId,
                key: emoji
              }
            }),
          }
        );
        
        // Optimistically update UI
        setMessages(prev => prev.map(m => {
          if (m.eventId === eventId) {
            const reactions = [...(m.reactions || [])];
            const existing = reactions.find(r => r.key === emoji);
            if (existing) {
              if (!existing.users.includes(credentials.userId)) {
                existing.count++;
                existing.users.push(credentials.userId);
                if (!existing.eventIds) existing.eventIds = new Map();
                existing.eventIds.set(credentials.userId, result?.event_id);
              }
            } else {
              const eventIds = new Map<string, string>();
              eventIds.set(credentials.userId, result?.event_id);
              reactions.push({ key: emoji, count: 1, users: [credentials.userId], eventIds });
            }
            return { ...m, reactions };
          }
          return m;
        }));
      }
    } catch (err) {
      console.error('Reaction error:', err);
    }
  };

  // Upload and send file
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !selectedRoomId || !credentials) return;
    
    setUploading(true);
    
    try {
      // Upload file to Matrix media repo
      const uploadUrl = `${credentials.serverUrl}/_matrix/media/v3/upload?filename=${encodeURIComponent(file.name)}`;
      const uploadResp = await fetch(uploadUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${credentials.accessToken}`,
          'Content-Type': file.type
        },
        body: file
      });
      
      if (!uploadResp.ok) throw new Error('Upload failed');
      
      const { content_uri } = await uploadResp.json();
      
      // Determine message type
      let msgtype = 'm.file';
      if (file.type.startsWith('image/')) msgtype = 'm.image';
      else if (file.type.startsWith('video/')) msgtype = 'm.video';
      else if (file.type.startsWith('audio/')) msgtype = 'm.audio';
      
      // Send message with attachment
      const txnId = `f${Date.now()}`;
      const messageContent: Record<string, unknown> = {
        msgtype,
        body: file.name,
        url: content_uri,
        info: {
          mimetype: file.type,
          size: file.size
        }
      };
      
      // For images, try to get dimensions
      if (msgtype === 'm.image') {
        const img = new Image();
        img.src = URL.createObjectURL(file);
        await new Promise(resolve => img.onload = resolve);
        (messageContent.info as Record<string, unknown>).w = img.width;
        (messageContent.info as Record<string, unknown>).h = img.height;
        URL.revokeObjectURL(img.src);
      }
      
      const data = await matrixFetch(
        `/rooms/${encodeURIComponent(selectedRoomId)}/send/m.room.message/${txnId}`,
        {
          method: 'PUT',
          body: JSON.stringify(messageContent),
        }
      );
      
      if (data?.event_id) {
        setMessages(prev => [...prev, {
          eventId: data.event_id,
          sender: credentials.userId,
          senderName: session?.user?.name || 'Вы',
          content: file.name,
          timestamp: Date.now(),
          isOwn: true,
          msgtype: msgtype as MatrixMessage['msgtype'],
          attachment: {
            type: msgtype.replace('m.', '') as MessageAttachment['type'],
            url: content_uri.replace('mxc://', `${credentials.serverUrl}/_matrix/media/v3/download/`),
            name: file.name,
            mimeType: file.type,
            size: file.size
          }
        }]);
        scrollToBottom();
      }
    } catch (err) {
      console.error('Upload error:', err);
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  // Forward message to another room
  const handleForward = async (targetRoomId: string) => {
    if (!forwardMessage || !credentials) return;
    
    try {
      const txnId = `fw${Date.now()}`;
      const messageContent: Record<string, unknown> = {
        msgtype: forwardMessage.msgtype || 'm.text',
        body: forwardMessage.content
      };
      
      // If forwarding an attachment, include it
      if (forwardMessage.attachment) {
        messageContent.url = forwardMessage.attachment.url.replace(
          `${credentials.serverUrl}/_matrix/media/v3/download/`,
          'mxc://'
        );
        messageContent.info = {
          mimetype: forwardMessage.attachment.mimeType,
          size: forwardMessage.attachment.size
        };
      }
      
      await matrixFetch(
        `/rooms/${encodeURIComponent(targetRoomId)}/send/m.room.message/${txnId}`,
        {
          method: 'PUT',
          body: JSON.stringify(messageContent),
        }
      );
      
      setForwardMessage(null);
      setShowForwardModal(false);
    } catch (err) {
      console.error('Forward error:', err);
    }
  };

  // Send typing indicator
  const handleTyping = async () => {
    if (!selectedRoomId || !credentials) return;
    await matrixFetch(`/rooms/${encodeURIComponent(selectedRoomId)}/typing/${encodeURIComponent(credentials.userId)}`, {
      method: 'PUT',
      body: JSON.stringify({ typing: true, timeout: 10000 }),
    });
  };

  // Search users from our DB
  useEffect(() => {
    if (!searchTerm.trim()) {
      setSearchResults([]);
      return;
    }

    const timer = setTimeout(async () => {
      try {
        const response = await fetch(`/api/chat/users/search?q=${encodeURIComponent(searchTerm)}`);
        const data = await response.json();
        
        if (data?.users) {
          setSearchResults(
            data.users.map((u: { matrixUserId: string; displayName: string; avatarUrl?: string; position?: string; organization?: string }) => ({
              userId: u.matrixUserId,
              displayName: u.displayName,
              avatarUrl: u.avatarUrl,
              position: u.position,
              organization: u.organization,
            }))
          );
        }
      } catch (err) {
        console.error('User search error:', err);
        setSearchResults([]);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [searchTerm]);

  // Start chat with user
  const handleStartChat = async (userId: string) => {
    const data = await matrixFetch('/createRoom', {
      method: 'POST',
      body: JSON.stringify({
        preset: 'trusted_private_chat',
        is_direct: true,
        invite: [userId],
      }),
    });

    if (data?.room_id) {
      setSelectedRoomId(data.room_id);
      setShowNewChat(false);
      setSearchTerm('');
      await sync(true);
    }
  };

  const scrollToBottom = useCallback(() => {
    setTimeout(() => {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, 100);
  }, []);

  const selectedRoom = rooms.find(r => r.roomId === selectedRoomId);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full bg-gradient-to-br from-blue-50 to-white dark:from-gray-900 dark:to-gray-800">
        <div className="text-center">
          <div className="w-16 h-16 mx-auto mb-4 relative">
            <div className="absolute inset-0 rounded-full border-4 border-blue-200 dark:border-blue-800"></div>
            <div className="absolute inset-0 rounded-full border-4 border-t-blue-600 animate-spin"></div>
          </div>
          <p className="text-gray-600 dark:text-gray-400">Подключение к чату...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-full bg-gradient-to-br from-red-50 to-white dark:from-gray-900 dark:to-gray-800">
        <div className="text-center p-8 bg-white dark:bg-gray-800 rounded-2xl shadow-xl max-w-md">
          <div className="w-16 h-16 mx-auto mb-4 bg-red-100 dark:bg-red-900/30 rounded-full flex items-center justify-center">
            <svg className="w-8 h-8 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">Ошибка подключения</h3>
          <p className="text-gray-600 dark:text-gray-400">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full bg-gray-50 dark:bg-gray-900">
      {/* Sidebar */}
      <div className={`
        ${isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full'}
        md:translate-x-0 fixed md:relative z-20 w-80 h-full 
        border-r border-gray-200 dark:border-gray-700 
        bg-white dark:bg-gray-800 flex flex-col transition-transform
      `}>
        {/* Header */}
        <div className="p-4 border-b border-gray-200 dark:border-gray-700 bg-gradient-to-r from-blue-600 to-blue-700">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-bold text-white">Чаты</h2>
            <div className="flex items-center gap-2">
              {isPPOHead && (
                <button
                  onClick={() => setShowCreateGroup(true)}
                  className="p-2 bg-white/20 hover:bg-white/30 rounded-full transition-colors"
                  title="Создать группу"
                >
                  <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                </button>
              )}
              <button
                onClick={() => setShowNewChat(true)}
                className="p-2 bg-white/20 hover:bg-white/30 rounded-full transition-colors"
                title="Новый чат"
              >
                <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
              </button>
            </div>
          </div>
          <div className="mt-2 flex items-center gap-2 text-sm text-blue-100">
            <div className={`w-2 h-2 rounded-full ${connected ? 'bg-green-400' : 'bg-yellow-400 animate-pulse'}`}></div>
            {connected ? 'Подключено' : 'Подключение...'}
          </div>
        </div>

        {/* Room List */}
        <div className="flex-1 overflow-y-auto">
          {rooms.length === 0 ? (
            <div className="p-8 text-center">
              <div className="w-16 h-16 mx-auto mb-4 bg-gray-100 dark:bg-gray-700 rounded-full flex items-center justify-center">
                <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                </svg>
              </div>
              <p className="text-gray-500 dark:text-gray-400">Нет активных чатов</p>
              <button
                onClick={() => setShowNewChat(true)}
                className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              >
                Начать чат
              </button>
            </div>
          ) : (
            rooms.map(room => {
              // Generate gradient color based on room name
              const colors = [
                'from-blue-500 to-blue-600',
                'from-purple-500 to-purple-600', 
                'from-green-500 to-green-600',
                'from-orange-500 to-orange-600',
                'from-pink-500 to-pink-600',
                'from-cyan-500 to-cyan-600',
                'from-indigo-500 to-indigo-600',
                'from-teal-500 to-teal-600',
              ];
              const colorIndex = room.name.charCodeAt(0) % colors.length;
              const gradientColor = colors[colorIndex];
              
              // Get initials
              const initials = room.name
                .split(' ')
                .map(w => w.charAt(0))
                .slice(0, 2)
                .join('')
                .toUpperCase() || '?';
              
              return (
                <button
                  key={room.roomId}
                  onClick={() => handleSelectRoom(room.roomId)}
                  className={`w-full p-4 text-left transition-all hover:bg-gray-100 dark:hover:bg-gray-700 ${
                    selectedRoomId === room.roomId 
                      ? 'bg-blue-50 dark:bg-blue-900/30 border-l-4 border-blue-600' 
                      : ''
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <Avatar className="h-12 w-12 ring-2 ring-gray-100 dark:ring-gray-700 flex-shrink-0">
                      {room.avatarUrl ? (
                        <img 
                          src={room.avatarUrl.startsWith('mxc://') 
                            ? room.avatarUrl.replace('mxc://', `${credentials?.serverUrl}/_matrix/media/v3/thumbnail/`) 
                            : room.avatarUrl}
                          alt={room.name}
                          className="w-full h-full object-cover rounded-full"
                        />
                      ) : (
                        <AvatarFallback className={`bg-gradient-to-br ${gradientColor} text-white font-semibold text-lg`}>
                          {initials}
                        </AvatarFallback>
                      )}
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-gray-900 dark:text-white truncate">
                          {room.name}
                        </span>
                        {room.unreadCount > 0 && (
                          <span className="ml-2 px-2 py-0.5 text-xs font-bold bg-red-500 text-white rounded-full">
                            {room.unreadCount > 99 ? '99+' : room.unreadCount}
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-gray-500 dark:text-gray-400 truncate">
                        {room.lastMessage || (room.isDirect ? 'Начните диалог' : 'Нет сообщений')}
                      </p>
                    </div>
                  </div>
                </button>
              );
            })
          )}
        </div>
      </div>

      {/* Mobile Menu Overlay */}
      {isMobileMenuOpen && (
        <div 
          className="fixed inset-0 bg-black/50 z-10 md:hidden"
          onClick={() => setIsMobileMenuOpen(false)}
        />
      )}

      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col min-w-0">
        {selectedRoom ? (
          <>
            {/* Chat Header */}
            <div className="p-4 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-sm">
              <div className="flex items-center gap-3">
                <button
                  className="md:hidden p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"
                  onClick={() => setIsMobileMenuOpen(true)}
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                  </svg>
                </button>
                
                <Avatar className="h-10 w-10 ring-2 ring-gray-100 dark:ring-gray-700">
                  {selectedRoom.avatarUrl ? (
                    <img 
                      src={selectedRoom.avatarUrl.replace('mxc://', `${credentials?.serverUrl}/_matrix/media/v3/thumbnail/`)}
                      alt={selectedRoom.name}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <AvatarFallback className={`bg-gradient-to-br ${
                      ['from-blue-500 to-blue-600', 'from-purple-500 to-purple-600', 
                       'from-green-500 to-green-600', 'from-orange-500 to-orange-600',
                       'from-pink-500 to-pink-600', 'from-cyan-500 to-cyan-600'][
                        selectedRoom.name.charCodeAt(0) % 6
                      ]
                    } text-white font-semibold`}>
                      {selectedRoom.name.split(' ').map(w => w.charAt(0)).slice(0, 2).join('').toUpperCase()}
                    </AvatarFallback>
                  )}
                </Avatar>
                
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold text-gray-900 dark:text-white truncate">
                    {selectedRoom.name}
                  </h3>
                  {typingUsers.length > 0 ? (
                    <p className="text-sm text-blue-600 dark:text-blue-400 animate-pulse">
                      {typingUsers.map(u => u.name).join(', ')} печатает...
                    </p>
                  ) : (
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                      {selectedRoom.isDirect ? 'Личный чат' : 'Групповой чат'}
                    </p>
                  )}
                </div>
              </div>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-gradient-to-b from-gray-50 to-white dark:from-gray-900 dark:to-gray-800">
              {/* Quick questions for AI chat */}
              {messages.length === 0 && (selectedRoom.name.includes('Помощник') || selectedRoom.name.includes('AI') || selectedRoom.name.includes('Бот')) && (
                <div className="flex flex-col items-center justify-center h-full py-8">
                  <div className="w-20 h-20 mb-6 bg-gradient-to-br from-blue-500 to-purple-600 rounded-full flex items-center justify-center shadow-lg">
                    <svg className="w-10 h-10 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 00-2.456 2.456z" />
                    </svg>
                  </div>
                  <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
                    Привет! Я AI-помощник 👋
                  </h3>
                  <p className="text-gray-500 dark:text-gray-400 text-center mb-6 max-w-sm">
                    Я помогу вам с вопросами о профсоюзе, скидках, документах и членстве.
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full max-w-md">
                    {[
                      { icon: '📝', text: 'Как вступить в профсоюз?' },
                      { icon: '💳', text: 'Какие есть скидки?' },
                      { icon: '📋', text: 'Где найти мои документы?' },
                      { icon: '✉️', text: 'Как создать обращение?' },
                      { icon: '👤', text: 'Как заполнить профиль?' },
                      { icon: '❓', text: 'Кто наш председатель?' },
                    ].map((q, i) => (
                      <button
                        key={i}
                        onClick={() => {
                          setNewMessage(q.text);
                          inputRef.current?.focus();
                        }}
                        className="flex items-center gap-3 px-4 py-3 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl hover:bg-blue-50 dark:hover:bg-gray-700 hover:border-blue-300 dark:hover:border-blue-600 transition-all text-left group"
                      >
                        <span className="text-xl">{q.icon}</span>
                        <span className="text-sm text-gray-700 dark:text-gray-300 group-hover:text-blue-600 dark:group-hover:text-blue-400">
                          {q.text}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {messages.map((msg, idx) => {
                const showAvatar = idx === 0 || messages[idx - 1].sender !== msg.sender;
                const REACTION_EMOJIS = ['👍', '❤️', '😂', '😮', '😢', '🎉', '🙏', '👎'];
                
                return (
                  <div
                    key={msg.eventId}
                    className={`flex items-end gap-2 group ${msg.isOwn ? 'justify-end' : 'justify-start'}`}
                  >
                    {!msg.isOwn && showAvatar && (
                      <Avatar className="h-8 w-8 flex-shrink-0">
                        {msg.senderAvatar ? (
                          <img src={msg.senderAvatar} alt="" className="w-full h-full object-cover rounded-full" />
                        ) : (
                          <AvatarFallback className="bg-gradient-to-br from-blue-500 to-purple-600 text-white text-xs">
                            {msg.senderName.charAt(0).toUpperCase()}
                          </AvatarFallback>
                        )}
                      </Avatar>
                    )}
                    {!msg.isOwn && !showAvatar && <div className="w-8" />}
                    
                    <div className="relative">
                      {/* Action buttons (visible on hover) */}
                      <div className={`absolute ${msg.isOwn ? 'left-0 -translate-x-full pr-2' : 'right-0 translate-x-full pl-2'} top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1`}>
                        <button
                          onClick={() => setReplyTo(msg)}
                          className="p-1.5 rounded-full bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-600 dark:text-gray-300"
                          title="Ответить"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
                          </svg>
                        </button>
                        <button
                          onClick={() => setShowReactions(showReactions === msg.eventId ? null : msg.eventId)}
                          className="p-1.5 rounded-full bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-600 dark:text-gray-300"
                          title="Реакция"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.828 14.828a4 4 0 01-5.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                        </button>
                        <button
                          onClick={() => { setForwardMessage(msg); setShowForwardModal(true); }}
                          className="p-1.5 rounded-full bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-600 dark:text-gray-300"
                          title="Переслать"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.367 2.684 3 3 0 00-5.367-2.684z" />
                          </svg>
                        </button>
                      </div>
                      
                      {/* Reaction picker */}
                      {showReactions === msg.eventId && (
                        <div className={`absolute ${msg.isOwn ? 'right-0' : 'left-0'} bottom-full mb-2 bg-white dark:bg-gray-800 rounded-full shadow-lg px-2 py-1 flex gap-1 z-10`}>
                          {REACTION_EMOJIS.map(emoji => (
                            <button
                              key={emoji}
                              onClick={() => handleReaction(msg.eventId, emoji)}
                              className="text-xl hover:scale-125 transition-transform p-1"
                            >
                              {emoji}
                            </button>
                          ))}
                        </div>
                      )}
                      
                      {/* Message bubble */}
                      <div
                        className={`max-w-[280px] sm:max-w-[380px] rounded-2xl px-4 py-2 shadow-sm ${
                          msg.isOwn
                            ? 'bg-gradient-to-r from-blue-600 to-blue-500 text-white rounded-br-sm'
                            : 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white rounded-bl-sm border border-gray-100 dark:border-gray-600'
                        }`}
                      >
                        {!msg.isOwn && showAvatar && (
                          <div className="text-xs font-semibold text-blue-600 dark:text-blue-400 mb-1">
                            {msg.senderName}
                          </div>
                        )}
                        
                        {/* Reply preview */}
                        {msg.replyTo && (
                          <div className={`text-xs mb-2 p-2 rounded-lg ${
                            msg.isOwn ? 'bg-blue-700/50' : 'bg-gray-100 dark:bg-gray-600'
                          }`}>
                            <div className="font-semibold opacity-75">{msg.replyTo.senderName}</div>
                            <div className="truncate opacity-75">{msg.replyTo.content}</div>
                          </div>
                        )}
                        
                        {/* Attachment */}
                        {msg.attachment && (
                          <div className="mb-2">
                            {msg.attachment.type === 'image' && (
                              <img
                                src={msg.attachment.thumbnailUrl || msg.attachment.url}
                                alt={msg.attachment.name}
                                className="rounded-lg max-w-full cursor-pointer"
                                onClick={() => window.open(msg.attachment?.url, '_blank')}
                              />
                            )}
                            {msg.attachment.type === 'video' && (
                              <video
                                src={msg.attachment.url}
                                controls
                                className="rounded-lg max-w-full"
                                poster={msg.attachment.thumbnailUrl}
                              />
                            )}
                            {msg.attachment.type === 'audio' && (
                              <audio src={msg.attachment.url} controls className="w-full" />
                            )}
                            {msg.attachment.type === 'file' && (
                              <a
                                href={msg.attachment.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className={`flex items-center gap-2 p-2 rounded-lg ${
                                  msg.isOwn ? 'bg-blue-700/50 hover:bg-blue-700/70' : 'bg-gray-100 dark:bg-gray-600 hover:bg-gray-200 dark:hover:bg-gray-500'
                                }`}
                              >
                                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                                </svg>
                                <div className="flex-1 min-w-0">
                                  <div className="truncate text-sm font-medium">{msg.attachment.name}</div>
                                  {msg.attachment.size && (
                                    <div className="text-xs opacity-75">
                                      {(msg.attachment.size / 1024 / 1024).toFixed(2)} МБ
                                    </div>
                                  )}
                                </div>
                              </a>
                            )}
                          </div>
                        )}
                        
                        {/* Text content (hide if only attachment without text) */}
                        {(!msg.attachment || msg.content !== msg.attachment.name) && (
                          <p className="whitespace-pre-wrap break-words">{msg.content}</p>
                        )}
                        
                        <div className={`text-xs mt-1 ${msg.isOwn ? 'text-blue-100' : 'text-gray-400'}`}>
                          {new Date(msg.timestamp).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}
                        </div>
                      </div>
                      
                      {/* Reactions display */}
                      {msg.reactions && msg.reactions.length > 0 && (
                        <div className={`flex flex-wrap gap-1 mt-1 ${msg.isOwn ? 'justify-end' : 'justify-start'}`}>
                          {msg.reactions.map(reaction => (
                            <button
                              key={reaction.key}
                              onClick={() => handleReaction(msg.eventId, reaction.key)}
                              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-sm ${
                                reaction.users.includes(credentials?.userId || '')
                                  ? 'bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300'
                                  : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300'
                              }`}
                            >
                              <span>{reaction.key}</span>
                              <span className="text-xs">{reaction.count}</span>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
              <div ref={messagesEndRef} className="h-4" />
            </div>

            {/* Input */}
            <div className="p-4 border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
              {/* Reply preview */}
              {replyTo && (
                <div className="mb-2 p-3 bg-gray-100 dark:bg-gray-700 rounded-lg flex items-start gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="text-xs text-blue-600 dark:text-blue-400 font-semibold">
                      Ответ для {replyTo.senderName}
                    </div>
                    <div className="text-sm text-gray-600 dark:text-gray-300 truncate">
                      {replyTo.content}
                    </div>
                  </div>
                  <button
                    onClick={() => setReplyTo(null)}
                    className="p-1 hover:bg-gray-200 dark:hover:bg-gray-600 rounded"
                  >
                    <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              )}
              
              <div className="flex items-end gap-2">
                {/* Hidden file input */}
                <input
                  ref={fileInputRef}
                  type="file"
                  onChange={handleFileUpload}
                  className="hidden"
                  accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.xls,.xlsx,.txt,.zip,.rar"
                />
                
                {/* Attach button */}
                <button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading}
                  className="flex-shrink-0 h-12 w-12 flex items-center justify-center text-gray-500 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 
                    hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full transition-colors"
                  title="Прикрепить файл"
                >
                  {uploading ? (
                    <svg className="w-6 h-6 animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                  ) : (
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
                    </svg>
                  )}
                </button>
                
                <div className="flex-1 min-w-0">
                  <textarea
                    ref={inputRef}
                    value={newMessage}
                    onChange={(e) => {
                      setNewMessage(e.target.value);
                      handleTyping();
                      // Auto-resize textarea
                      e.target.style.height = 'auto';
                      e.target.style.height = Math.min(e.target.scrollHeight, 150) + 'px';
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        handleSend();
                      }
                    }}
                    placeholder={replyTo ? "Написать ответ..." : "Введите сообщение..."}
                    rows={1}
                    className="w-full px-4 py-3 rounded-2xl border border-gray-200 dark:border-gray-600 
                      bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white 
                      resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent
                      placeholder:text-gray-400 overflow-y-auto"
                    style={{ minHeight: '48px', maxHeight: '150px' }}
                  />
                </div>
                <button
                  onClick={handleSend}
                  disabled={!newMessage.trim() || sending}
                  className="flex-shrink-0 h-12 w-12 flex items-center justify-center bg-gradient-to-r from-blue-600 to-blue-500 text-white rounded-full 
                    hover:from-blue-700 hover:to-blue-600 disabled:opacity-50 disabled:cursor-not-allowed 
                    transition-all shadow-lg hover:shadow-xl active:scale-95"
                >
                  {sending ? (
                    <svg className="animate-spin h-6 w-6" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                  ) : (
                    <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                    </svg>
                  )}
                </button>
              </div>
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center bg-gradient-to-br from-blue-50 to-white dark:from-gray-900 dark:to-gray-800">
            <div className="text-center p-8">
              <button
                className="md:hidden mb-4 p-2 bg-blue-600 text-white rounded-lg"
                onClick={() => setIsMobileMenuOpen(true)}
              >
                Открыть чаты
              </button>
              <div className="w-24 h-24 mx-auto mb-6 bg-gradient-to-br from-blue-500 to-blue-600 rounded-full flex items-center justify-center shadow-xl">
                <svg className="w-12 h-12 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                </svg>
              </div>
              <h3 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
                MyUnion Чат
              </h3>
              <p className="text-gray-500 dark:text-gray-400 mb-6">
                Выберите чат или начните новый разговор
              </p>
              <button
                onClick={() => setShowNewChat(true)}
                className="px-6 py-3 bg-gradient-to-r from-blue-600 to-blue-500 text-white rounded-xl 
                  hover:from-blue-700 hover:to-blue-600 transition-all shadow-lg hover:shadow-xl font-semibold"
              >
                Начать чат
              </button>
            </div>
          </div>
        )}
      </div>

      {/* New Chat Modal */}
      {showNewChat && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="w-full max-w-md bg-white dark:bg-gray-800 rounded-2xl shadow-2xl overflow-hidden">
            <div className="p-4 bg-gradient-to-r from-blue-600 to-blue-500 text-white">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold">Новый чат</h3>
                <button 
                  onClick={() => {
                    setShowNewChat(false);
                    setSearchTerm('');
                  }}
                  className="p-1 hover:bg-white/20 rounded-full"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>
            
            <div className="p-4">
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Поиск пользователей..."
                className="w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-gray-600 
                  bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white
                  focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div className="max-h-80 overflow-y-auto">
              {searchResults.length === 0 ? (
                <div className="p-8 text-center text-gray-500 dark:text-gray-400">
                  {searchTerm ? 'Пользователи не найдены' : 'Введите имя для поиска'}
                </div>
              ) : (
                searchResults.map(user => (
                  <button
                    key={user.userId}
                    onClick={() => handleStartChat(user.userId)}
                    className="w-full p-4 flex items-center gap-3 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                  >
                    {user.avatarUrl ? (
                      <Avatar className="h-12 w-12">
                        <AvatarImage src={user.avatarUrl} alt={user.displayName} />
                        <AvatarFallback className="bg-gradient-to-br from-blue-500 to-blue-600 text-white">
                          {user.displayName.charAt(0).toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                    ) : (
                      <Avatar className="h-12 w-12">
                        <AvatarFallback className="bg-gradient-to-br from-blue-500 to-blue-600 text-white">
                          {user.displayName.charAt(0).toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                    )}
                    <div className="text-left flex-1 min-w-0">
                      <div className="font-semibold text-gray-900 dark:text-white truncate">
                        {user.displayName}
                      </div>
                      {(user.position || user.organization) && (
                        <div className="text-sm text-gray-500 dark:text-gray-400 truncate">
                          {[user.position, user.organization].filter(Boolean).join(' • ')}
                        </div>
                      )}
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* Forward Message Modal */}
      {showForwardModal && forwardMessage && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="w-full max-w-md bg-white dark:bg-gray-800 rounded-2xl shadow-2xl overflow-hidden">
            <div className="p-4 bg-gradient-to-r from-blue-600 to-blue-500 text-white">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold">Переслать сообщение</h3>
                <button 
                  onClick={() => {
                    setShowForwardModal(false);
                    setForwardMessage(null);
                  }}
                  className="p-1 hover:bg-white/20 rounded-full"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>
            
            {/* Message preview */}
            <div className="p-4 bg-gray-50 dark:bg-gray-700/50 border-b border-gray-200 dark:border-gray-600">
              <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">Сообщение от {forwardMessage.senderName}:</div>
              <div className="text-sm text-gray-700 dark:text-gray-200 truncate">
                {forwardMessage.attachment ? (
                  <span className="flex items-center gap-1">
                    {forwardMessage.attachment.type === 'image' && '🖼️ Изображение'}
                    {forwardMessage.attachment.type === 'video' && '🎬 Видео'}
                    {forwardMessage.attachment.type === 'audio' && '🎵 Аудио'}
                    {forwardMessage.attachment.type === 'file' && `📎 ${forwardMessage.attachment.name}`}
                  </span>
                ) : (
                  forwardMessage.content
                )}
              </div>
            </div>

            <div className="max-h-80 overflow-y-auto">
              <div className="p-2 text-xs text-gray-500 dark:text-gray-400 uppercase font-semibold">
                Выберите чат
              </div>
              {rooms.filter(r => r.roomId !== selectedRoomId).length === 0 ? (
                <div className="p-8 text-center text-gray-500 dark:text-gray-400">
                  Нет доступных чатов для пересылки
                </div>
              ) : (
                rooms.filter(r => r.roomId !== selectedRoomId).map(room => (
                  <button
                    key={room.roomId}
                    onClick={() => handleForward(room.roomId)}
                    className="w-full p-4 flex items-center gap-3 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                  >
                    <Avatar className="h-10 w-10">
                      {room.avatarUrl ? (
                        <img 
                          src={room.avatarUrl.replace('mxc://', `${credentials?.serverUrl}/_matrix/media/v3/thumbnail/`)}
                          alt={room.name}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <AvatarFallback className={`bg-gradient-to-br ${
                          ['from-blue-500 to-blue-600', 'from-purple-500 to-purple-600', 
                           'from-green-500 to-green-600', 'from-orange-500 to-orange-600'][
                            room.name.charCodeAt(0) % 4
                          ]
                        } text-white`}>
                          {room.name.charAt(0).toUpperCase()}
                        </AvatarFallback>
                      )}
                    </Avatar>
                    <div className="text-left flex-1 min-w-0">
                      <div className="font-semibold text-gray-900 dark:text-white truncate">
                        {room.name}
                      </div>
                      <div className="text-sm text-gray-500 dark:text-gray-400">
                        {room.isDirect ? 'Личный чат' : 'Групповой чат'}
                      </div>
                    </div>
                    <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </button>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* Create Group Modal (PPO Head only) */}
      {showCreateGroup && isPPOHead && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="w-full max-w-md bg-white dark:bg-gray-800 rounded-2xl shadow-2xl overflow-hidden">
            <div className="p-4 bg-gradient-to-r from-green-600 to-teal-600 text-white">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold">Создать группу</h3>
                <button 
                  onClick={() => {
                    setShowCreateGroup(false);
                    setGroupName('');
                    setGroupDescription('');
                    setSelectedMembers([]);
                  }}
                  className="p-1 hover:bg-white/20 rounded-full"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>
            
            <div className="p-4 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Название группы *
                </label>
                <input
                  type="text"
                  value={groupName}
                  onChange={(e) => setGroupName(e.target.value)}
                  placeholder="Например: Профком 2025"
                  className="w-full px-4 py-2 rounded-lg border border-gray-200 dark:border-gray-600 
                    bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white
                    focus:outline-none focus:ring-2 focus:ring-green-500"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Описание
                </label>
                <textarea
                  value={groupDescription}
                  onChange={(e) => setGroupDescription(e.target.value)}
                  placeholder="Краткое описание группы..."
                  rows={2}
                  className="w-full px-4 py-2 rounded-lg border border-gray-200 dark:border-gray-600 
                    bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white
                    focus:outline-none focus:ring-2 focus:ring-green-500 resize-none"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Участники * ({selectedMembers.length} выбрано)
                </label>
                <div className="max-h-48 overflow-y-auto rounded-lg border border-gray-200 dark:border-gray-600">
                  {orgMembers.length === 0 ? (
                    <div className="p-4 text-center text-gray-500 dark:text-gray-400">
                      Загрузка участников...
                    </div>
                  ) : (
                    orgMembers.map(member => {
                      const fullName = [member.lastName, member.firstName].filter(Boolean).join(' ') || 'Пользователь';
                      const isSelected = selectedMembers.includes(member.id);
                      return (
                        <label 
                          key={member.id} 
                          className={`flex items-center gap-3 p-3 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors ${
                            isSelected ? 'bg-green-50 dark:bg-green-900/20' : ''
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => {
                              setSelectedMembers(prev => 
                                isSelected 
                                  ? prev.filter(id => id !== member.id)
                                  : [...prev, member.id]
                              );
                            }}
                            className="w-4 h-4 text-green-600 rounded focus:ring-green-500"
                          />
                          {member.avatarUrl ? (
                            <img 
                              src={member.avatarUrl} 
                              alt="" 
                              className="w-8 h-8 rounded-full object-cover"
                            />
                          ) : (
                            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white text-xs font-semibold">
                              {fullName.charAt(0)}
                            </div>
                          )}
                          <span className="text-sm text-gray-900 dark:text-white">{fullName}</span>
                        </label>
                      );
                    })
                  )}
                </div>
              </div>
            </div>
            
            <div className="p-4 border-t border-gray-200 dark:border-gray-700 flex gap-3">
              <button
                onClick={() => {
                  setShowCreateGroup(false);
                  setGroupName('');
                  setGroupDescription('');
                  setSelectedMembers([]);
                }}
                className="flex-1 px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 
                  text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
              >
                Отмена
              </button>
              <button
                onClick={handleCreateGroup}
                disabled={creatingGroup || !groupName.trim() || selectedMembers.length === 0}
                className="flex-1 px-4 py-2 rounded-lg bg-gradient-to-r from-green-600 to-teal-600 
                  text-white hover:from-green-700 hover:to-teal-700 disabled:opacity-50 
                  disabled:cursor-not-allowed transition-all"
              >
                {creatingGroup ? 'Создание...' : 'Создать группу'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
