import { io, Socket } from "socket.io-client";
import { appConfig } from "../config/appConfig";

type ServerToClientEvents = {
  "message:new": (message: unknown) => void;
  "typing:start": (data: { chatId: string; userId: string; userName: string }) => void;
  "typing:stop": (data: { chatId: string; userId: string }) => void;
  "user:online": (userId: string) => void;
  "user:offline": (userId: string) => void;
};

type ClientToServerEvents = {
  "chat:join": (chatId: string) => void;
  "chat:leave": (chatId: string) => void;
  "typing:start": (chatId: string) => void;
  "typing:stop": (chatId: string) => void;
  "message:send": (
    data: {
      chatId: string;
      content: string;
      replyToId?: string;
      threadRootId?: string;
    },
    callback: (response: { success: boolean; message?: unknown; error?: string }) => void,
  ) => void;
};

let socket: Socket<ServerToClientEvents, ClientToServerEvents> | null = null;

export function connectSocket(token: string) {
  if (socket?.connected) return socket;

  socket = io(appConfig.socketUrl, {
    auth: { token },
    transports: ["websocket", "polling"],
    reconnection: true,
    reconnectionAttempts: 5,
    reconnectionDelay: 1000,
    timeout: 10_000,
  });

  return socket;
}

export function getSocket() {
  return socket;
}

export function disconnectSocket() {
  if (!socket) return;
  socket.disconnect();
  socket = null;
}
