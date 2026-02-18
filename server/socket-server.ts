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
    console.log(`[Socket] chat:join request:`, {
      chatId,
      userId,
      userName,
      socketId: socket.id,
    });
    
    // Проверяем доступ к чату
    const participant = await prisma.chatParticipant.findUnique({
      where: { chatId_userId: { chatId, userId } },
    });

    if (!participant) {
      console.warn(`[Socket] ❌ Access denied: user ${userId} not a participant of chat ${chatId}`);
      socket.emit("error", { message: "Нет доступа к чату" });
      return;
    }

    socket.join(chatId);
    console.log(`[Socket] ✅ ${userName} (${userId}) присоединился к чату ${chatId}`);
    
    // КРИТИЧЕСКОЕ ИСПРАВЛЕНИЕ: Логируем все комнаты, к которым подключен пользователь
    const rooms = Array.from(socket.rooms);
    console.log(`[Socket] User ${userId} is now in rooms:`, rooms);
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
          io.to(chatId).emit("message:new", statusMsg);
          console.log(`[Socket] ✅ Auto-changed ticket ${linkedTicket.id} to IN_PROGRESS`);
        }
      } catch (autoStatusErr) {
        console.error("[Socket] Auto-status error:", autoStatusErr);
      }

      // КРИТИЧЕСКОЕ ИСПРАВЛЕНИЕ: Получаем количество подключенных клиентов в комнате
      const room = io.sockets.adapter.rooms.get(chatId);
      const clientsCount = room ? room.size : 0;
      
      console.log(`[Socket] 📤 Emitting message:new to room ${chatId}:`, {
        messageId: message.id,
        chatId: message.chatId,
        senderId: message.senderId,
        contentLength: message.content?.length || 0,
        clientsInRoom: clientsCount,
        senderName: userName,
      });
      
      // Отправляем всем в чате (включая отправителя)
      io.to(chatId).emit("message:new", message);
      
      console.log(`[Socket] ✅ Message emitted to ${clientsCount} clients in room ${chatId}`);

      // Останавливаем typing
      clearTyping(chatId, userId, socket);

      // КРИТИЧЕСКОЕ ИСПРАВЛЕНИЕ: Создаем уведомления для участников чата
      try {
        // Получаем информацию о чате и участниках
        const chat = await prisma.chat.findUnique({
          where: { id: chatId },
          select: {
            id: true,
            type: true,
            name: true,
            ticket: {
              select: {
                publicId: true,
                title: true,
              },
            },
          },
        });

        const participants = await prisma.chatParticipant.findMany({
          where: {
            chatId,
            leftAt: null,
            userId: { not: userId }, // Исключаем отправителя
          },
          select: {
            userId: true,
          },
        });

        if (participants.length > 0) {
          // Динамически импортируем sendUserNotification
          const { sendUserNotification } = await import('@/lib/notifications');
          
          const senderName = `${message.sender.firstName || ''} ${message.sender.lastName || ''}`.trim() || 'Пользователь';
          const notificationContent = content.length > 100 ? content.substring(0, 100) + '...' : content;
          
          // Определяем имя чата
          let chatName = chat?.name || '';
          if (!chatName && chat?.type === 'PRIVATE') {
            // Для приватных чатов имя формируется из другого участника
            chatName = senderName;
          } else if (chat?.ticket) {
            chatName = `Обращение #${chat.ticket.publicId}`;
          }
          
          const notificationUrl = `/dashboard/chat?chatId=${chatId}`;

          console.log(`[Socket] 📬 Sending notifications to ${participants.length} participants`);

          // Отправляем уведомления асинхронно (не блокируем ответ)
          Promise.allSettled(
            participants.map(async (participant) => {
              try {
                await sendUserNotification({
                  userId: participant.userId,
                  type: 'chat_message',
                  title: chat?.type === 'CHANNEL' 
                    ? `Новый пост в канале "${chatName}"`
                    : chat?.ticket
                    ? `Новое сообщение в обращении #${chat.ticket.publicId}`
                    : `Новое сообщение от ${senderName}`,
                  body: notificationContent,
                  url: notificationUrl,
                  senderName: senderName,
                  metadata: {
                    chatId,
                    messageId: message.id,
                  },
                });
              } catch (err) {
                console.error(`[Socket] Error sending notification to user ${participant.userId}:`, err);
              }
            })
          ).catch(err => {
            console.error('[Socket] Error in notification batch:', err);
          });
        }
      } catch (notifError) {
        console.error('[Socket] Error preparing notifications:', notifError);
        // Не прерываем выполнение - уведомления не критичны
      }

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
