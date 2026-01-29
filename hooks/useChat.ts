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

/** Чат бота/ИИ-ассистента не учитывается в бейдже непрочитанных */
function isExcludedFromUnreadBadge(c: {
  name?: string | null;
  displayName?: string | null;
  otherUser?: { id?: string; firstName?: string | null; lastName?: string | null } | null;
}) {
  const n = (c.name ?? '') || (c.displayName ?? '');
  const ou = c.otherUser;
  return (
    n.includes('МойСоюз Помощник') ||
    n.includes('ИИ-Ассистент') ||
    n.includes('AI Помощник') ||
    ou?.id === 'ai-assistant-bot' ||
    (ou?.firstName === 'AI' && ou?.lastName === 'Помощник')
  );
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
  const [aiTyping, setAiTyping] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  
  const socketRef = useRef<Socket | null>(null);
  const messagesRef = useRef<Message[]>([]);
  const selectedChatRef = useRef<Chat | null>(null);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const reloadChatsTimeoutRef = useRef<NodeJS.Timeout | null>(null);

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
        
        // КРИТИЧЕСКОЕ ИСПРАВЛЕНИЕ: Отправляем событие с общим количеством непрочитанных для обновления бейджа.
        // Не учитываем чаты бота и ИИ-Ассистент (МойСоюз Помощник, ИИ-Ассистент).
        const chatsWithUnread = data.chats.filter((c: Chat) => {
          if (isExcludedFromUnreadBadge(c as any)) return false;
          const count = (c as any).unreadCount || 0;
          return count > 0;
        });
        const totalUnread = chatsWithUnread.reduce((sum: number, c: Chat) => {
          const count = (c as any).unreadCount || 0;
          return sum + Math.max(0, count);
        }, 0);
        
        console.log(`[useChat] ========== LOAD CHATS UNREAD COUNT ==========`);
        console.log(`[useChat] Total unread:`, totalUnread);
        console.log(`[useChat] Chats with unread:`, chatsWithUnread.length);
        console.log(`[useChat] Chats with unread details:`, JSON.stringify(chatsWithUnread.map((c: Chat) => ({
          id: c.id,
          name: (c as any).name || (c as any).displayName,
          unreadCount: (c as any).unreadCount,
          type: c.type,
          otherUserId: c.otherUser?.id,
        })), null, 2));
        console.log(`[useChat] ALL CHATS:`, JSON.stringify(data.chats.map((c: Chat) => ({
          id: c.id,
          name: (c as any).name || (c as any).displayName,
          unreadCount: (c as any).unreadCount || 0,
          type: c.type,
          otherUserId: c.otherUser?.id,
        })), null, 2));
        console.log(`[useChat] ==============================================`);
        
        window.dispatchEvent(new CustomEvent('chat-unread-count-changed', {
          detail: { totalUnread },
        }));
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

  // Инициализация WebSocket
  useEffect(() => {
    if (!session?.user) {
      // КРИТИЧЕСКОЕ ИСПРАВЛЕНИЕ: Отключаем сокет если нет сессии
      if (socketRef.current) {
        console.log("[useChat] No session, disconnecting socket");
        socketRef.current.disconnect();
        socketRef.current = null;
        setIsConnected(false);
      }
      return;
    }

    const token = (session as any)?.accessToken;
    if (!token) {
      console.warn("[useChat] No access token, using polling mode");
      // КРИТИЧЕСКОЕ ИСПРАВЛЕНИЕ: Отключаем сокет если нет токена
      if (socketRef.current) {
        socketRef.current.disconnect();
        socketRef.current = null;
        setIsConnected(false);
      }
      return;
    }

    // КРИТИЧЕСКОЕ ИСПРАВЛЕНИЕ: Проверяем, не подключен ли уже сокет с тем же токеном
    if (socketRef.current?.connected) {
      console.log("[useChat] Socket already connected, skipping reconnection");
      return;
    }

    const socketUrl = process.env.NEXT_PUBLIC_SOCKET_URL || 
      (typeof window !== "undefined" ? `${window.location.protocol}//${window.location.hostname}:3005` : "");

    console.log("[useChat] Connecting to socket:", socketUrl, {
      userId: session.user.id,
      viewMode: (session.user as any).viewMode,
      hasExistingSocket: !!socketRef.current,
    });

    // КРИТИЧЕСКОЕ ИСПРАВЛЕНИЕ: Отключаем старый сокет только если он не подключен
    if (socketRef.current && !socketRef.current.connected) {
      console.log("[useChat] Disconnecting old disconnected socket");
      socketRef.current.disconnect();
      socketRef.current = null;
    }

    const socket = io(socketUrl, {
      auth: { token },
      transports: ["websocket", "polling"],
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      timeout: 20000,
    });

    socketRef.current = socket;

    socket.on("connect", () => {
      console.log("[useChat] ✅ Socket connected", {
        socketId: socket.id,
        userId: session.user.id,
      });
      setIsConnected(true);
      
      // КРИТИЧЕСКОЕ ИСПРАВЛЕНИЕ: Переподключаемся к текущему чату
      if (selectedChatRef.current) {
        console.log("[useChat] Rejoining chat after reconnect:", selectedChatRef.current.id);
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

    // Нормализуем вложения сообщения для отображения (url/filePath для getAttachmentUrl)
    const normalizeMessageAttachments = (msg: Message): Message => ({
      ...msg,
      attachments: (msg.attachments || []).map((a: any) => ({
        ...a,
        url: a.url || a.filePath || '',
        filePath: a.filePath || a.url || '',
        name: a.name ?? a.fileName ?? a.originalName,
        fileName: a.fileName ?? a.name ?? a.originalName,
        originalName: a.originalName ?? a.name ?? a.fileName,
      })),
    });

    // Новое сообщение
    socket.on("message:new", (message: Message) => {
      const currentChatId = selectedChatRef.current?.id;
      const isCurrentUser = session?.user?.id === message.senderId;
      const normalizedMsg = normalizeMessageAttachments(message);
      
      console.log("[useChat] 📨 New message via socket:", {
        messageId: message.id,
        chatId: message.chatId,
        senderId: message.senderId,
        isCurrentUser,
        contentLength: message.content?.length || 0,
        hasAttachments: !!(message.attachments && message.attachments.length > 0),
        currentChatId,
        isCurrentChat: currentChatId === message.chatId,
      });
      
      // КРИТИЧЕСКОЕ ИСПРАВЛЕНИЕ: Добавляем сообщение в список если это текущий открытый чат
      if (currentChatId === message.chatId) {
        setMessages(prev => {
          // КРИТИЧЕСКОЕ ИСПРАВЛЕНИЕ: Удаляем оптимистичное сообщение если пришло реальное
          const withoutOptimistic = prev.filter(m => !m.id.startsWith('temp-'));
          
          // КРИТИЧЕСКОЕ ИСПРАВЛЕНИЕ: Проверяем по ID, а не по контенту
          if (withoutOptimistic.some(m => m.id === normalizedMsg.id)) {
            console.log("[useChat] ⚠️ Message already exists, skipping:", normalizedMsg.id);
            return prev;
          }
          
          // КРИТИЧЕСКОЕ ИСПРАВЛЕНИЕ: Для отправителя - заменяем оптимистичное сообщение на реальное
          // Если это сообщение от текущего пользователя и есть оптимистичное с похожим контентом
          if (isCurrentUser) {
            const optimisticIndex = prev.findIndex(m => 
              m.id.startsWith('temp-') && 
              m.chatId === message.chatId &&
              (m.content === message.content || message.content?.includes('📷 Фото') || message.content?.includes('📎 Файл'))
            );
            
            if (optimisticIndex !== -1) {
              console.log("[useChat] ✅ Replacing optimistic message with real one from WebSocket:", {
                tempId: prev[optimisticIndex].id,
                realId: message.id,
              });
              const newMessages = [...prev];
              newMessages[optimisticIndex] = normalizedMsg;
              return newMessages.filter(m => !m.id.startsWith('temp-') || m.id === prev[optimisticIndex].id);
            }
          }
          
          console.log("[useChat] ✅ Adding message to current chat:", {
            messageId: normalizedMsg.id,
            hasAttachments: !!(normalizedMsg.attachments && normalizedMsg.attachments.length > 0),
            attachmentsCount: normalizedMsg.attachments?.length || 0,
          });
          
          return [...withoutOptimistic, normalizedMsg];
        });
      } else {
        console.log("[useChat] 📬 Message for different chat, updating preview only");
      }

      // КРИТИЧЕСКОЕ ИСПРАВЛЕНИЕ: Обновляем превью для ВСЕХ чатов, где пришло сообщение
      setChats(prev => {
        const updated = prev.map(chat => {
          if (chat.id === normalizedMsg.chatId) {
            // Очищаем markdown из превью (как в chat-service.ts)
            let previewContent = normalizedMsg.content || "[Файл]";
            if (typeof previewContent === 'string' && previewContent.length > 0) {
              previewContent = previewContent
                .replace(/\*\*(.*?)\*\*/g, '$1') // Удаляем **жирный текст**
                .replace(/\*(.*?)\*/g, '$1') // Удаляем *курсив*
                .replace(/#{1,6}\s+/g, '') // Удаляем заголовки
                .replace(/\[([^\]]+)\]\([^\)]+\)/g, '$1') // Удаляем ссылки
                .replace(/`([^`]+)`/g, '$1') // Удаляем код
                .replace(/```[\s\S]*?```/g, '') // Удаляем блоки кода
                .replace(/\n{2,}/g, ' ') // Заменяем множественные переносы
                .trim();
              
              // Обрезаем длинные сообщения
              if (previewContent.length > 100) {
                previewContent = previewContent.substring(0, 100) + '...';
              }
            } else if (normalizedMsg.attachments && normalizedMsg.attachments.length > 0) {
              // Если есть файлы, показываем тип файла
              const firstAtt = normalizedMsg.attachments[0];
              previewContent = firstAtt.type === 'image' ? '📷 Фото' : '📎 Файл';
            }
            
            // КРИТИЧЕСКОЕ ИСПРАВЛЕНИЕ: Обновляем unreadCount только для получателей (не для отправителя)
            const isMessageFromCurrentUser = isCurrentUser;
            const newUnreadCount = isMessageFromCurrentUser 
              ? (chat.id === currentChatId ? 0 : (chat.unreadCount || 0)) // Для отправителя не увеличиваем
              : (chat.id === currentChatId ? 0 : (chat.unreadCount || 0) + 1); // Для получателя увеличиваем
            
            console.log("[useChat] ✅ Updating chat preview:", {
              chatId: chat.id,
              isCurrentUser,
              isCurrentChat: chat.id === currentChatId,
              oldLastMessage: chat.lastMessage?.substring(0, 50),
              newLastMessage: previewContent.substring(0, 50),
              oldUnreadCount: chat.unreadCount || 0,
              newUnreadCount,
            });
            
            return {
              ...chat,
              lastMessage: previewContent,
              lastMessageAt: normalizedMsg.createdAt ? new Date(normalizedMsg.createdAt) : new Date(),
              unreadCount: newUnreadCount,
            };
          }
          return chat;
        });
        
        const chatsForBadge = updated.filter(c => !isExcludedFromUnreadBadge(c as any));
        const totalUnread = chatsForBadge.reduce((sum, c) => sum + Math.max(0, c.unreadCount || 0), 0);
        console.log("[useChat] 📊 Total unread count after message:new (excl. bot/assistant):", {
          totalUnread,
          chatsWithUnread: chatsForBadge.filter(c => (c.unreadCount || 0) > 0).length,
        });
        window.dispatchEvent(new CustomEvent('chat-unread-count-changed', {
          detail: { totalUnread },
        }));
        
        // Если чат не найден в списке, возможно нужно перезагрузить список
        const chatExists = updated.some(c => c.id === normalizedMsg.chatId);
        if (!chatExists) {
          console.log("[useChat] ⚠️ Chat not found in list, may need to reload:", message.chatId);
        }
        
        return updated;
      });
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
      // КРИТИЧЕСКОЕ ИСПРАВЛЕНИЕ: Отключаем только если это тот же сокет
      if (socketRef.current === socket) {
        console.log("[useChat] Cleaning up socket connection", {
          socketId: socket.id,
          connected: socket.connected,
        });
        socket.disconnect();
        socketRef.current = null;
        setIsConnected(false);
      }
      // Cleanup reload timeout
      if (reloadChatsTimeoutRef.current) {
        clearTimeout(reloadChatsTimeoutRef.current);
        reloadChatsTimeoutRef.current = null;
      }
    };
  }, [session?.user?.id]); // КРИТИЧЕСКОЕ ИСПРАВЛЕНИЕ: Только userId в зависимостях, не весь session и не loadChats

  // Загрузка сообщений чата (HTTP - для первоначальной загрузки)
  const loadMessages = useCallback(async (chatId: string) => {
    setLoadingMessages(true);
    console.log(`[useChat] ========== LOADING MESSAGES FOR CHAT ${chatId} ==========`);
    try {
      const url = `/api/chat/${chatId}?limit=50&t=${Date.now()}`;
      console.log(`[useChat] Fetching: ${url}`);
      
      const data = await fetchJsonWithRetry<{ 
        messages: Message[]; 
        hasMore: boolean; 
        chat?: Chat;
        pagination?: { hasMore: boolean; oldestMessageId: string | null } 
      }>(
        url,
        {
          method: "GET",
          headers: { "Content-Type": "application/json" },
        },
        { timeoutMs: 60000 }
      );
      
      console.log(`[useChat] API response:`, {
        hasData: !!data,
        messagesCount: data?.messages?.length ?? 'N/A',
        hasChat: !!data?.chat,
        hasPagination: !!data?.pagination,
      });
      
      if (data) {
        const messages = data.messages || [];
        console.log(`[useChat] ========== CLIENT MESSAGES LOADING ==========`);
        console.log(`[useChat] ✅ Loaded ${messages.length} messages for chat ${chatId}`);
        console.log(`[useChat] Messages breakdown:`, {
          total: messages.length,
          hasActivity: messages.filter((m: any) => m.isActivity).length,
          hasChannelPosts: messages.filter((m: any) => m.messageType === 'channel_post').length,
          hasRegular: messages.filter((m: any) => !m.isActivity && m.messageType !== 'channel_post').length,
          hasAttachments: messages.filter((m: any) => m.attachments && m.attachments.length > 0).length,
        });
        if (messages.length > 0) {
          console.log(`[useChat] First message:`, {
            id: messages[0]?.id,
            type: messages[0]?.messageType,
            senderId: messages[0]?.senderId,
            content: messages[0]?.content?.substring(0, 50),
            attachmentsCount: messages[0]?.attachments?.length || 0,
          });
          console.log(`[useChat] Last message:`, {
            id: messages[messages.length - 1]?.id,
            type: messages[messages.length - 1]?.messageType,
            senderId: messages[messages.length - 1]?.senderId,
            content: messages[messages.length - 1]?.content?.substring(0, 50),
            attachmentsCount: messages[messages.length - 1]?.attachments?.length || 0,
          });
        } else {
          console.warn(`[useChat] ⚠️ No messages loaded for chat ${chatId} - this might indicate a problem!`);
          console.warn(`[useChat] ⚠️ Check server logs for why messages are not being returned`);
        }
        
        // КРИТИЧЕСКОЕ ИСПРАВЛЕНИЕ: Убеждаемся что сообщения устанавливаются даже если их 0
        setMessages(messages);
        setHasMore((data as any).pagination?.hasMore ?? (data as any).hasMore ?? false);
        setOldestMessageId((data as any).pagination?.oldestMessageId || null);

        // Обновляем информацию о чате, если она пришла (включая информацию об обращении)
        if (data.chat) {
          setSelectedChat(prev => prev?.id === chatId ? { ...prev, ...data.chat } : prev);
          setChats(prev => prev.map(chat =>
            chat.id === chatId ? { ...chat, ...data.chat } : chat
          ));
        }

        // КРИТИЧЕСКОЕ ИСПРАВЛЕНИЕ: Помечаем как прочитанные и получаем актуальный unreadCount
        // Оптимистично обновляем счетчик сразу, даже если запрос не удался
        try {
          // КРИТИЧЕСКОЕ ИСПРАВЛЕНИЕ: Оптимистично обновляем счетчик сразу
          setChats(prev => {
            const updated = prev.map(chat =>
              chat.id === chatId ? { ...chat, unreadCount: 0 } : chat
            );
            const chatsWithUnread = updated.filter(c => {
              if (isExcludedFromUnreadBadge(c as any)) return false;
              const count = c.unreadCount || 0;
              return count > 0;
            });
            const totalUnread = chatsWithUnread.reduce((sum, c) => {
              const count = c.unreadCount || 0;
              return sum + Math.max(0, count);
            }, 0);
            console.log(`[useChat] 📊 Optimistic total unread count after marking as read:`, {
              totalUnread,
              chatsWithUnreadCount: chatsWithUnread.length,
              chatsWithUnread: JSON.stringify(chatsWithUnread.map(c => ({
                id: c.id,
                name: (c as any).name || (c as any).displayName,
                unreadCount: c.unreadCount,
              })), null, 2),
            });
            window.dispatchEvent(new CustomEvent('chat-unread-count-changed', {
              detail: { totalUnread },
            }));
            
            return updated;
          });
          
          const readResponse = await fetch(`/api/chat/${chatId}/read`, { method: "POST" });
          if (readResponse.ok) {
            const readData = await readResponse.json();
            const newUnreadCount = readData.unreadCount || 0;
            
            console.log(`[useChat] ✅ Messages marked as read:`, {
              chatId,
              newUnreadCount,
              readAt: readData.readAt,
            });
            
            // КРИТИЧЕСКОЕ ИСПРАВЛЕНИЕ: Обновляем с реальным значением с сервера
            setChats(prev => {
              const updated = prev.map(chat =>
                chat.id === chatId ? { ...chat, unreadCount: newUnreadCount } : chat
              );
              const chatsWithUnread = updated.filter(c => {
                if (isExcludedFromUnreadBadge(c as any)) return false;
                const count = c.unreadCount || 0;
                return count > 0;
              });
              const totalUnread = chatsWithUnread.reduce((sum, c) => {
                const count = c.unreadCount || 0;
                return sum + Math.max(0, count);
              }, 0);
              console.log(`[useChat] 📊 Total unread count after marking as read (server):`, {
                totalUnread,
                chatId,
                newUnreadCount,
                chatsWithUnreadCount: chatsWithUnread.length,
                chatsWithUnread: JSON.stringify(chatsWithUnread.map(c => ({
                  id: c.id,
                  name: (c as any).name || (c as any).displayName,
                  unreadCount: c.unreadCount,
                  type: c.type,
                  otherUserId: c.otherUser?.id,
                })), null, 2),
                // КРИТИЧЕСКОЕ ИСПРАВЛЕНИЕ: Показываем все чаты для диагностики
                allChats: JSON.stringify(updated.map(c => ({
                  id: c.id,
                  name: (c as any).name || (c as any).displayName,
                  unreadCount: c.unreadCount || 0,
                  type: c.type,
                })), null, 2),
              });
              window.dispatchEvent(new CustomEvent('chat-unread-count-changed', {
                detail: { totalUnread },
              }));
              
              // КРИТИЧЕСКОЕ ИСПРАВЛЕНИЕ: Отправляем событие для немедленного обновления бейджа
              window.dispatchEvent(new CustomEvent('chat-messages-read', {
                detail: { chatId },
              }));
              
              return updated;
            });
            
            // КРИТИЧЕСКОЕ ИСПРАВЛЕНИЕ: Перезагружаем список чатов с debounce для получения актуальных unreadCount
            // Это гарантирует, что общий счетчик будет правильным, но не перезагружаем слишком часто
            if (reloadChatsTimeoutRef.current) {
              clearTimeout(reloadChatsTimeoutRef.current);
            }
            reloadChatsTimeoutRef.current = setTimeout(() => {
              console.log(`[useChat] 🔄 Reloading chats after marking as read to get accurate unreadCount`);
              loadChats();
              reloadChatsTimeoutRef.current = null;
            }, 2000); // Увеличиваем задержку и используем debounce
          } else {
            console.error("[useChat] ❌ Failed to mark as read:", readResponse.status);
            // КРИТИЧЕСКОЕ ИСПРАВЛЕНИЕ: При ошибке все равно отправляем событие для обновления бейджа
            window.dispatchEvent(new CustomEvent('chat-messages-read', {
              detail: { chatId },
            }));
          }
        } catch (e) {
          console.error("[useChat] Error marking as read:", e);
          // КРИТИЧЕСКОЕ ИСПРАВЛЕНИЕ: При ошибке все равно отправляем событие для обновления бейджа
          window.dispatchEvent(new CustomEvent('chat-messages-read', {
            detail: { chatId },
          }));
        }
      } else {
        console.warn(`[useChat] API returned no data for chat ${chatId} (timeout or server error)`);
        setMessages([]);
        options.onError?.("Не удалось загрузить сообщения. Проверьте соединение или обновите страницу.");
      }
    } catch (error) {
      console.error("[useChat] ❌ Error loading messages:", error);
      options.onError?.("Ошибка загрузки сообщений");
      // Устанавливаем пустой массив при ошибке
      setMessages([]);
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
    console.log(`[useChat] ========== SELECT CHAT ==========`);
    console.log(`[useChat] Selected chat:`, chat ? {
      id: chat.id,
      type: chat.type,
      name: chat.name,
      displayName: (chat as any).displayName,
      otherUserId: chat.otherUser?.id,
      otherUserName: chat.otherUser ? `${chat.otherUser.firstName} ${chat.otherUser.lastName}` : null,
    } : null);
    
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
      console.log(`[useChat] Loading messages for chat.id: ${chat.id}`);
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
    console.log(`[useChat] ========== SEND MESSAGE ==========`);
    console.log(`[useChat] selectedChat:`, selectedChat ? {
      id: selectedChat.id,
      type: selectedChat.type,
      name: selectedChat.name,
    } : 'NO SELECTED CHAT');
    console.log(`[useChat] content length: ${content.length}, hasFile: ${!!file}`);
    
    if (!selectedChat) {
      console.error(`[useChat] ❌ Cannot send message - no chat selected!`);
      return false;
    }

    // Проверяем, является ли это ИИ-чатом
    const isAIChat = selectedChat.name === "ИИ-Ассистент" || (selectedChat as any).isAIChat || (selectedChat as any).otherUser?.id === "ai-assistant-bot";
    
    setSending(true);

    try {
      // Для ИИ-чата используем специальный endpoint
      if (isAIChat && !file) {
        console.log(`[useChat] Sending message to AI chat via /api/chat/ai`);
        const tempMessageId = `temp-ai-user-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
        const optimisticUserMessage: Message = {
          id: tempMessageId,
          chatId: selectedChat.id,
          senderId: session?.user?.id || '',
          content: content.trim(),
          messageType: 'text',
          createdAt: new Date().toISOString(),
          editedAt: null,
          sender: {
            id: session?.user?.id || '',
            firstName: session?.user?.firstName || null,
            lastName: session?.user?.lastName || null,
            middleName: null,
            avatarUrl: session?.user?.avatarUrl || null,
          },
          reactions: {},
        };
        setMessages(prev => [...prev, optimisticUserMessage]);
        setAiTyping(true);
        try {
          const response = await fetch("/api/chat/ai", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ 
              content, 
              chatId: selectedChat.id,
            }),
          });

          if (response.ok) {
            const data = await response.json();
            setAiTyping(false);
            setMessages(prev => {
              const withoutTemp = prev.filter(m => m.id !== tempMessageId);
              const userMsg: Message = {
                ...data.userMessage,
                chatId: selectedChat.id,
                sender: data.userMessage.sender,
                reactions: {},
              };
              const botMsg: Message = {
                ...data.botMessage,
                chatId: selectedChat.id,
                sender: data.botMessage.sender,
                reactions: {},
              };
              const hasUser = withoutTemp.some(m => m.id === userMsg.id);
              const hasBot = withoutTemp.some(m => m.id === botMsg.id);
              let next = [...withoutTemp];
              if (!hasUser) next.push(userMsg);
              if (!hasBot) next.push(botMsg);
              return next.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
            });
            loadChats();
            setSending(false);
            return true;
          } else {
            const errorText = await response.text();
            console.error(`[useChat] ❌ AI chat POST failed: ${response.status}`, errorText);
            options.onError?.("Ошибка отправки сообщения ИИ");
            setMessages(prev => prev.filter(m => m.id !== tempMessageId));
            setAiTyping(false);
            setSending(false);
            return false;
          }
        } catch (error) {
          console.error(`[useChat] ❌ AI chat POST error:`, error);
          options.onError?.("Ошибка отправки сообщения ИИ");
          setMessages(prev => prev.filter(m => m.id !== tempMessageId));
          setAiTyping(false);
          setSending(false);
          return false;
        }
      }

      // Для файлов используем HTTP
      if (file) {
        // КРИТИЧЕСКОЕ ИСПРАВЛЕНИЕ: Оптимистичное обновление UI - показываем файл сразу
        const tempMessageId = `temp-${Date.now()}-${Math.random().toString(36).substring(7)}`;
        const fileUrl = URL.createObjectURL(file);
        const isImage = file.type.startsWith('image/');
        
        const optimisticMessage: Message = {
          id: tempMessageId,
          chatId: selectedChat.id,
          senderId: session?.user?.id || '',
          content: content || (isImage ? '📷 Фото' : '📎 Файл'),
          messageType: 'text',
          createdAt: new Date().toISOString(),
          editedAt: null,
          sender: {
            id: session?.user?.id || '',
            firstName: session?.user?.firstName || null,
            lastName: session?.user?.lastName || null,
            middleName: null,
            avatarUrl: session?.user?.avatarUrl || null,
          },
          replyTo: replyToId ? undefined : undefined, // TODO: загрузить replyTo если нужно
          attachments: [{
            id: `temp-attachment-${tempMessageId}`,
            type: isImage ? 'image' : 'file',
            fileName: file.name,
            originalName: file.name,
            filePath: fileUrl,
            fileSize: file.size,
            mimeType: file.type,
          }],
          reactions: {},
        };
        
        // КРИТИЧЕСКОЕ ИСПРАВЛЕНИЕ: Добавляем оптимистичное сообщение сразу
        console.log("[useChat] 📤 Adding optimistic message with file:", {
          tempMessageId,
          fileName: file.name,
          fileType: file.type,
          fileSize: file.size,
        });
        setMessages(prev => [...prev, optimisticMessage]);
        
        const formData = new FormData();
        formData.append("content", content);
        formData.append("file", file);
        if (replyToId) formData.append("replyToId", replyToId);
        if (threadRootId) formData.append("threadRootId", threadRootId);
        if (mentionedUserIds && mentionedUserIds.length > 0) {
          formData.append("mentionedUserIds", JSON.stringify(mentionedUserIds));
        }

        try {
          const response = await fetch(`/api/chat/${selectedChat.id}/attachments`, {
            method: "POST",
            body: formData,
          });

          if (response.ok) {
            const data = await response.json();
            console.log("[useChat] ✅ File uploaded, message created:", {
              messageId: data.message.id,
              hasAttachments: !!(data.message.attachments && data.message.attachments.length > 0),
              attachmentsCount: data.message.attachments?.length || 0,
            });
            
            // КРИТИЧЕСКОЕ ИСПРАВЛЕНИЕ: Заменяем оптимистичное сообщение на реальное
            // Нормализуем вложения: url и filePath для отображения (getAttachmentUrl использует оба)
            const normalizedMessage = {
              ...data.message,
              attachments: (data.message.attachments || []).map((a: any) => ({
                ...a,
                url: a.url || a.filePath || '',
                filePath: a.filePath || a.url || '',
                name: a.name ?? a.fileName ?? a.originalName,
                fileName: a.fileName ?? a.name ?? a.originalName,
                originalName: a.originalName ?? a.name ?? a.fileName,
              })),
            };
            setMessages(prev => {
              const alreadyExists = prev.some(m => m.id === data.message.id && !m.id.startsWith('temp-'));
              if (alreadyExists) {
                console.log("[useChat] ⚠️ Message already exists from WebSocket, just removing optimistic:", {
                  tempId: tempMessageId,
                  realId: data.message.id,
                });
                return prev.filter(m => m.id !== tempMessageId);
              }
              const withoutOptimistic = prev.filter(m => m.id !== tempMessageId);
              if (!withoutOptimistic.some(m => m.id === data.message.id)) {
                console.log("[useChat] ✅ Replacing optimistic message with real one from API:", {
                  tempId: tempMessageId,
                  realId: data.message.id,
                  attachmentsCount: normalizedMessage.attachments?.length,
                });
                return [...withoutOptimistic, normalizedMessage];
              }
              return withoutOptimistic;
            });
            
            // Освобождаем URL объекта
            URL.revokeObjectURL(fileUrl);
          
            // КРИТИЧЕСКОЕ ИСПРАВЛЕНИЕ: Обновляем превью чата после загрузки файла
            if (data.message) {
              let previewContent = data.message.content || "[Файл]";
              if (typeof previewContent === 'string' && previewContent.length > 0) {
                previewContent = previewContent
                  .replace(/\*\*(.*?)\*\*/g, '$1')
                  .replace(/\*(.*?)\*/g, '$1')
                  .replace(/#{1,6}\s+/g, '')
                  .replace(/\[([^\]]+)\]\([^\)]+\)/g, '$1')
                  .replace(/`([^`]+)`/g, '$1')
                  .replace(/```[\s\S]*?```/g, '')
                  .replace(/\n{2,}/g, ' ')
                  .trim();
                
                if (previewContent.length > 100) {
                  previewContent = previewContent.substring(0, 100) + '...';
                }
              } else if (data.message.attachments && data.message.attachments.length > 0) {
                // Если есть файлы, показываем тип файла
                const firstAtt = data.message.attachments[0];
                previewContent = firstAtt.type === 'image' ? '📷 Фото' : '📎 Файл';
              }
              
              setChats(prev => prev.map(chat =>
                chat.id === data.message.chatId
                  ? {
                      ...chat,
                      lastMessage: previewContent,
                      lastMessageAt: data.message.createdAt ? new Date(data.message.createdAt) : new Date(),
                    }
                  : chat
              ));
            }
            
            return true;
          } else {
            // КРИТИЧЕСКОЕ ИСПРАВЛЕНИЕ: При ошибке удаляем оптимистичное сообщение
            console.error("[useChat] ❌ File upload failed:", response.status);
            setMessages(prev => prev.filter(m => m.id !== tempMessageId));
            URL.revokeObjectURL(fileUrl);
            const errorText = await response.text();
            let errorData;
            try {
              errorData = JSON.parse(errorText);
            } catch {
              errorData = { error: errorText || 'Ошибка загрузки файла' };
            }
            options.onError?.(errorData.error || 'Ошибка загрузки файла');
            return false;
          }
        } catch (error) {
          // КРИТИЧЕСКОЕ ИСПРАВЛЕНИЕ: При ошибке удаляем оптимистичное сообщение
          console.error("[useChat] ❌ File upload error:", error);
          setMessages(prev => prev.filter(m => m.id !== tempMessageId));
          URL.revokeObjectURL(fileUrl);
          options.onError?.("Ошибка загрузки файла");
          return false;
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
          console.log(`[useChat] Using HTTP fallback for message send to chat: ${selectedChat.id}`);
          try {
            const url = `/api/chat/${selectedChat.id}`;
            console.log(`[useChat] POST ${url}`);
            
            const response = await fetch(url, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ 
                content, 
                replyToId, 
                threadRootId,
                mentionedUserIds: mentionedUserIds || undefined,
              }),
            });

            console.log(`[useChat] POST response status: ${response.status}`);

            if (response.ok) {
              const data = await response.json();
              console.log(`[useChat] ✅ Message created:`, data.message ? {
                id: data.message.id,
                chatId: data.message.chatId,
                contentLength: data.message.content?.length,
              } : 'NO MESSAGE IN RESPONSE');
              
              if (data.message) {
                setMessages(prev => {
                  if (prev.some(m => m.id === data.message.id)) return prev;
                  return [...prev, data.message];
                });
                
                // КРИТИЧЕСКОЕ ИСПРАВЛЕНИЕ: Обновляем превью чата сразу после отправки
                const message = data.message;
                let previewContent = message.content || "[Файл]";
                if (typeof previewContent === 'string' && previewContent.length > 0) {
                  previewContent = previewContent
                    .replace(/\*\*(.*?)\*\*/g, '$1')
                    .replace(/\*(.*?)\*/g, '$1')
                    .replace(/#{1,6}\s+/g, '')
                    .replace(/\[([^\]]+)\]\([^\)]+\)/g, '$1')
                    .replace(/`([^`]+)`/g, '$1')
                    .replace(/```[\s\S]*?```/g, '')
                    .replace(/\n{2,}/g, ' ')
                    .trim();
                  
                  if (previewContent.length > 100) {
                    previewContent = previewContent.substring(0, 100) + '...';
                  }
                }
                
                setChats(prev => prev.map(chat =>
                  chat.id === message.chatId
                    ? {
                        ...chat,
                        lastMessage: previewContent,
                        lastMessageAt: message.createdAt ? new Date(message.createdAt) : new Date(),
                      }
                    : chat
                ));
                
                // Обновляем список чатов (для синхронизации с сервером)
                loadChats();
                return true;
              } else {
                console.error("[useChat] ❌ Response OK but no message:", data);
                options.onError?.("Сообщение не было создано");
                return false;
              }
            } else {
              const errorText = await response.text();
              console.error(`[useChat] ❌ POST failed: ${response.status}`, errorText);
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
      console.log(`[useChat] 📤 Forwarding message ${messageId} to user ${targetUserId}`);
      
      const response = await fetch("/api/chat/forward", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messageId, targetUserId }),
      });

      console.log(`[useChat] Forward response status: ${response.status}`);

      if (response.ok) {
        const data = await response.json();
        console.log(`[useChat] Forward response data:`, data);
        
        if (data.success) {
          console.log(`[useChat] ✅ Message forwarded successfully`);
          // Обновляем список чатов и сообщения в целевом чате
          await loadChats();
          // Если целевой чат открыт, обновляем его сообщения
          if (selectedChatRef.current?.otherUser?.id === targetUserId) {
            console.log(`[useChat] Target chat is open, reloading messages`);
            await loadMessages(selectedChatRef.current.id);
          }
          return true;
        } else {
          const errorMsg = data.error || "Ошибка пересылки";
          console.error("[useChat] ❌ Forward error:", errorMsg);
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
    aiTyping,
    isConnected,
    isBotTyping: typingUsers.length > 0 || aiTyping,

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
