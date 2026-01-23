import { createServer } from "http";
import { Server as SocketServer, Socket } from "socket.io";
import { PrismaClient } from "@prisma/client";
import { verify } from "jsonwebtoken";
import dotenv from "dotenv";

// Загружаем переменные окружения
dotenv.config({ path: ".env.local" });

const prisma = new PrismaClient();
const PORT = parseInt(process.env.SOCKET_PORT || "3005", 10);

// Типы событий
interface ServerToClientEvents {
  "message:new": (message: any) => void;
  "message:updated": (message: any) => void;
  "message:deleted": (data: { messageId: string; chatId: string }) => void;
  "typing:start": (data: { chatId: string; userId: string; userName: string }) => void;
  "typing:stop": (data: { chatId: string; userId: string }) => void;
  "user:online": (userId: string) => void;
  "user:offline": (userId: string) => void;
  "error": (error: { message: string }) => void;
}

interface ClientToServerEvents {
  "chat:join": (chatId: string) => void;
  "chat:leave": (chatId: string) => void;
  "message:send": (data: { chatId: string; content: string; replyToId?: string; threadRootId?: string }, callback: (response: any) => void) => void;
  "typing:start": (chatId: string) => void;
  "typing:stop": (chatId: string) => void;
}

interface SocketData {
  userId: string;
  userName: string;
}

// Хранилище
const typingTimeouts = new Map<string, NodeJS.Timeout>(); // `${chatId}:${userId}` -> timeout
const onlineUsers = new Set<string>();

const httpServer = createServer();

const io = new SocketServer<ClientToServerEvents, ServerToClientEvents, {}, SocketData>(httpServer, {
  cors: {
    origin: process.env.NEXT_PUBLIC_APP_URL || "*",
    methods: ["GET", "POST"],
    credentials: true,
  },
  transports: ["websocket", "polling"],
});

// Middleware для аутентификации
io.use(async (socket, next) => {
  try {
    const token = socket.handshake.auth.token;
    if (!token) {
      return next(new Error("Требуется авторизация"));
    }

    const decoded = verify(token, process.env.NEXTAUTH_SECRET || "") as any;
    if (!decoded?.sub) {
      return next(new Error("Неверный токен"));
    }

    // Получаем данные пользователя
    const user = await prisma.user.findUnique({
      where: { id: decoded.sub },
      select: { id: true, firstName: true, lastName: true },
    });

    if (!user) {
      return next(new Error("Пользователь не найден"));
    }

    socket.data.userId = user.id;
    socket.data.userName = [user.lastName, user.firstName].filter(Boolean).join(" ") || "Пользователь";
    next();
  } catch (error) {
    console.error("[Socket Auth Error]", error);
    next(new Error("Ошибка авторизации"));
  }
});

io.on("connection", (socket) => {
  const { userId, userName } = socket.data;
  console.log(`[Socket] ✅ Подключен: ${userName} (${userId})`);

  onlineUsers.add(userId);
  io.emit("user:online", userId);

  // Присоединение к чату
  socket.on("chat:join", async (chatId) => {
    // Проверяем доступ к чату
    const participant = await prisma.chatParticipant.findUnique({
      where: { chatId_userId: { chatId, userId } },
    });

    if (!participant) {
      socket.emit("error", { message: "Нет доступа к чату" });
      return;
    }

    socket.join(chatId);
    console.log(`[Socket] ${userName} присоединился к чату ${chatId}`);
  });

  // Покидание чата
  socket.on("chat:leave", (chatId) => {
    socket.leave(chatId);
    clearTyping(chatId, userId, socket);
  });

  // Отправка сообщения через WebSocket
  socket.on("message:send", async (data, callback) => {
    const { chatId, content, replyToId, threadRootId } = data;

    console.log(`[Socket] message:send received:`, {
      chatId,
      userId,
      contentLength: content?.length,
      hasReplyTo: !!replyToId,
      hasThreadRoot: !!threadRootId,
    });

    try {
      // Проверяем доступ
      const participant = await prisma.chatParticipant.findUnique({
        where: { chatId_userId: { chatId, userId } },
      });

      if (!participant) {
        callback({ success: false, error: "Нет доступа к чату" });
        return;
      }

      // КРИТИЧЕСКОЕ ИСПРАВЛЕНИЕ: Сохраняем сообщение в БД через транзакцию
      const message = await prisma.$transaction(async (tx) => {
        // Создаем сообщение в БД
        const createdMessage = await tx.chatMessage.create({
          data: {
            chatId,
            senderId: userId,
            content,
            messageType: 'text',
            replyToId: replyToId || null,
            threadRootId: threadRootId || null,
          },
          include: {
            sender: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                middleName: true,
                avatarUrl: true,
              },
            },
            replyTo: {
              include: {
                sender: {
                  select: {
                    id: true,
                    firstName: true,
                    lastName: true,
                    avatarUrl: true,
                  },
                },
              },
            },
            attachments: true,
          },
        });

        // Обновляем чат с lastMessageId
        await tx.chat.update({
          where: { id: chatId },
          data: {
            lastMessageId: createdMessage.id,
            lastMessageAt: createdMessage.createdAt,
          },
        });

        return createdMessage;
      });

      console.log(`[Socket] ✅ Message saved to DB: ${message.id} in chat ${chatId}`);

      // Отправляем всем в чате (включая отправителя)
      io.to(chatId).emit("message:new", message);

      // Останавливаем typing
      clearTyping(chatId, userId, socket);

      callback({ success: true, message });

      console.log(`[Socket] 📨 Сообщение от ${userName} в чат ${chatId}`);
    } catch (error) {
      console.error("[Socket] Ошибка отправки:", error);
      callback({ success: false, error: "Ошибка отправки сообщения" });
    }
  });

  // Печатание
  socket.on("typing:start", (chatId) => {
    const key = `${chatId}:${userId}`;

    // Очищаем предыдущий таймаут
    if (typingTimeouts.has(key)) {
      clearTimeout(typingTimeouts.get(key)!);
    }

    // Уведомляем других
    socket.to(chatId).emit("typing:start", { chatId, userId, userName });

    // Автоматически останавливаем через 3 сек
    const timeout = setTimeout(() => {
      clearTyping(chatId, userId, socket);
    }, 3000);

    typingTimeouts.set(key, timeout);
  });

  socket.on("typing:stop", (chatId) => {
    clearTyping(chatId, userId, socket);
  });

  // Отключение
  socket.on("disconnect", (reason) => {
    console.log(`[Socket] ❌ Отключен: ${userName} (${reason})`);

    onlineUsers.delete(userId);
    io.emit("user:offline", userId);

    // Очищаем все typing для этого пользователя
    for (const [key, timeout] of typingTimeouts) {
      if (key.endsWith(`:${userId}`)) {
        clearTimeout(timeout);
        typingTimeouts.delete(key);
        const chatId = key.split(":")[0];
        socket.to(chatId).emit("typing:stop", { chatId, userId });
      }
    }
  });
});

function clearTyping(chatId: string, odlId: string, socket: Socket) {
  const key = `${chatId}:${odlId}`;
  if (typingTimeouts.has(key)) {
    clearTimeout(typingTimeouts.get(key)!);
    typingTimeouts.delete(key);
    socket.to(chatId).emit("typing:stop", { chatId, userId: odlId });
  }
}

// Функции для вызова из API (через HTTP или напрямую)
export function emitToChat(chatId: string, event: string, data: any) {
  io.to(chatId).emit(event as any, data);
}

httpServer.listen(PORT, () => {
  console.log(`\n🚀 Socket.io сервер запущен на порту ${PORT}\n`);
});

// Graceful shutdown
process.on("SIGTERM", async () => {
  console.log("Завершение работы...");
  await prisma.$disconnect();
  httpServer.close();
  process.exit(0);
});
