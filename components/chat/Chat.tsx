'use client';

/**
 * Новый чистый компонент чата
 * Полностью переписан с нуля без Matrix
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { useSession } from 'next-auth/react';
import { useSearchParams } from 'next/navigation';
import { io, Socket } from 'socket.io-client';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import ChatSidebar from './ChatSidebar';
import ChatMessages from './ChatMessages';
import ChatInput from './ChatInput';

interface ChatRoom {
  id: string;
  name: string;
  avatarUrl?: string;
  type: 'PRIVATE' | 'GROUP' | 'TICKET';
  lastMessage?: {
    content: string;
    createdAt: Date;
  };
  unreadCount: number;
  isDirect: boolean;
  isTicket?: boolean;
  ticketId?: string;
}

interface Message {
  id: string;
  senderId: string;
  sender: {
    id: string;
    firstName?: string;
    lastName?: string;
    avatarUrl?: string;
  };
  content: string;
  messageType: string;
  createdAt: Date;
  replyTo?: {
    id: string;
    content: string;
    sender: {
      firstName?: string;
      lastName?: string;
    };
  };
  threadRepliesCount?: number;
  reactions?: Record<string, { count: number; userIds: string[] }>;
  attachments?: Array<{
    type: string;
    url: string;
    name: string;
  }>;
  editedAt?: Date;
}

export default function Chat() {
  const { data: session } = useSession();
  const searchParams = useSearchParams();
  const urlChatId = searchParams.get('chatId');

  const [rooms, setRooms] = useState<ChatRoom[]>([]);
  const [selectedChatId, setSelectedChatId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [socket, setSocket] = useState<Socket | null>(null);
  const [typingUsers, setTypingUsers] = useState<Set<string>>(new Set());

  // Загрузка списка чатов
  const loadRooms = useCallback(async () => {
    try {
      const response = await fetch('/api/chat/rooms');
      if (!response.ok) return;
      
      const data = await response.json();
      setRooms(data.rooms || []);
      
      // Если есть chatId в URL, открываем его
      if (urlChatId && !selectedChatId) {
        const room = data.rooms?.find((r: ChatRoom) => r.id === urlChatId);
        if (room) {
          setSelectedChatId(urlChatId);
        }
      }
    } catch (error) {
      console.error('Failed to load rooms:', error);
    } finally {
      setLoading(false);
    }
  }, [urlChatId, selectedChatId]);

  // Загрузка сообщений
  const loadMessages = useCallback(async (chatId: string) => {
    try {
      const response = await fetch(`/api/chat/${chatId}/messages?limit=50`);
      if (!response.ok) return;
      
      const data = await response.json();
      setMessages(data.messages || []);
    } catch (error) {
      console.error('Failed to load messages:', error);
    }
  }, []);

  // Инициализация WebSocket
  useEffect(() => {
    if (!session?.user?.id) return;

    const socketUrl = process.env.NEXT_PUBLIC_SOCKET_URL || 'http://localhost:3005';
    const newSocket = io(socketUrl, {
      auth: {
        token: session.user.id, // В реальности нужен JWT токен
      },
      transports: ['websocket'],
    });

    newSocket.on('connect', () => {
      console.log('[Chat] WebSocket connected');
    });

    newSocket.on('disconnect', () => {
      console.log('[Chat] WebSocket disconnected');
    });

    // Новое сообщение
    newSocket.on('message:new', (message: Message) => {
      if (message.senderId === session.user.id) return; // Свое сообщение уже добавлено
      
      setMessages(prev => {
        // Проверяем, нет ли уже такого сообщения
        if (prev.some(m => m.id === message.id)) return prev;
        return [...prev, message].sort((a, b) => 
          new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
        );
      });
    });

    // Обновление сообщения
    newSocket.on('message:updated', (message: Message) => {
      setMessages(prev => prev.map(m => m.id === message.id ? message : m));
    });

    // Удаление сообщения
    newSocket.on('message:deleted', ({ messageId }: { messageId: string }) => {
      setMessages(prev => prev.filter(m => m.id !== messageId));
    });

    // Печатает
    newSocket.on('typing:start', ({ userId }: { userId: string }) => {
      setTypingUsers(prev => new Set(prev).add(userId));
    });

    newSocket.on('typing:stop', ({ userId }: { userId: string }) => {
      setTypingUsers(prev => {
        const next = new Set(prev);
        next.delete(userId);
        return next;
      });
    });

    setSocket(newSocket);

    return () => {
      newSocket.close();
    };
  }, [session]);

  // Присоединение к чату при выборе
  useEffect(() => {
    if (!socket || !selectedChatId) return;

    socket.emit('chat:join', selectedChatId);
    loadMessages(selectedChatId);

    return () => {
      socket.emit('chat:leave', selectedChatId);
    };
  }, [socket, selectedChatId, loadMessages]);

  // Загрузка комнат при монтировании
  useEffect(() => {
    loadRooms();
  }, [loadRooms]);

  // Отправка сообщения
  const handleSendMessage = useCallback(async (content: string, replyToId?: string) => {
    if (!selectedChatId || !content.trim() || !socket) return;

    try {
      socket.emit('message:send', {
        chatId: selectedChatId,
        content: content.trim(),
        replyToId,
      }, (response: { success: boolean; message?: Message; error?: string }) => {
        if (response.success && response.message) {
          setMessages(prev => [...prev, response.message!]);
        } else {
          console.error('Failed to send message:', response.error);
        }
      });
    } catch (error) {
      console.error('Error sending message:', error);
    }
  }, [selectedChatId, socket]);

  const selectedRoom = rooms.find(r => r.id === selectedChatId);

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="text-gray-500">Загрузка чатов...</div>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-gray-50 dark:bg-gray-900">
      {/* Sidebar */}
      <ChatSidebar
        rooms={rooms}
        selectedChatId={selectedChatId}
        onSelectChat={setSelectedChatId}
      />

      {/* Main chat area */}
      <div className="flex-1 flex flex-col">
        {selectedRoom ? (
          <>
            {/* Header */}
            <div className="h-16 border-b border-gray-200 dark:border-gray-700 flex items-center px-4 bg-white dark:bg-gray-800">
              <div className="flex items-center gap-3">
                {selectedRoom.avatarUrl && (
                  <img
                    src={selectedRoom.avatarUrl}
                    alt={selectedRoom.name}
                    className="w-10 h-10 rounded-full"
                  />
                )}
                <div>
                  <h2 className="font-semibold text-gray-900 dark:text-white">
                    {selectedRoom.name}
                  </h2>
                  {selectedRoom.isDirect && (
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                      Личный чат
                    </p>
                  )}
                </div>
              </div>
            </div>

            {/* Messages */}
            <ChatMessages
              messages={messages}
              currentUserId={session?.user?.id || ''}
              typingUsers={typingUsers}
            />

            {/* Input */}
            <ChatInput
              onSend={handleSendMessage}
              disabled={!socket}
            />
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <p className="text-gray-500 dark:text-gray-400 mb-4">
                Выберите чат для начала общения
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
