"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { useSession } from "next-auth/react";
import { io, Socket } from "socket.io-client";
import { Chat, Message } from "@/types/chat";
import { fetchJsonWithRetry } from "@/lib/api-client";

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

  // Периодическое обновление онлайн статуса
  useEffect(() => {
    if (!session?.user?.id) return;

    const updateOnlineStatus = async () => {
      try {
        await fetch('/api/users/online-status', { method: 'POST' });
      } catch (error) {
        // Игнорируем ошибки
      }
    };

    // Обновляем сразу
    updateOnlineStatus();

    // Затем каждые 30 секунд для более точного трекинга
    const interval = setInterval(updateOnlineStatus, 30 * 1000);

    return () => clearInterval(interval);
  }, [session?.user?.id]);

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
      console.warn("[useChat] Socket connection error (will use HTTP fallback):", error.message);
      setIsConnected(false);
      // Не прерываем работу - используем HTTP fallback
    });

    // Новое сообщение
    socket.on("message:new", (message: Message) => {
      console.log("[useChat] 📨 New message via socket");
      
      // Добавляем только если сообщение ещё не существует
      setMessages(prev => {
        if (prev.some(m => m.id === message.id)) return prev;
        return [...prev, message];
      });

      // Обновляем превью текущего чата
      const currentChatId = selectedChatRef.current?.id;
      if (currentChatId) {
        setChats(prev => prev.map(chat =>
          chat.id === currentChatId
            ? { ...chat, lastMessage: message.content || "[Файл]", lastMessageAt: new Date() }
            : chat
        ));
      }
    });

    // Сообщение обновлено
    socket.on("message:updated", (message: Message) => {
      setMessages(prev => prev.map(m => {
        if (m.id === message.id) {
          // Сохраняем senderId из старого сообщения, если его нет в новом
          return {
            ...message,
            senderId: message.senderId || m.senderId,
          };
        }
        return m;
      }));
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
      const data = await fetchJsonWithRetry<{ chats: Chat[] }>("/api/chat", {
        method: "GET",
        headers: { "Content-Type": "application/json" },
      });
      
      if (data?.chats) {
        console.log("[useChat] ========== CLIENT CHAT LOADING ==========");
        console.log("[useChat] ✅ Loaded chats:", data.chats.length);
        console.log("[useChat] Chats breakdown:", {
          PRIVATE: data.chats.filter((c: Chat) => c.type === "PRIVATE").length,
          GROUP: data.chats.filter((c: Chat) => c.type === "GROUP").length,
          CHANNEL: data.chats.filter((c: Chat) => c.type === "CHANNEL").length,
          AI: data.chats.filter((c: Chat) => c.name === "ИИ-Ассистент").length,
        });
        console.log("[useChat] Chats details:", data.chats.map((c: Chat) => ({
          id: c.id,
          type: c.type,
          name: c.name || (c as any).displayName,
          hasLastMessage: !!(c as any).lastMessage,
          lastMessageAt: (c as any).lastMessageAt,
          unreadCount: (c as any).unreadCount || 0,
          otherUser: (c as any).otherUser?.id || null,
        })));
        setChats(data.chats);
      } else if (data === null) {
        // Если data null, значит была ошибка при запросе
        console.error("[useChat] ❌ Failed to load chats - data is null (request failed)");
        options.onError?.("Ошибка загрузки чатов");
        // Не обновляем чаты, чтобы сохранить существующие при временных ошибках
      } else if (data && !data.chats) {
        // Если data есть, но chats нет - устанавливаем пустой массив
        console.warn("[useChat] ⚠️ Response received but no chats field:", data);
        setChats([]);
      } else {
        // Неожиданный случай
        console.error("[useChat] ❌ Unexpected response format:", data);
        options.onError?.("Ошибка загрузки чатов");
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
      const data = await fetchJsonWithRetry<{ 
        messages: Message[]; 
        hasMore: boolean; 
        chat?: Chat;
        pagination?: { hasMore: boolean; oldestMessageId: string | null } 
      }>(
        `/api/chat/${chatId}?limit=50&t=${Date.now()}`,
        {
          method: "GET",
          headers: { "Content-Type": "application/json" },
        }
      );
      
      if (data) {
        setMessages(data.messages || []);
        setHasMore((data as any).pagination?.hasMore ?? (data as any).hasMore ?? false);
        setOldestMessageId((data as any).pagination?.oldestMessageId || null);

        // Обновляем информацию о чате, если она пришла (включая информацию об обращении)
        if (data.chat) {
          setSelectedChat(prev => prev?.id === chatId ? { ...prev, ...data.chat } : prev);
          setChats(prev => prev.map(chat =>
            chat.id === chatId ? { ...chat, ...data.chat } : chat
          ));
        }

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
      const data = await fetchJsonWithRetry<{ messages: Message[]; pagination?: { hasMore: boolean; oldestMessageId: string | null } }>(
        `/api/chat/${selectedChat.id}?limit=50&cursor=${oldestMessageId}&direction=older&t=${Date.now()}`,
        {
          method: "GET",
          headers: { "Content-Type": "application/json" },
        }
      );

      if (data) {
        const olderMessages = data.messages || [];

        if (olderMessages.length > 0) {
          setMessages(prev => [...olderMessages, ...prev]);
          setHasMore((data as any).pagination?.hasMore || false);
          setOldestMessageId((data as any).pagination?.oldestMessageId || null);
          return { loadedCount: olderMessages.length };
        } else {
          setHasMore(false);
        }
      } else {
        console.warn("[useChat] Failed to load older messages");
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

      console.log('[useChat] Creating chat with userId:', userId);
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetUserId: userId }), // ИСПРАВЛЕНО: было participantId, должно быть targetUserId
      });

      console.log('[useChat] Response status:', response.status);

      if (!response.ok) {
        const errorText = await response.text();
        let errorData;
        try {
          errorData = JSON.parse(errorText);
        } catch {
          errorData = { error: errorText || 'Unknown error' };
        }
        console.error('[useChat] Chat creation failed:', response.status, errorData);
        options.onError?.(errorData.error || `Ошибка создания чата: ${response.status}`);
        return null;
      }

      const data = await response.json();
      console.log('[useChat] Chat created successfully:', data);
      
      if (!data.chat) {
        console.error('[useChat] No chat in response:', data);
        options.onError?.("Сервер не вернул данные чата");
        return null;
      }

      const newChat = data.chat;

      setChats(prev => {
        const exists = prev.some(c => c.id === newChat.id);
        return exists ? prev : [newChat, ...prev];
      });

      selectChat(newChat);
      return newChat;
    } catch (error) {
      console.error("[useChat] Error creating chat:", error);
      options.onError?.("Ошибка создания чата: " + (error instanceof Error ? error.message : 'Unknown error'));
    }
    return null;
  }, [chats, selectChat, options]);

  // Отправка сообщения
  const sendMessage = useCallback(async (
    content: string,
    file?: File,
    replyToId?: string,
    threadRootId?: string,
    mentionedUserIds?: string[]
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
        if (threadRootId) formData.append("threadRootId", threadRootId);

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
          // Отправка через WebSocket с таймаутом
          return new Promise((resolve) => {
            const timeout = setTimeout(() => {
              console.warn("[useChat] WebSocket send timeout, falling back to HTTP");
              // Fallback на HTTP если сокет не отвечает
              fetch(`/api/chat/${selectedChat.id}`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ content, replyToId, threadRootId }),
              })
                .then(async (res) => {
                  if (res.ok) {
                    const data = await res.json();
                    setMessages(prev => {
                      if (prev.some(m => m.id === data.message.id)) return prev;
                      return [...prev, data.message];
                    });
                    loadChats();
                    resolve(true);
                  } else {
                    options.onError?.("Ошибка отправки сообщения");
                    resolve(false);
                  }
                })
                .catch(() => {
                  options.onError?.("Ошибка отправки сообщения");
                  resolve(false);
                })
                .finally(() => setSending(false));
            }, 3000); // 3 секунды таймаут

            socketRef.current!.emit(
              "message:send" as any,
              { chatId: selectedChat.id, content, replyToId, threadRootId },
              (response: any) => {
                clearTimeout(timeout);
                setSending(false);
                if (response.success) {
                  // Сообщение придёт через событие message:new
                  resolve(true);
                } else {
                  // Если сокет вернул ошибку, пробуем HTTP
                  fetch(`/api/chat/${selectedChat.id}`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ content, replyToId }),
                  })
                    .then(async (res) => {
                      if (res.ok) {
                        const data = await res.json();
                        setMessages(prev => {
                          if (prev.some(m => m.id === data.message.id)) return prev;
                          return [...prev, data.message];
                        });
                        loadChats();
                        resolve(true);
                      } else {
                        options.onError?.(response.error || "Ошибка отправки");
                        resolve(false);
                      }
                    })
                    .catch(() => {
                      options.onError?.(response.error || "Ошибка отправки");
                      resolve(false);
                    });
                }
              }
            );
          });
        } else {
          // Fallback на HTTP если WebSocket не подключен
          console.log("[useChat] Using HTTP fallback for message send");
          try {
            const response = await fetch(`/api/chat/${selectedChat.id}`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ 
                content, 
                replyToId, 
                threadRootId,
                mentionedUserIds: mentionedUserIds || undefined,
              }),
            });

            if (response.ok) {
              const data = await response.json();
              if (data.message) {
                setMessages(prev => {
                  if (prev.some(m => m.id === data.message.id)) return prev;
                  return [...prev, data.message];
                });
                // Обновляем список чатов
                loadChats();
                return true;
              } else {
                console.error("[useChat] Response OK but no message:", data);
                options.onError?.("Сообщение не было создано");
                return false;
              }
            } else {
              const errorText = await response.text();
              let errorData;
              try {
                errorData = JSON.parse(errorText);
              } catch {
                errorData = { error: errorText || "Ошибка отправки сообщения" };
              }
              console.error("[useChat] HTTP send error:", response.status, errorData);
              options.onError?.(errorData.error || `Ошибка ${response.status}: ${response.statusText}`);
              return false;
            }
          } catch (fetchError: any) {
            console.error("[useChat] Fetch error:", fetchError);
            options.onError?.("Ошибка сети при отправке сообщения");
            return false;
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
        setMessages(prev => prev.map(m => {
          if (m.id === messageId) {
            // Сохраняем senderId из старого сообщения, если его нет в новом
            return {
              ...data.message,
              senderId: data.message.senderId || m.senderId,
            };
          }
          return m;
        }));
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

    // Оптимистичное обновление - сразу обновляем UI
    setMessages(prev => prev.map(m => {
      if (m.id === messageId) {
        const currentReactions = m.reactions || {};
        const emojiReactions = currentReactions[emoji] || { userIds: [] };
        const userId = session?.user?.id;
        const currentUserIds = emojiReactions.userIds || [];
        const currentCount = ('count' in emojiReactions && typeof emojiReactions.count === 'number') 
          ? emojiReactions.count 
          : currentUserIds.length;
        
        // Проверяем, есть ли уже реакция от текущего пользователя
        const hasReaction = userId && currentUserIds.includes(userId);
        
        let newReactions: Record<string, { count?: number; userIds: string[] }>;
        if (hasReaction) {
          // Удаляем реакцию
          const newUserIds = currentUserIds.filter(id => id !== userId);
          if (newUserIds.length === 0) {
            // Удаляем эмодзи, если больше нет реакций
            const { [emoji]: _, ...rest } = currentReactions;
            newReactions = rest as Record<string, { count?: number; userIds: string[] }>;
          } else {
            newReactions = {
              ...currentReactions,
              [emoji]: {
                count: currentCount - 1,
                userIds: newUserIds,
              },
            };
          }
        } else {
          // Добавляем реакцию
          newReactions = {
            ...currentReactions,
            [emoji]: {
              count: currentCount + 1,
              userIds: userId ? [...currentUserIds, userId] : currentUserIds,
            },
          };
        }
        
        return { ...m, reactions: newReactions };
      }
      return m;
    }));

    try {
      const response = await fetch(`/api/chat/${selectedChat.id}/messages/${messageId}/reactions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ emoji }),
      });

      if (response.ok) {
        const data = await response.json();
        // Синхронизируем с сервером (на случай если что-то пошло не так)
        setMessages(prev => prev.map(m =>
          m.id === messageId ? { ...m, reactions: data.reactions } : m
        ));
        return true;
      } else {
        // Если ошибка, откатываем оптимистичное обновление
        loadMessages(selectedChat.id);
      }
    } catch (error) {
      console.error("[useChat] Error toggling reaction:", error);
      // Откатываем оптимистичное обновление при ошибке
      loadMessages(selectedChat.id);
      options.onError?.("Ошибка реакции");
    }
    return false;
  }, [selectedChat, session?.user?.id, loadMessages, options]);

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
        const data = await response.json();
        if (data.success) {
          // Обновляем список чатов и сообщения в целевом чате
          await loadChats();
          // Если целевой чат открыт, обновляем его сообщения
          if (selectedChatRef.current?.otherUser?.id === targetUserId) {
            await loadMessages(selectedChatRef.current.id);
          }
          return true;
        } else {
          const errorMsg = data.error || "Ошибка пересылки";
          console.error("[useChat] Forward error:", errorMsg);
          options.onError?.(errorMsg);
          return false;
        }
      } else {
        const errorData = await response.json().catch(() => ({ error: "Ошибка пересылки" }));
        const errorMsg = errorData.error || `Ошибка ${response.status}`;
        console.error("[useChat] Forward HTTP error:", response.status, errorMsg);
        options.onError?.(errorMsg);
        return false;
      }
    } catch (error) {
      console.error("[useChat] Error forwarding:", error);
      options.onError?.("Ошибка пересылки");
      return false;
    }
  }, [loadChats, loadMessages, options]);

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
