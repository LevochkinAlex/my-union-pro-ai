/**
 * Chat WebSocket Server
 * WebSocket сервер для чатов с поддержкой тредов (как Slack)
 */

import { createServer } from "http";
import { Server as SocketServer, Socket } from "socket.io";
import { PrismaClient } from "@prisma/client";
import { verify } from "jsonwebtoken";
import dotenv from "dotenv";
import { resolve } from "path";

// Загружаем переменные окружения
dotenv.config({ path: resolve(process.cwd(), ".env.local") });

const prisma = new PrismaClient();
const PORT = parseInt(process.env.SOCKET_PORT || "3005", 10);

// Типы событий
interface ServerToClientEvents {
  // Сообщения
  "message:new": (message: any) => void;
  "message:updated": (message: any) => void;
  "message:deleted": (data: { messageId: string; chatId: string }) => void;
  
  // Треды
  "thread:new": (data: { threadRootId: string; message: any }) => void;
  "thread:updated": (data: { threadRootId: string; repliesCount: number; lastReplyAt: Date }) => void;
  
  // Печатает
  "typing:start": (data: { chatId: string; userId: string; userName: string }) => void;
  "typing:stop": (data: { chatId: string; userId: string }) => void;
  
  // Статус прочитано
  "read:update": (data: { chatId: string; userId: string; messageId: string }) => void;
  
  // Реакции
  "reaction:add": (data: { messageId: string; userId: string; emoji: string }) => void;
  "reaction:remove": (data: { messageId: string; userId: string; emoji: string }) => void;
  
  // Онлайн/оффлайн
  "user:online": (userId: string) => void;
  "user:offline": (userId: string) => void;
  
  // Ошибки
  "error": (error: { message: string }) => void;
}

interface ClientToServerEvents {
  // Присоединение к чату
  "chat:join": (chatId: string) => void;
  "chat:leave": (chatId: string) => void;
  
  // Присоединение к треду
  "thread:join": (threadRootId: string) => void;
  "thread:leave": (threadRootId: string) => void;
  
  // Отправка сообщения
  "message:send": (
    data: {
      chatId: string;
      content: string;
      messageType?: string;
      replyToId?: string; // Ответ на сообщение
      threadRootId?: string; // Ответ в треде
      attachments?: Array<{
        type: string;
        url: string;
        name: string;
        size?: number;
        mimeType?: string;
      }>;
    },
    callback: (response: { success: boolean; message?: any; error?: string }) => void
  ) => void;
  
  // Печатает
  "typing:start": (chatId: string) => void;
  "typing:stop": (chatId: string) => void;
  
  // Отметить как прочитанное
  "read:mark": (data: { chatId: string; messageId: string }) => void;
  
  // Реакции
  "reaction:toggle": (data: { messageId: string; emoji: string }) => void;
}

interface SocketData {
  userId: string;
  userName: string;
}

// Хранилище
const typingTimeouts = new Map<string, NodeJS.Timeout>(); // `${chatId}:${userId}` -> timeout
const onlineUsers = new Set<string>();
const chatRooms = new Map<string, Set<string>>(); // chatId -> Set of socketIds
const threadRooms = new Map<string, Set<string>>(); // threadRootId -> Set of socketIds

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
    socket.data.userName = [user.firstName, user.lastName].filter(Boolean).join(" ") || "Пользователь";
    next();
  } catch (error) {
    console.error("[Chat Server Auth Error]", error);
    next(new Error("Ошибка авторизации"));
  }
});

io.on("connection", (socket) => {
  const { userId, userName } = socket.data;
  console.log(`[Chat Server] ✅ Подключен: ${userName} (${userId})`);

  onlineUsers.add(userId);
  io.emit("user:online", userId);

  // Присоединение к чату
  socket.on("chat:join", async (chatId) => {
    try {
      // Проверяем доступ к чату
      const participant = await prisma.chatParticipant.findFirst({
        where: {
          chatId,
          userId,
          leftAt: null,
        },
      });

      if (!participant) {
        socket.emit("error", { message: "Нет доступа к чату" });
        return;
      }

      socket.join(`chat:${chatId}`);
      
      // Добавляем в хранилище комнат
      if (!chatRooms.has(chatId)) {
        chatRooms.set(chatId, new Set());
      }
      chatRooms.get(chatId)!.add(socket.id);

      console.log(`[Chat Server] ${userName} присоединился к чату ${chatId}`);
    } catch (error) {
      console.error("[Chat Server] Ошибка присоединения к чату:", error);
      socket.emit("error", { message: "Ошибка присоединения к чату" });
    }
  });

  // Отсоединение от чата
  socket.on("chat:leave", (chatId) => {
    socket.leave(`chat:${chatId}`);
    
    if (chatRooms.has(chatId)) {
      chatRooms.get(chatId)!.delete(socket.id);
      if (chatRooms.get(chatId)!.size === 0) {
        chatRooms.delete(chatId);
      }
    }

    console.log(`[Chat Server] ${userName} покинул чат ${chatId}`);
  });

  // Присоединение к треду
  socket.on("thread:join", async (threadRootId) => {
    try {
      // Проверяем доступ к треду (через чат)
      const message = await prisma.chatMessage.findUnique({
        where: { id: threadRootId },
        select: { chatId: true },
      });

      if (!message) {
        socket.emit("error", { message: "Тред не найден" });
        return;
      }

      const participant = await prisma.chatParticipant.findFirst({
        where: {
          chatId: message.chatId,
          userId,
          leftAt: null,
        },
      });

      if (!participant) {
        socket.emit("error", { message: "Нет доступа к треду" });
        return;
      }

      socket.join(`thread:${threadRootId}`);
      
      // Добавляем в хранилище тредов
      if (!threadRooms.has(threadRootId)) {
        threadRooms.set(threadRootId, new Set());
      }
      threadRooms.get(threadRootId)!.add(socket.id);

      console.log(`[Chat Server] ${userName} присоединился к треду ${threadRootId}`);
    } catch (error) {
      console.error("[Chat Server] Ошибка присоединения к треду:", error);
      socket.emit("error", { message: "Ошибка присоединения к треду" });
    }
  });

  // Отсоединение от треда
  socket.on("thread:leave", (threadRootId) => {
    socket.leave(`thread:${threadRootId}`);
    
    if (threadRooms.has(threadRootId)) {
      threadRooms.get(threadRootId)!.delete(socket.id);
      if (threadRooms.get(threadRootId)!.size === 0) {
        threadRooms.delete(threadRootId);
      }
    }
  });

  // Отправка сообщения
  socket.on("message:send", async (data, callback) => {
    try {
      const { chatId, content, messageType = "text", replyToId, threadRootId, attachments } = data;

      // Проверяем доступ к чату
      const participant = await prisma.chatParticipant.findFirst({
        where: {
          chatId,
          userId,
          leftAt: null,
        },
      });

      if (!participant) {
        callback({ success: false, error: "Нет доступа к чату" });
        return;
      }

      const chat = await prisma.chat.findUnique({
        where: { id: chatId },
        select: { archivedAt: true },
      });
      if (chat?.archivedAt) {
        callback({ success: false, error: "Чат в архиве. Отправка сообщений недоступна." });
        return;
      }

      // Исключённый не может писать тем, кто в ППО, из которого его исключили
      const currentUser = await prisma.user.findUnique({
        where: { id: userId },
        select: { membershipStatus: true, unionMembershipStatus: true, organizationId: true },
      });
      const isExcluded = currentUser?.membershipStatus === "EXCLUDED" || currentUser?.unionMembershipStatus === "REMOVED";
      const isReApplying = currentUser?.unionMembershipStatus === "REMOVED" &&
        (currentUser?.membershipStatus === "DOCUMENTS_PENDING" || currentUser?.membershipStatus === "PROFILE_INCOMPLETE");
      if (isExcluded && !isReApplying && currentUser?.organizationId) {
        const chatWithOrgs = await prisma.chat.findUnique({
          where: { id: chatId },
          include: {
            participants: {
              where: { leftAt: null },
              include: { user: { select: { organizationId: true } } },
            },
          },
        });
        if (chatWithOrgs) {
          const otherOrgs = chatWithOrgs.participants
            .filter((p) => p.userId !== userId)
            .map((p) => p.user?.organizationId)
            .filter((org): org is string => !!org);
          if (otherOrgs.includes(currentUser.organizationId)) {
            callback({ success: false, error: "Вы исключены из профсоюза. Отправка сообщений участникам вашей прежней организации недоступна." });
            return;
          }
        }
      }

      // Если это ответ в треде, проверяем что тред существует
      if (threadRootId) {
        const threadRoot = await prisma.chatMessage.findFirst({
          where: {
            id: threadRootId,
            chatId,
            threadRootId: null, // Должно быть корневым сообщением
          },
        });

        if (!threadRoot) {
          callback({ success: false, error: "Тред не найден" });
          return;
        }
      }

      // Создаем сообщение
      const message = await prisma.chatMessage.create({
        data: {
          chatId,
          senderId: userId,
          content,
          messageType,
          replyToId: replyToId || null,
          threadRootId: threadRootId || null,
          attachments: attachments
            ? {
                create: attachments.map((att) => ({
                  type: att.type,
                  url: att.url,
                  name: att.name,
                  size: att.size,
                  mimeType: att.mimeType,
                })),
              }
            : undefined,
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
                },
              },
            },
          },
          attachments: true,
        },
      });

      // Обновляем последнее сообщение в чате
      await prisma.chat.update({
        where: { id: chatId },
        data: {
          lastMessageId: message.id,
          lastMessageAt: message.createdAt,
        },
      });

      // Если это ответ в треде, обновляем метрики треда
      if (threadRootId) {
        const repliesCount = await prisma.chatMessage.count({
          where: {
            threadRootId,
            id: { not: threadRootId }, // Не считаем корневое сообщение
          },
        });

        await prisma.chatMessage.update({
          where: { id: threadRootId },
          data: {
            threadRepliesCount: repliesCount + 1,
            threadLastReplyAt: message.createdAt,
          },
        });

        // Отправляем обновление треда
        io.to(`thread:${threadRootId}`).to(`chat:${chatId}`).emit("thread:updated", {
          threadRootId,
          repliesCount: repliesCount + 1,
          lastReplyAt: message.createdAt,
        });
      }

      // Авто-смена статуса обращения на IN_PROGRESS при первом сообщении председателя
      try {
        const linkedTicket = await prisma.ticket.findFirst({
          where: { chatId },
          select: { id: true, userId: true, status: true },
        });
        if (linkedTicket && linkedTicket.status === "PENDING" && linkedTicket.userId !== userId) {
          await prisma.ticket.update({
            where: { id: linkedTicket.id },
            data: { status: "IN_PROGRESS", lastResponseAt: new Date() },
          });
          // Системное сообщение в чат
          const statusMsg = await prisma.chatMessage.create({
            data: {
              chatId,
              senderId: userId,
              content: `📋 Статус обращения изменён на «В работе»`,
              messageType: "text",
            },
            include: {
              sender: {
                select: { id: true, firstName: true, lastName: true, middleName: true, avatarUrl: true },
              },
              attachments: true,
            },
          });
          await prisma.chat.update({
            where: { id: chatId },
            data: { lastMessageId: statusMsg.id, lastMessageAt: statusMsg.createdAt },
          });
          io.to(`chat:${chatId}`).emit("message:new", statusMsg);
          console.log(`[Chat Server] ✅ Auto-changed ticket ${linkedTicket.id} to IN_PROGRESS`);
        }
      } catch (autoStatusErr) {
        console.error("[Chat Server] Auto-status error:", autoStatusErr);
      }

      // Отправляем новое сообщение всем в чате
      io.to(`chat:${chatId}`).emit("message:new", message);

      // Отправляем уведомления получателям через API
      const recipients = await prisma.chatParticipant.findMany({
        where: {
          chatId,
          userId: { not: userId },
          leftAt: null,
        },
        select: { userId: true },
      });

      if (recipients.length > 0) {
        // Отправляем уведомления асинхронно, не блокируя ответ
        fetch(`${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3004'}/api/chat/notify`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Internal-Token': process.env.INTERNAL_API_TOKEN || '',
          },
          body: JSON.stringify({
            roomId: chatId,
            message: content,
            senderUserId: userId,
          }),
        }).catch(err => {
          console.error('[Chat Server] Error sending notifications:', err);
        });
      }

      callback({ success: true, message });

      console.log(`[Chat Server] ${userName} отправил сообщение в чат ${chatId}`);
    } catch (error) {
      console.error("[Chat Server] Ошибка отправки сообщения:", error);
      callback({ success: false, error: "Ошибка отправки сообщения" });
    }
  });

  // Печатает
  socket.on("typing:start", async (chatId) => {
    try {
      const participant = await prisma.chatParticipant.findFirst({
        where: {
          chatId,
          userId,
          leftAt: null,
        },
      });

      if (!participant) return;

      // Очищаем предыдущий таймаут
      const timeoutKey = `${chatId}:${userId}`;
      const existingTimeout = typingTimeouts.get(timeoutKey);
      if (existingTimeout) {
        clearTimeout(existingTimeout);
      }

      // Отправляем событие
      socket.to(`chat:${chatId}`).emit("typing:start", {
        chatId,
        userId,
        userName,
      });

      // Автоматически останавливаем через 3 секунды
      const timeout = setTimeout(() => {
        typingTimeouts.delete(timeoutKey);
        socket.to(`chat:${chatId}`).emit("typing:stop", {
          chatId,
          userId,
        });
      }, 3000);

      typingTimeouts.set(timeoutKey, timeout);
    } catch (error) {
      console.error("[Chat Server] Ошибка typing:start:", error);
    }
  });

  // Перестал печатать
  socket.on("typing:stop", (chatId) => {
    const timeoutKey = `${chatId}:${userId}`;
    const existingTimeout = typingTimeouts.get(timeoutKey);
    if (existingTimeout) {
      clearTimeout(existingTimeout);
      typingTimeouts.delete(timeoutKey);
    }

    socket.to(`chat:${chatId}`).emit("typing:stop", {
      chatId,
      userId,
    });
  });

  // Отметить как прочитанное
  socket.on("read:mark", async (data) => {
    try {
      const { chatId, messageId } = data;

      // Проверяем доступ
      const participant = await prisma.chatParticipant.findFirst({
        where: {
          chatId,
          userId,
          leftAt: null,
        },
      });

      if (!participant) return;

      // Создаем или обновляем запись о прочтении
      await prisma.chatMessageRead.upsert({
        where: {
          messageId_userId: {
            messageId,
            userId,
          },
        },
        create: {
          messageId,
          userId,
        },
        update: {
          readAt: new Date(),
        },
      });

      // Обновляем readAt у участника
      await prisma.chatParticipant.update({
        where: {
          id: participant.id,
        },
        data: {
          readAt: new Date(),
        },
      });

      // Отправляем событие обновления прочитанного
      socket.to(`chat:${chatId}`).emit("read:update", {
        chatId,
        userId,
        messageId,
      });
    } catch (error) {
      console.error("[Chat Server] Ошибка read:mark:", error);
    }
  });

  // Реакция на сообщение
  socket.on("reaction:toggle", async (data) => {
    try {
      const { messageId, emoji } = data;

      // Проверяем существование сообщения и доступ
      const message = await prisma.chatMessage.findUnique({
        where: { id: messageId },
        select: { chatId: true },
      });

      if (!message) {
        socket.emit("error", { message: "Сообщение не найдено" });
        return;
      }

      const participant = await prisma.chatParticipant.findFirst({
        where: {
          chatId: message.chatId,
          userId,
          leftAt: null,
        },
      });

      if (!participant) {
        socket.emit("error", { message: "Нет доступа к сообщению" });
        return;
      }

      // Проверяем есть ли уже реакция
      const existingReaction = await prisma.chatMessageReaction.findUnique({
        where: {
          messageId_userId_emoji: {
            messageId,
            userId,
            emoji,
          },
        },
      });

      if (existingReaction) {
        // Удаляем реакцию
        await prisma.chatMessageReaction.delete({
          where: {
            id: existingReaction.id,
          },
        });

        socket.to(`chat:${message.chatId}`).emit("reaction:remove", {
          messageId,
          userId,
          emoji,
        });
      } else {
        // Добавляем реакцию
        await prisma.chatMessageReaction.create({
          data: {
            messageId,
            userId,
            emoji,
          },
        });

        socket.to(`chat:${message.chatId}`).emit("reaction:add", {
          messageId,
          userId,
          emoji,
        });
      }
    } catch (error) {
      console.error("[Chat Server] Ошибка reaction:toggle:", error);
      socket.emit("error", { message: "Ошибка обработки реакции" });
    }
  });

  // Отсоединение
  socket.on("disconnect", () => {
    console.log(`[Chat Server] ❌ Отключен: ${userName} (${userId})`);

    onlineUsers.delete(userId);
    io.emit("user:offline", userId);

    // Очищаем таймауты печатания
    for (const [key, timeout] of typingTimeouts.entries()) {
      if (key.endsWith(`:${userId}`)) {
        clearTimeout(timeout);
        typingTimeouts.delete(key);
      }
    }

    // Удаляем из комнат
    for (const [chatId, socketIds] of chatRooms.entries()) {
      socketIds.delete(socket.id);
      if (socketIds.size === 0) {
        chatRooms.delete(chatId);
      }
    }

    for (const [threadId, socketIds] of threadRooms.entries()) {
      socketIds.delete(socket.id);
      if (socketIds.size === 0) {
        threadRooms.delete(threadId);
      }
    }
  });
});

httpServer.listen(PORT, () => {
  console.log(`[Chat Server] 🚀 Сервер запущен на порту ${PORT}`);
});

// Graceful shutdown
process.on("SIGTERM", async () => {
  console.log("[Chat Server] Получен SIGTERM, завершаем работу...");
  httpServer.close(() => {
    console.log("[Chat Server] HTTP сервер закрыт");
  });
  await prisma.$disconnect();
  process.exit(0);
});
