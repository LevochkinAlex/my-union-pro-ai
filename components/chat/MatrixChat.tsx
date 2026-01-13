'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { useSession } from 'next-auth/react';

interface MatrixCredentials {
  userId: string;
  accessToken: string;
  serverUrl: string;
}

interface MatrixRoom {
  roomId: string;
  name: string;
  lastMessage?: string;
  unreadCount: number;
  avatarUrl?: string;
  timestamp?: number;
}

interface MatrixMessage {
  eventId: string;
  sender: string;
  senderName: string;
  content: string;
  timestamp: number;
  type: 'text' | 'image' | 'file';
}

export default function MatrixChat() {
  const { data: session } = useSession();
  const [credentials, setCredentials] = useState<MatrixCredentials | null>(null);
  const [rooms, setRooms] = useState<MatrixRoom[]>([]);
  const [selectedRoom, setSelectedRoom] = useState<string | null>(null);
  const [messages, setMessages] = useState<MatrixMessage[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const syncTokenRef = useRef<string | null>(null);
  const syncIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Authenticate with Matrix
  useEffect(() => {
    async function authenticate() {
      if (!session?.user) return;
      
      try {
        const response = await fetch('/api/chat/matrix/auth', {
          method: 'POST'
        });
        
        if (response.ok) {
          const data = await response.json();
          setCredentials(data);
        } else {
          setError('Не удалось подключиться к чату');
        }
      } catch (err) {
        setError('Ошибка подключения к серверу чата');
      } finally {
        setLoading(false);
      }
    }
    
    authenticate();
  }, [session]);

  // Start sync when authenticated
  useEffect(() => {
    if (!credentials) return;

    async function initialSync() {
      try {
        const params = new URLSearchParams({ timeout: '0' });
        const response = await fetch(
          `${credentials.serverUrl}/_matrix/client/v3/sync?${params}`,
          {
            headers: { 'Authorization': `Bearer ${credentials.accessToken}` }
          }
        );

        if (response.ok) {
          const data = await response.json();
          syncTokenRef.current = data.next_batch;
          processRooms(data.rooms?.join || {});
        }
      } catch (err) {
        console.error('Initial sync failed:', err);
      }
    }

    initialSync();

    // Start long polling
    const startLongPoll = async () => {
      while (true) {
        try {
          if (!syncTokenRef.current) {
            await new Promise(r => setTimeout(r, 1000));
            continue;
          }

          const params = new URLSearchParams({
            since: syncTokenRef.current,
            timeout: '30000'
          });

          const response = await fetch(
            `${credentials.serverUrl}/_matrix/client/v3/sync?${params}`,
            {
              headers: { 'Authorization': `Bearer ${credentials.accessToken}` }
            }
          );

          if (response.ok) {
            const data = await response.json();
            syncTokenRef.current = data.next_batch;
            
            // Process new messages
            if (data.rooms?.join) {
              processRooms(data.rooms.join);
              
              // Update messages for selected room
              if (selectedRoom && data.rooms.join[selectedRoom]) {
                const roomData = data.rooms.join[selectedRoom];
                const events = roomData.timeline?.events || [];
                const newMessages = events
                  .filter((e: { type: string }) => e.type === 'm.room.message')
                  .map(eventToMessage);
                
                if (newMessages.length > 0) {
                  setMessages(prev => [...prev, ...newMessages]);
                }
              }
            }
          }
        } catch (err) {
          console.error('Sync error:', err);
          await new Promise(r => setTimeout(r, 5000));
        }
      }
    };

    startLongPoll();

    return () => {
      if (syncIntervalRef.current) {
        clearInterval(syncIntervalRef.current);
      }
    };
  }, [credentials, selectedRoom]);

  const processRooms = (joinedRooms: Record<string, unknown>) => {
    const roomList: MatrixRoom[] = Object.entries(joinedRooms).map(([roomId, data]: [string, unknown]) => {
      const roomData = data as {
        state?: { events?: Array<{ type: string; content: { name?: string; url?: string } }> };
        timeline?: { events?: Array<{ type: string; content: { body?: string }; origin_server_ts?: number }> };
        unread_notifications?: { notification_count?: number };
      };
      const stateEvents = roomData.state?.events || [];
      const nameEvent = stateEvents.find(e => e.type === 'm.room.name');
      const avatarEvent = stateEvents.find(e => e.type === 'm.room.avatar');
      
      const timelineEvents = roomData.timeline?.events || [];
      const lastMessageEvent = timelineEvents
        .filter(e => e.type === 'm.room.message')
        .pop();

      return {
        roomId,
        name: nameEvent?.content?.name || 'Чат',
        lastMessage: lastMessageEvent?.content?.body,
        unreadCount: roomData.unread_notifications?.notification_count || 0,
        avatarUrl: avatarEvent?.content?.url,
        timestamp: lastMessageEvent?.origin_server_ts
      };
    });

    setRooms(roomList.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0)));
  };

  const eventToMessage = (event: {
    event_id: string;
    sender: string;
    content: { body?: string; msgtype?: string };
    origin_server_ts: number;
  }): MatrixMessage => ({
    eventId: event.event_id,
    sender: event.sender,
    senderName: event.sender.split(':')[0].replace('@', ''),
    content: event.content.body || '',
    timestamp: event.origin_server_ts,
    type: event.content.msgtype === 'm.image' ? 'image' : 'text'
  });

  // Load room messages
  const loadRoomMessages = useCallback(async (roomId: string) => {
    if (!credentials) return;

    try {
      const params = new URLSearchParams({
        dir: 'b',
        limit: '50'
      });

      const response = await fetch(
        `${credentials.serverUrl}/_matrix/client/v3/rooms/${encodeURIComponent(roomId)}/messages?${params}`,
        {
          headers: { 'Authorization': `Bearer ${credentials.accessToken}` }
        }
      );

      if (response.ok) {
        const data = await response.json();
        const roomMessages = (data.chunk || [])
          .filter((e: { type: string }) => e.type === 'm.room.message')
          .map(eventToMessage)
          .reverse();
        
        setMessages(roomMessages);
      }
    } catch (err) {
      console.error('Failed to load messages:', err);
    }
  }, [credentials]);

  // Select room
  const handleSelectRoom = (roomId: string) => {
    setSelectedRoom(roomId);
    setMessages([]);
    loadRoomMessages(roomId);
  };

  // Send message
  const sendMessage = async () => {
    if (!credentials || !selectedRoom || !newMessage.trim() || sending) return;

    setSending(true);
    try {
      const txnId = `m${Date.now()}`;
      const response = await fetch(
        `${credentials.serverUrl}/_matrix/client/v3/rooms/${encodeURIComponent(selectedRoom)}/send/m.room.message/${txnId}`,
        {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${credentials.accessToken}`
          },
          body: JSON.stringify({
            msgtype: 'm.text',
            body: newMessage.trim()
          })
        }
      );

      if (response.ok) {
        const data = await response.json();
        
        // Add message locally
        const newMsg: MatrixMessage = {
          eventId: data.event_id,
          sender: credentials.userId,
          senderName: session?.user?.name || 'Вы',
          content: newMessage.trim(),
          timestamp: Date.now(),
          type: 'text'
        };
        
        setMessages(prev => [...prev, newMsg]);
        setNewMessage('');
        
        // Scroll to bottom
        setTimeout(() => {
          messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
        }, 100);
      }
    } catch (err) {
      console.error('Failed to send message:', err);
    } finally {
      setSending(false);
    }
  };

  // Auto scroll
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-full text-red-500">
        {error}
      </div>
    );
  }

  return (
    <div className="flex h-full bg-gray-50 dark:bg-gray-900">
      {/* Sidebar - Room List */}
      <div className="w-80 border-r border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 flex flex-col">
        <div className="p-4 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Чаты</h2>
        </div>
        
        <div className="flex-1 overflow-y-auto">
          {rooms.length === 0 ? (
            <div className="p-4 text-center text-gray-500 dark:text-gray-400">
              Нет активных чатов
            </div>
          ) : (
            rooms.map(room => (
              <button
                key={room.roomId}
                onClick={() => handleSelectRoom(room.roomId)}
                className={`w-full p-4 text-left hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors ${
                  selectedRoom === room.roomId ? 'bg-blue-50 dark:bg-blue-900/30' : ''
                }`}
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-blue-500 flex items-center justify-center text-white font-medium">
                    {room.name.charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-gray-900 dark:text-white truncate">
                        {room.name}
                      </span>
                      {room.unreadCount > 0 && (
                        <span className="ml-2 bg-blue-500 text-white text-xs px-2 py-0.5 rounded-full">
                          {room.unreadCount}
                        </span>
                      )}
                    </div>
                    {room.lastMessage && (
                      <p className="text-sm text-gray-500 dark:text-gray-400 truncate">
                        {room.lastMessage}
                      </p>
                    )}
                  </div>
                </div>
              </button>
            ))
          )}
        </div>
      </div>

      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col">
        {selectedRoom ? (
          <>
            {/* Chat Header */}
            <div className="p-4 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
              <h3 className="font-semibold text-gray-900 dark:text-white">
                {rooms.find(r => r.roomId === selectedRoom)?.name || 'Чат'}
              </h3>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {messages.map(msg => {
                const isOwn = msg.sender === credentials?.userId;
                return (
                  <div
                    key={msg.eventId}
                    className={`flex ${isOwn ? 'justify-end' : 'justify-start'}`}
                  >
                    <div
                      className={`max-w-[70%] rounded-2xl px-4 py-2 ${
                        isOwn
                          ? 'bg-blue-500 text-white'
                          : 'bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-white'
                      }`}
                    >
                      {!isOwn && (
                        <div className="text-xs font-medium mb-1 text-gray-600 dark:text-gray-300">
                          {msg.senderName}
                        </div>
                      )}
                      <p className="whitespace-pre-wrap break-words">{msg.content}</p>
                      <div className={`text-xs mt-1 ${isOwn ? 'text-blue-100' : 'text-gray-500 dark:text-gray-400'}`}>
                        {new Date(msg.timestamp).toLocaleTimeString('ru-RU', {
                          hour: '2-digit',
                          minute: '2-digit'
                        })}
                      </div>
                    </div>
                  </div>
                );
              })}
              <div ref={messagesEndRef} />
            </div>

            {/* Input */}
            <div className="p-4 border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
              <div className="flex gap-2">
                <input
                  type="text"
                  value={newMessage}
                  onChange={(e) => setNewMessage(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && sendMessage()}
                  placeholder="Введите сообщение..."
                  className="flex-1 px-4 py-2 rounded-full border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <button
                  onClick={sendMessage}
                  disabled={!newMessage.trim() || sending}
                  className="px-6 py-2 bg-blue-500 text-white rounded-full hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {sending ? (
                    <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                  ) : (
                    'Отправить'
                  )}
                </button>
              </div>
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-gray-500 dark:text-gray-400">
            Выберите чат для начала общения
          </div>
        )}
      </div>
    </div>
  );
}
