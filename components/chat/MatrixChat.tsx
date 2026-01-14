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

interface MatrixMessage {
  eventId: string;
  sender: string;
  senderName: string;
  senderAvatar?: string;
  content: string;
  timestamp: number;
  isOwn: boolean;
}

interface TypingUser {
  userId: string;
  name: string;
}

export default function MatrixChat() {
  const { data: session } = useSession();
  const [credentials, setCredentials] = useState<MatrixCredentials | null>(null);
  const [rooms, setRooms] = useState<MatrixRoom[]>([]);
  const [selectedRoomId, setSelectedRoomId] = useState<string | null>(null);
  const [messages, setMessages] = useState<MatrixMessage[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showNewChat, setShowNewChat] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [searchResults, setSearchResults] = useState<Array<{userId: string; displayName: string; avatarUrl?: string}>>([]);
  const [typingUsers, setTypingUsers] = useState<TypingUser[]>([]);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [connected, setConnected] = useState(false);

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
          
          // Ensure user has a chat with AI bot
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
            state: { lazy_load_members: true },
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
        const isDirect = stateEvents.some(e => e.type === 'm.room.member' && e.content?.is_direct);
        
        // For DM chats, find the other member's name and avatar
        let roomName = nameEvent?.content?.name;
        let roomAvatar: string | undefined;
        
        // Get all member events
        const memberEvents = stateEvents.filter(e => e.type === 'm.room.member');
        
        // For rooms without name (DM chats), show other member's name
        if (!roomName) {
          // Find other members (not the current user) who have joined
          const otherMembers = memberEvents.filter(
            e => e.state_key !== credentials.userId && 
                 (e.content?.membership === 'join' || e.content?.membership === 'invite')
          );
          
          if (otherMembers.length > 0) {
            // Get display name from member event or generate from user ID
            const otherMember = otherMembers[0];
            roomName = otherMember.content?.displayname;
            
            if (!roomName && otherMember.state_key) {
              // Extract username from Matrix ID: @username:domain -> username
              const username = otherMember.state_key.split(':')[0].replace('@', '');
              // Convert snake_case to readable: myunion_abc123 -> MyUnion User
              roomName = username.includes('myunion_') 
                ? 'Пользователь' 
                : username.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
            }
            
            roomAvatar = otherMember.content?.avatar_url;
          } else if (memberEvents.length === 1) {
            // Only current user in room - might be waiting for invites
            roomName = 'Новый чат';
          }
        }
        
        // Ultimate fallback
        if (!roomName) {
          roomName = isDirect ? 'Личный чат' : 'Групповой чат';
        }
        
        const timelineEvents = rd.timeline?.events || [];
        const lastMsg = [...timelineEvents].reverse().find(e => e.type === 'm.room.message');

        roomList.push({
          roomId,
          name: roomName || 'Новый чат',
          avatarUrl: roomAvatar,
          lastMessage: lastMsg?.content?.body,
          lastMessageTime: lastMsg?.origin_server_ts,
          unreadCount: rd.unread_notifications?.notification_count || 0,
          isDirect,
        });

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
          type TimelineEvent = { type: string; event_id: string; sender: string; content: { body?: string }; origin_server_ts: number };
          const newMsgs = (timelineEvents as TimelineEvent[])
            .filter(e => e.type === 'm.room.message')
            .map(e => ({
              eventId: e.event_id,
              sender: e.sender,
              senderName: e.sender.split(':')[0].replace('@', ''),
              content: e.content.body || '',
              timestamp: e.origin_server_ts,
              isOwn: e.sender === credentials.userId,
            }));

          if (newMsgs.length > 0) {
            setMessages(prev => {
              const existing = new Set(prev.map(m => m.eventId));
              const unique = newMsgs.filter((m: MatrixMessage) => !existing.has(m.eventId));
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
      }

    } catch (err: unknown) {
      if (err instanceof Error && err.name !== 'AbortError') {
        console.error('Sync error:', err);
        setConnected(false);
      }
    }
  }, [credentials, matrixFetch, selectedRoomId]);

  // Start sync loop
  useEffect(() => {
    if (!credentials) return;

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
  }, [credentials, sync]);

  // Load room messages
  const loadRoomMessages = useCallback(async (roomId: string) => {
    const data = await matrixFetch(`/rooms/${encodeURIComponent(roomId)}/messages?dir=b&limit=50`);
    if (!data) return;

    const msgs = (data.chunk || [])
      .filter((e: { type: string }) => e.type === 'm.room.message')
      .map((e: { event_id: string; sender: string; content: { body?: string }; origin_server_ts: number }) => ({
        eventId: e.event_id,
        sender: e.sender,
        senderName: e.sender.split(':')[0].replace('@', ''),
        content: e.content.body || '',
        timestamp: e.origin_server_ts,
        isOwn: e.sender === credentials?.userId,
      }))
      .reverse();

    setMessages(msgs);
    scrollToBottom();
  }, [credentials, matrixFetch]);

  // Select room
  const handleSelectRoom = (roomId: string) => {
    setSelectedRoomId(roomId);
    setMessages([]);
    setTypingUsers([]);
    loadRoomMessages(roomId);
    setIsMobileMenuOpen(false);
  };

  // Send message
  const handleSend = async () => {
    if (!selectedRoomId || !newMessage.trim() || sending || !credentials) return;

    setSending(true);
    const content = newMessage.trim();
    setNewMessage('');

    try {
      const txnId = `m${Date.now()}`;
      const data = await matrixFetch(
        `/rooms/${encodeURIComponent(selectedRoomId)}/send/m.room.message/${txnId}`,
        {
          method: 'PUT',
          body: JSON.stringify({ msgtype: 'm.text', body: content }),
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
        }]);
        scrollToBottom();
      }
    } catch (err) {
      console.error('Send error:', err);
      setNewMessage(content); // Restore message on error
    } finally {
      setSending(false);
      inputRef.current?.focus();
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

  // Search users
  useEffect(() => {
    if (!searchTerm.trim() || !credentials) {
      setSearchResults([]);
      return;
    }

    const timer = setTimeout(async () => {
      const data = await matrixFetch(`/user_directory/search`, {
        method: 'POST',
        body: JSON.stringify({ search_term: searchTerm, limit: 20 }),
      });
      
      if (data?.results) {
        setSearchResults(
          data.results
            .filter((u: { user_id: string }) => u.user_id !== credentials.userId)
            .map((u: { user_id: string; display_name?: string; avatar_url?: string }) => ({
              userId: u.user_id,
              displayName: u.display_name || u.user_id.split(':')[0].replace('@', ''),
              avatarUrl: u.avatar_url,
            }))
        );
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [searchTerm, credentials, matrixFetch]);

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
                          src={room.avatarUrl.replace('mxc://', `${credentials?.serverUrl}/_matrix/media/v3/thumbnail/`)}
                          alt={room.name}
                          className="w-full h-full object-cover"
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
              {messages.map((msg, idx) => {
                const showAvatar = idx === 0 || messages[idx - 1].sender !== msg.sender;
                
                return (
                  <div
                    key={msg.eventId}
                    className={`flex items-end gap-2 ${msg.isOwn ? 'justify-end' : 'justify-start'}`}
                  >
                    {!msg.isOwn && showAvatar && (
                      <Avatar className="h-8 w-8 flex-shrink-0">
                        <AvatarFallback className="bg-gray-300 dark:bg-gray-600 text-xs">
                          {msg.senderName.charAt(0).toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                    )}
                    {!msg.isOwn && !showAvatar && <div className="w-8" />}
                    
                    <div
                      className={`max-w-[75%] rounded-2xl px-4 py-2 shadow-sm ${
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
                      <p className="whitespace-pre-wrap break-words">{msg.content}</p>
                      <div className={`text-xs mt-1 ${msg.isOwn ? 'text-blue-100' : 'text-gray-400'}`}>
                        {new Date(msg.timestamp).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}
                      </div>
                    </div>
                  </div>
                );
              })}
              <div ref={messagesEndRef} className="h-4" />
            </div>

            {/* Input */}
            <div className="p-4 border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
              <div className="flex items-end gap-3">
                <div className="flex-1 relative">
                  <textarea
                    ref={inputRef}
                    value={newMessage}
                    onChange={(e) => {
                      setNewMessage(e.target.value);
                      handleTyping();
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        handleSend();
                      }
                    }}
                    placeholder="Введите сообщение..."
                    rows={1}
                    className="w-full px-4 py-3 rounded-2xl border border-gray-200 dark:border-gray-600 
                      bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white 
                      resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent
                      placeholder:text-gray-400"
                    style={{ minHeight: '48px', maxHeight: '150px' }}
                  />
                </div>
                <button
                  onClick={handleSend}
                  disabled={!newMessage.trim() || sending}
                  className="p-3 bg-gradient-to-r from-blue-600 to-blue-500 text-white rounded-full 
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
                    <Avatar className="h-12 w-12">
                      <AvatarFallback className="bg-gradient-to-br from-blue-500 to-blue-600 text-white">
                        {user.displayName.charAt(0).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <div className="text-left">
                      <div className="font-semibold text-gray-900 dark:text-white">
                        {user.displayName}
                      </div>
                      <div className="text-sm text-gray-500 dark:text-gray-400">
                        {user.userId}
                      </div>
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
