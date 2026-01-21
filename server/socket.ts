import { Server as HttpServer } from "http";
import { Server as SocketServer, Socket } from "socket.io";
import { verify } from "jsonwebtoken";
import type { Redis } from "ioredis";

// Типы событий
export interface ServerToClientEvents {
  "message:new": (message: any) => void;
  "message:updated": (message: any) => void;
  "message:deleted": (data: { messageId: string; chatId: string }) => void;
  "typing:start": (data: { chatId: string; userId: string; userName: string }) => void;
  "typing:stop": (data: { chatId: string; userId: string }) => void;
  "chat:updated": (chat: any) => void;
  "user:online": (data: { userId: string }) => void;
  "user:offline": (data: { userId: string }) => void;
  "error": (error: { message: string }) => void;
}

export interface ClientToServerEvents {
  "chat:join": (chatId: string) => void;
  "chat:leave": (chatId: string) => void;
  "message:send": (data: { chatId: string; content: string; replyToId?: string }) => void;
  "typing:start": (chatId: string) => void;
  "typing:stop": (chatId: string) => void;
  "message:read": (data: { chatId: string; messageId: string }) => void;
}

interface SocketData {
  userId: string;
  userName: string;
}

// Redis клиенты для Socket.io adapter
let pubClient: Redis | null = null;
let subClient: Redis | null = null;

// Хранилище активных пользователей (локальное для быстрого доступа)
// Для масштабирования лучше использовать Redis, но оставляем для fallback
const activeUsers = new Map<string, Set<string>>(); // chatId -> Set<socketId>
const userSockets = new Map<string, string>(); // socketId -> userId
const typingUsers = new Map<string, Map<string, NodeJS.Timeout>>(); // chatId -> userId -> timeout

let io: SocketServer<ClientToServerEvents, ServerToClientEvents, {}, SocketData> | null = null;

export async function initSocketServer(httpServer: HttpServer) {
  if (io) return io;

  // Инициализируем Redis клиенты для adapter
  // Используем динамические импорты для избежания проблем при сборке
  try {
    if (typeof window === "undefined") {
      // Только на сервере
      const Redis = (await import("ioredis")).default;
      const { getRedisOptions } = await import("@/lib/redis");
      const redisOptions = getRedisOptions();
      pubClient = new Redis(redisOptions);
      subClient = pubClient.duplicate();

    pubClient.on("error", (err) => {
      console.error("[Socket Redis] Pub client error:", err);
    });

    subClient.on("error", (err) => {
      console.error("[Socket Redis] Sub client error:", err);
    });

      console.log("[Socket] ✅ Redis clients initialized for adapter");
    }
  } catch (error) {
    console.warn("[Socket] ⚠️ Redis adapter initialization failed, using in-memory mode:", error);
  }

  io = new SocketServer<ClientToServerEvents, ServerToClientEvents, {}, SocketData>(httpServer, {
    path: "/api/socket",
    cors: {
      origin: process.env.NEXT_PUBLIC_APP_URL || "*",
      methods: ["GET", "POST"],
      credentials: true,
    },
    transports: ["websocket", "polling"],
    // Оптимизации для масштабирования
    pingTimeout: 60000,
    pingInterval: 25000,
    maxHttpBufferSize: 1e6, // 1MB
    allowEIO3: true,
  });

  // Настраиваем Redis adapter если клиенты доступны
  if (pubClient && subClient) {
    try {
      // Динамический импорт adapter только в runtime
      const { createAdapter } = await import("@socket.io/redis-adapter");
      io.adapter(createAdapter(pubClient, subClient));
      console.log("[Socket] ✅ Redis adapter configured for horizontal scaling");
    } catch (error) {
      console.warn("[Socket] ⚠️ Failed to configure Redis adapter:", error);
    }
  }

  // Rate limiting: храним количество соединений на пользователя
  const userConnections = new Map<string, number>();
  const MAX_CONNECTIONS_PER_USER = 5; // Максимум 5 одновременных соединений на пользователя

  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth.token;
      if (!token) {
        return next(new Error("Authentication required"));
      }

      // Верифицируем JWT токен
      const decoded = verify(token, process.env.NEXTAUTH_SECRET || "") as any;
      if (!decoded?.sub) {
        return next(new Error("Invalid token"));
      }

      const userId = decoded.sub;
      
      // Rate limiting: проверяем количество соединений
      const currentConnections = userConnections.get(userId) || 0;
      if (currentConnections >= MAX_CONNECTIONS_PER_USER) {
        return next(new Error("Too many connections"));
      }

      userConnections.set(userId, currentConnections + 1);

      socket.data.userId = userId;
      socket.data.userName = decoded.name || "Пользователь";
      next();
    } catch (error) {
      next(new Error("Authentication failed"));
    }
  });

  io.on("connection", (socket) => {
    const userId = socket.data.userId;
    console.log(`[Socket] User connected: ${userId}`);
    
    userSockets.set(socket.id, userId);

    // Присоединение к чату
    socket.on("chat:join", (chatId) => {
      socket.join(chatId);
      
      if (!activeUsers.has(chatId)) {
        activeUsers.set(chatId, new Set());
      }
      activeUsers.get(chatId)!.add(socket.id);
      
      console.log(`[Socket] User ${userId} joined chat ${chatId}`);
    });

    // Покидание чата
    socket.on("chat:leave", (chatId) => {
      socket.leave(chatId);
      activeUsers.get(chatId)?.delete(socket.id);
      
      // Остановить typing если был
      stopTyping(chatId, userId, socket);
    });

    // Начало печатания
    socket.on("typing:start", (chatId) => {
      if (!typingUsers.has(chatId)) {
        typingUsers.set(chatId, new Map());
      }
      
      const chatTyping = typingUsers.get(chatId)!;
      
      // Очищаем предыдущий таймаут
      if (chatTyping.has(userId)) {
        clearTimeout(chatTyping.get(userId)!);
      }
      
      // Уведомляем других участников
      socket.to(chatId).emit("typing:start", {
        chatId,
        userId,
        userName: socket.data.userName,
      });
      
      // Автоматически останавливаем через 3 секунды
      const timeout = setTimeout(() => {
        stopTyping(chatId, userId, socket);
      }, 3000);
      
      chatTyping.set(userId, timeout);
    });

    // Остановка печатания
    socket.on("typing:stop", (chatId) => {
      stopTyping(chatId, userId, socket);
    });

    // Отключение
    socket.on("disconnect", () => {
      console.log(`[Socket] User disconnected: ${userId}`);
      
      userSockets.delete(socket.id);
      
      // Уменьшаем счетчик соединений
      const currentConnections = userConnections.get(userId) || 0;
      if (currentConnections > 1) {
        userConnections.set(userId, currentConnections - 1);
      } else {
        userConnections.delete(userId);
      }
      
      // Удаляем из всех чатов
      for (const [chatId, users] of activeUsers) {
        if (users.has(socket.id)) {
          users.delete(socket.id);
          stopTyping(chatId, userId, socket);
        }
      }
    });
  });

  return io;
}

function stopTyping(chatId: string, userId: string, socket: Socket) {
  const chatTyping = typingUsers.get(chatId);
  if (chatTyping?.has(userId)) {
    clearTimeout(chatTyping.get(userId)!);
    chatTyping.delete(userId);
    socket.to(chatId).emit("typing:stop", { chatId, userId });
  }
}

// Функция для отправки сообщения из API routes
export function emitNewMessage(chatId: string, message: any) {
  if (io) {
    io.to(chatId).emit("message:new", message);
  }
}

export function emitMessageUpdated(chatId: string, message: any) {
  if (io) {
    io.to(chatId).emit("message:updated", message);
  }
}

export function emitMessageDeleted(chatId: string, messageId: string) {
  if (io) {
    io.to(chatId).emit("message:deleted", { chatId, messageId });
  }
}

export function emitChatUpdated(chatId: string, chat: any) {
  if (io) {
    io.to(chatId).emit("chat:updated", chat);
  }
}

export function getIO() {
  return io;
}
