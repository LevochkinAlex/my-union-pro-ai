"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { useSession } from "next-auth/react";
import { io, Socket } from "socket.io-client";
import { Chat, Message } from "@/types/chat";

interface TypingUser {
  userId: string;
  userName: string;
}

interface UseChatOptions {
  onError?: (error: string) => void;
}

export function useChat(options: UseChatOptions = {}) {
  const { data: session } = useSession();
  const [chats, setChats] = useState<Chat[]>([]);
  const [selectedChat, setSelectedChat] = useState<Chat | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [sending, setSending] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [oldestMessageId, setOldestMessageId] = useState<string | null>(null);
  const [typingUsers, setTypingUsers] = useState<TypingUser[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  
  const socketRef = useRef<Socket | null>(null);
  const messagesRef = useRef<Message[]>([]);
  const selectedChatRef = useRef<Chat | null>(null);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Синхронизация refs
  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  useEffect(() => {
    selectedChatRef.current = selectedChat;
  }, [selectedChat]);

  // Инициализация WebSocket
  useEffect(() => {
    if (!session?.user) return;

    const token = (session as any)?.accessToken;
    if (!token) {
      console.warn("[useChat] No access token, using polling mode");
      return;
    }

    const socketUrl = process.env.NEXT_PUBLIC_SOCKET_URL || 
      (typeof window !== "undefined" ? `${window.location.protocol}//${window.location.hostname}:3005` : "");

    console.log("[useChat] Connecting to socket:", socketUrl);

    const socket = io(socketUrl, {
      auth: { token },
      transports: ["websocket", "polling"],
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
    });

    socketRef.current = socket;

    socket.on("connect", () => {
      console.log("[useChat] ✅ Socket connected");
      setIsConnected(true);
      
      // Переподключаемся к текущему чату
      if (selectedChatRef.current) {
        socket.emit("chat:join", selectedChatRef.current.id);
      }
    });

    socket.on("disconnect", () => {
      console.log("[useChat] ❌ Socket disconnected");
      setIsConnected(false);
    });

    socket.on("connect_error", (error) => {
      console.error("[useChat] Socket error:", error.message);
    });

    // Новое сообщение
    socket.on("message:new", (message: Message) => {
      console.log("[useChat] 📨 New message via socket");
      
      // Добавляем только если это для текущего чата и сообщение ещё не существует
      setMessages(prev => {
        if (prev.some(m => m.id === message.id)) return prev;
        return [...prev, message];
      });

      // Обновляем превью чата
      setChats(prev => prev.map(chat =>
        chat.id === message.chatId
          ? { ...chat, lastMessage: message.content || "[Файл]", lastMessageAt: new Date() }
          : chat
      ));
    });

    // Сообщение обновлено
    socket.on("message:updated", (message: Message) => {
      setMessages(prev => prev.map(m => m.id === message.id ? message : m));
    });

    // Сообщение удалено
    socket.on("message:deleted", ({ messageId }) => {
      setMessages(prev => prev.map(m =>
        m.id === messageId ? { ...m, deletedAt: new Date().toISOString() } : m
      ));
    });

    // Typing индикаторы
    socket.on("typing:start", ({ chatId, userId, userName }) => {
      if (chatId === selectedChatRef.current?.id) {
        setTypingUsers(prev => {
          if (prev.some(u => u.userId === userId)) return prev;
          return [...prev, { userId, userName }];
        });
      }
    });

    socket.on("typing:stop", ({ chatId, userId }) => {
      if (chatId === selectedChatRef.current?.id) {
        setTypingUsers(prev => prev.filter(u => u.userId !== userId));
      }
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [session]);

  // Загрузка списка чатов
  const loadChats = useCallback(async () => {
    try {
      const response = await fetch("/api/chat");
      if (response.ok) {
        const data = await response.json();
        setChats(data.chats || []);
      }
    } catch (error) {
      console.error("[useChat] Error loading chats:", error);
      options.onError?.("Ошибка загрузки чатов");
    } finally {
      setLoading(false);
    }
  }, [options]);

  // Загрузка сообщений чата (HTTP - для первоначальной загрузки)
  const loadMessages = useCallback(async (chatId: string) => {
    setLoadingMessages(true);
    try {
      const response = await fetch(`/api/chat/${chatId}?limit=50&t=${Date.now()}`);
      if (response.ok) {
        const data = await response.json();
        setMessages(data.messages || []);
        setHasMore(data.pagination?.hasMore || false);
        setOldestMessageId(data.pagination?.oldestMessageId || null);

        // Помечаем как прочитанные
        try {
          await fetch(`/api/chat/${chatId}/read`, { method: "POST" });
          setChats(prev => prev.map(chat =>
            chat.id === chatId ? { ...chat, unreadCount: 0 } : chat
          ));
        } catch (e) {
          console.error("[useChat] Error marking as read:", e);
        }
      }
    } catch (error) {
      console.error("[useChat] Error loading messages:", error);
      options.onError?.("Ошибка загрузки сообщений");
    } finally {
      setLoadingMessages(false);
    }
  }, [options]);

  // Загрузка старых сообщений
  const loadOlderMessages = useCallback(async () => {
    if (!selectedChat || !oldestMessageId || loadingOlder) return;

    setLoadingOlder(true);
    try {
      const response = await fetch(
        `/api/chat/${selectedChat.id}?limit=50&cursor=${oldestMessageId}&direction=older&t=${Date.now()}`
      );

      if (response.ok) {
        const data = await response.json();
        const olderMessages = data.messages || [];

        if (olderMessages.length > 0) {
          setMessages(prev => [...olderMessages, ...prev]);
          setHasMore(data.pagination?.hasMore || false);
          setOldestMessageId(data.pagination?.oldestMessageId || null);
          return { loadedCount: olderMessages.length };
        } else {
          setHasMore(false);
        }
      }
    } catch (error) {
      console.error("[useChat] Error loading older messages:", error);
    } finally {
      setLoadingOlder(false);
    }
  }, [selectedChat, oldestMessageId, loadingOlder]);

  // Выбор чата
  const selectChat = useCallback((chat: Chat | null) => {
    // Покидаем предыдущий чат
    if (selectedChatRef.current && socketRef.current) {
      socketRef.current.emit("chat:leave", selectedChatRef.current.id);
    }

    setSelectedChat(chat);
    setMessages([]);
    setHasMore(false);
    setOldestMessageId(null);
    setTypingUsers([]);

    if (chat) {
      // Присоединяемся к новому чату через сокет
      if (socketRef.current?.connected) {
        socketRef.current.emit("chat:join", chat.id);
      }
      loadMessages(chat.id);
    }
  }, [loadMessages]);

  // Создание или открытие чата
  const createOrOpenChat = useCallback(async (userId: string): Promise<Chat | null> => {
    try {
      const existingChat = chats.find(c => c.otherUser?.id === userId);
      if (existingChat) {
        selectChat(existingChat);
        return existingChat;
      }

      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ participantId: userId }),
      });

      if (response.ok) {
        const data = await response.json();
        const newChat = data.chat;

        setChats(prev => {
          const exists = prev.some(c => c.id === newChat.id);
          return exists ? prev : [newChat, ...prev];
        });

        selectChat(newChat);
        return newChat;
      }
    } catch (error) {
      console.error("[useChat] Error creating chat:", error);
      options.onError?.("Ошибка создания чата");
    }
    return null;
  }, [chats, selectChat, options]);

  // Отправка сообщения
  const sendMessage = useCallback(async (
    content: string,
    file?: File,
    replyToId?: string
  ): Promise<boolean> => {
    if (!selectedChat) return false;

    setSending(true);

    try {
      // Для файлов используем HTTP
      if (file) {
        const formData = new FormData();
        formData.append("content", content);
        formData.append("file", file);
        if (replyToId) formData.append("replyToId", replyToId);

        const response = await fetch(`/api/chat/${selectedChat.id}/attachments`, {
          method: "POST",
          body: formData,
        });

        if (response.ok) {
          const data = await response.json();
          // Сообщение придёт через сокет, но для надёжности добавим сразу
          setMessages(prev => {
            if (prev.some(m => m.id === data.message.id)) return prev;
            return [...prev, data.message];
          });
          return true;
        }
      } else {
        // Для текста можно использовать сокет (быстрее) или HTTP
        if (socketRef.current?.connected) {
          // Отправка через WebSocket
          return new Promise((resolve) => {
            socketRef.current!.emit(
              "message:send" as any,
              { chatId: selectedChat.id, content, replyToId },
              (response: any) => {
                setSending(false);
                if (response.success) {
                  // Сообщение придёт через событие message:new
                  resolve(true);
                } else {
                  options.onError?.(response.error || "Ошибка отправки");
                  resolve(false);
                }
              }
            );
          });
        } else {
          // Fallback на HTTP
          const response = await fetch(`/api/chat/${selectedChat.id}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ content, replyToId }),
          });

          if (response.ok) {
            const data = await response.json();
            setMessages(prev => {
              if (prev.some(m => m.id === data.message.id)) return prev;
              return [...prev, data.message];
            });
            return true;
          }
        }
      }
    } catch (error) {
      console.error("[useChat] Error sending message:", error);
      options.onError?.("Ошибка отправки сообщения");
    } finally {
      setSending(false);
    }
    return false;
  }, [selectedChat, options]);

  // Индикатор печатания
  const sendTyping = useCallback(() => {
    if (!selectedChat || !socketRef.current?.connected) return;

    socketRef.current.emit("typing:start", selectedChat.id);

    // Автоматически останавливаем через 2 сек после последнего вызова
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }
    typingTimeoutRef.current = setTimeout(() => {
      if (selectedChatRef.current && socketRef.current?.connected) {
        socketRef.current.emit("typing:stop", selectedChatRef.current.id);
      }
    }, 2000);
  }, [selectedChat]);

  // Редактирование сообщения
  const editMessage = useCallback(async (
    messageId: string,
    content: string
  ): Promise<boolean> => {
    if (!selectedChat) return false;

    try {
      const response = await fetch(`/api/chat/${selectedChat.id}/messages/${messageId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content }),
      });

      if (response.ok) {
        const data = await response.json();
        setMessages(prev => prev.map(m => m.id === messageId ? data.message : m));
        return true;
      }
    } catch (error) {
      console.error("[useChat] Error editing message:", error);
      options.onError?.("Ошибка редактирования");
    }
    return false;
  }, [selectedChat, options]);

  // Удаление сообщения
  const deleteMessage = useCallback(async (messageId: string): Promise<boolean> => {
    if (!selectedChat) return false;

    try {
      const response = await fetch(`/api/chat/${selectedChat.id}/messages/${messageId}`, {
        method: "DELETE",
      });

      if (response.ok) {
        setMessages(prev => prev.map(m =>
          m.id === messageId ? { ...m, deletedAt: new Date().toISOString() } : m
        ));
        return true;
      }
    } catch (error) {
      console.error("[useChat] Error deleting message:", error);
      options.onError?.("Ошибка удаления");
    }
    return false;
  }, [selectedChat, options]);

  // Реакция на сообщение
  const toggleReaction = useCallback(async (
    messageId: string,
    emoji: string
  ): Promise<boolean> => {
    if (!selectedChat) return false;

    try {
      const response = await fetch(`/api/chat/${selectedChat.id}/messages/${messageId}/reactions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ emoji }),
      });

      if (response.ok) {
        const data = await response.json();
        setMessages(prev => prev.map(m =>
          m.id === messageId ? { ...m, reactions: data.reactions } : m
        ));
        return true;
      }
    } catch (error) {
      console.error("[useChat] Error toggling reaction:", error);
      options.onError?.("Ошибка реакции");
    }
    return false;
  }, [selectedChat, options]);

  // Пересылка сообщения
  const forwardMessage = useCallback(async (
    messageId: string,
    targetUserId: string
  ): Promise<boolean> => {
    try {
      const response = await fetch("/api/chat/forward", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messageId, targetUserId }),
      });

      if (response.ok) {
        await loadChats();
        return true;
      }
    } catch (error) {
      console.error("[useChat] Error forwarding:", error);
      options.onError?.("Ошибка пересылки");
    }
    return false;
  }, [loadChats, options]);

  // Хранение позиций скролла
  const scrollPositionsRef = useRef<Map<string, number>>(new Map());
  const saveScrollPosition = useCallback((chatId: string, position: number) => {
    scrollPositionsRef.current.set(chatId, position);
  }, []);
  const getScrollPosition = useCallback((chatId: string): number | null => {
    return scrollPositionsRef.current.get(chatId) ?? null;
  }, []);

  // Очистка
  useEffect(() => {
    return () => {
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }
    };
  }, []);

  return {
    // Состояние
    chats,
    selectedChat,
    messages,
    loading,
    loadingMessages,
    loadingOlder,
    sending,
    hasMore,
    typingUsers,
    isConnected,
    isBotTyping: typingUsers.length > 0,

    // Действия
    loadChats,
    loadMessages,
    loadOlderMessages,
    selectChat,
    createOrOpenChat,
    sendMessage,
    sendTyping,
    editMessage,
    deleteMessage,
    toggleReaction,
    forwardMessage,

    // Скролл
    saveScrollPosition,
    getScrollPosition,
  };
}
