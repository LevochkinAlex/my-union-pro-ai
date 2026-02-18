"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { io, Socket } from "socket.io-client";
import { useSession } from "next-auth/react";

interface TypingUser {
  userId: string;
  userName: string;
}

interface UseSocketOptions {
  chatId?: string;
  onNewMessage?: (message: any) => void;
  onMessageUpdated?: (message: any) => void;
  onMessageDeleted?: (data: { messageId: string; chatId: string }) => void;
  onTypingStart?: (data: TypingUser) => void;
  onTypingStop?: (userId: string) => void;
}

export function useSocket(options: UseSocketOptions = {}) {
  const { data: session } = useSession();
  const socketRef = useRef<Socket | null>(null);
  const socketErrorLoggedRef = useRef(false);
  const [isConnected, setIsConnected] = useState(false);
  const [typingUsers, setTypingUsers] = useState<TypingUser[]>([]);
  const currentChatRef = useRef<string | null>(null);

  // Инициализация сокета
  useEffect(() => {
    if (!session?.user) return;

    const socketUrl = process.env.NEXT_PUBLIC_SOCKET_URL || 
      (typeof window !== "undefined" ? `${window.location.protocol}//${window.location.hostname}:3005` : "");

    // Получаем JWT токен из сессии
    const token = (session as any)?.accessToken || (session as any)?.token;
    
    if (!token) {
      console.warn("[useSocket] No access token available");
      return;
    }

    const socket = io(socketUrl, {
      auth: { token },
      transports: ["websocket", "polling"],
      reconnection: true,
      reconnectionAttempts: 2,
      reconnectionDelay: 1500,
      timeout: 2500,
    });

    socketRef.current = socket;

    socket.on("connect", () => {
      console.log("[useSocket] ✅ Connected");
      setIsConnected(true);

      // Переподключаемся к текущему чату если был
      if (currentChatRef.current) {
        socket.emit("chat:join", currentChatRef.current);
      }
    });

    socket.on("disconnect", () => {
      console.log("[useSocket] ❌ Disconnected");
      setIsConnected(false);
    });

    socket.on("connect_error", () => {
      if (!socketErrorLoggedRef.current) {
        socketErrorLoggedRef.current = true;
        console.warn("[useSocket] Сокет недоступен. Запустите: pnpm socket (порт 3005 или NEXT_PUBLIC_SOCKET_URL).");
      }
    });

    // События сообщений
    socket.on("message:new", (message) => {
      options.onNewMessage?.(message);
    });

    socket.on("message:updated", (message) => {
      options.onMessageUpdated?.(message);
    });

    socket.on("message:deleted", (data) => {
      options.onMessageDeleted?.(data);
    });

    // Typing события
    socket.on("typing:start", (data) => {
      setTypingUsers((prev) => {
        if (prev.some((u) => u.userId === data.userId)) return prev;
        return [...prev, { userId: data.userId, userName: data.userName }];
      });
      options.onTypingStart?.(data);
    });

    socket.on("typing:stop", (data) => {
      setTypingUsers((prev) => prev.filter((u) => u.userId !== data.userId));
      options.onTypingStop?.(data.userId);
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [session]);

  // Присоединение к чату
  const joinChat = useCallback((chatId: string) => {
    if (currentChatRef.current && currentChatRef.current !== chatId) {
      socketRef.current?.emit("chat:leave", currentChatRef.current);
    }
    
    currentChatRef.current = chatId;
    socketRef.current?.emit("chat:join", chatId);
    setTypingUsers([]);
  }, []);

  // Покидание чата
  const leaveChat = useCallback(() => {
    if (currentChatRef.current) {
      socketRef.current?.emit("chat:leave", currentChatRef.current);
      currentChatRef.current = null;
      setTypingUsers([]);
    }
  }, []);

  // Отправка сообщения через сокет
  const sendMessage = useCallback((
    chatId: string,
    content: string,
    replyToId?: string
  ): Promise<{ success: boolean; message?: any; error?: string }> => {
    return new Promise((resolve) => {
      if (!socketRef.current?.connected) {
        resolve({ success: false, error: "Нет соединения" });
        return;
      }

      socketRef.current.emit(
        "message:send",
        { chatId, content, replyToId },
        (response: any) => {
          resolve(response);
        }
      );
    });
  }, []);

  // Индикатор печатания
  const startTyping = useCallback((chatId: string) => {
    socketRef.current?.emit("typing:start", chatId);
  }, []);

  const stopTyping = useCallback((chatId: string) => {
    socketRef.current?.emit("typing:stop", chatId);
  }, []);

  return {
    isConnected,
    typingUsers,
    joinChat,
    leaveChat,
    sendMessage,
    startTyping,
    stopTyping,
    socket: socketRef.current,
  };
}
