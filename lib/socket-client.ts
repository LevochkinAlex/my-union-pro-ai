"use client";

import { io, Socket } from "socket.io-client";
import type { ServerToClientEvents, ClientToServerEvents } from "@/server/socket";

type TypedSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

let socket: TypedSocket | null = null;

export function getSocket(): TypedSocket | null {
  return socket;
}

export function initSocket(token: string): TypedSocket {
  if (socket?.connected) {
    return socket;
  }

  // Закрываем старое соединение если есть
  if (socket) {
    socket.disconnect();
  }

  const socketUrl = process.env.NEXT_PUBLIC_SOCKET_URL || window.location.origin;

  socket = io(socketUrl, {
    path: "/api/socket",
    auth: { token },
    transports: ["websocket", "polling"],
    reconnection: true,
    reconnectionAttempts: 5,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
    timeout: 10000,
  });

  socket.on("connect", () => {
    console.log("[Socket] Connected:", socket?.id);
  });

  socket.on("disconnect", (reason) => {
    console.log("[Socket] Disconnected:", reason);
  });

  socket.on("connect_error", (error) => {
    console.error("[Socket] Connection error:", error.message);
  });

  return socket;
}

export function disconnectSocket() {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}

export function joinChat(chatId: string) {
  socket?.emit("chat:join", chatId);
}

export function leaveChat(chatId: string) {
  socket?.emit("chat:leave", chatId);
}

export function startTyping(chatId: string) {
  socket?.emit("typing:start", chatId);
}

export function stopTyping(chatId: string) {
  socket?.emit("typing:stop", chatId);
}
