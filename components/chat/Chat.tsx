'use client';

/**
 * Компонент чата с HeroUI
 */

import { useState, useEffect, useCallback } from 'react';
import { useSession } from 'next-auth/react';
import { useSearchParams } from 'next/navigation';
import { useTheme } from 'next-themes';
import { io, Socket } from 'socket.io-client';
import {
  Card,
  CardBody,
  CardHeader,
  Avatar,
  Spinner,
  Chip,
} from '@heroui/react';
import { MessageCircle } from 'lucide-react';
import ChatSidebar from './ChatSidebar';
import ChatMessages from './ChatMessages';
import ChatInput from './ChatInput';

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
  const { resolvedTheme } = useTheme();
  const searchParams = useSearchParams();
  const urlChatId = searchParams.get('chatId');

  const [rooms, setRooms] = useState<any[]>([]);
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
        const room = data.rooms?.find((r: any) => r.id === urlChatId);
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
        token: session.user.id,
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
      if (message.senderId === session.user.id) return;
      
      setMessages(prev => {
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
  const roomName = selectedRoom?.name || selectedRoom?.displayName || 'Без названия';
  const roomAvatar = selectedRoom?.avatarUrl || null;

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <Spinner size="lg" color="primary" />
          <p className="text-foreground-500">Загрузка чатов...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-background">
      {/* Sidebar */}
      <ChatSidebar
        rooms={rooms}
        selectedChatId={selectedChatId}
        onSelectChat={setSelectedChatId}
      />

      {/* Main chat area */}
      <div className="flex-1 flex flex-col min-w-0">
        {selectedRoom ? (
          <>
            {/* Header */}
            <Card className="rounded-none border-b border-divider shadow-none">
              <CardHeader className="px-4 py-3">
                <div className="flex items-center gap-3 w-full">
                  <Avatar
                    src={roomAvatar}
                    name={roomName}
                    size="md"
                    className="flex-shrink-0"
                  />
                  <div className="flex-1 min-w-0">
                    <h2 className="text-lg font-semibold text-foreground truncate">
                      {roomName}
                    </h2>
                    {selectedRoom.isDirect && (
                      <p className="text-sm text-foreground-500">
                        Личный чат
                      </p>
                    )}
                  </div>
                  {(selectedRoom.unreadCount || 0) > 0 && (
                    <Chip
                      size="sm"
                      color="primary"
                      variant="flat"
                    >
                      {selectedRoom.unreadCount}
                    </Chip>
                  )}
                </div>
              </CardHeader>
            </Card>

            {/* Messages */}
            <div className="flex-1 overflow-hidden">
              <ChatMessages
                messages={messages}
                currentUserId={session?.user?.id || ''}
                typingUsers={typingUsers}
              />
            </div>

            {/* Input */}
            <ChatInput
              onSend={handleSendMessage}
              disabled={!socket}
            />
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center">
            <Card className="max-w-md">
              <CardBody className="text-center py-12">
                <MessageCircle className="w-16 h-16 mx-auto mb-4 text-default-400" />
                <h3 className="text-xl font-semibold text-foreground mb-2">
                  Выберите чат
                </h3>
                <p className="text-foreground-500">
                  Выберите чат из списка для начала общения
                </p>
              </CardBody>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}
