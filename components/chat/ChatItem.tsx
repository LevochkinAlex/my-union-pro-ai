"use client";

import { Chat } from "@/types/chat";
import { getUserName, getFileUrl, isDeletedUser } from "@/lib/chat-utils";
import { UserMinus } from "lucide-react";

interface ChatItemProps {
  chat: Chat;
  isSelected: boolean;
  onClick: () => void;
}

export default function ChatItem({ chat, isSelected, onClick }: ChatItemProps) {
  const getChatName = () => {
    if (chat.type === "GROUP") return chat.name || "Группа";
    if (chat.ticketId && chat.ticketPublicId) return `Обращение #${chat.ticketPublicId}`;
    return getUserName(chat.otherUser);
  };

  const getAvatar = () => {
    if (chat.type === "GROUP" && chat.iconUrl) {
      return (
        <img
          src={getFileUrl(chat.iconUrl)}
          alt=""
          className="w-12 h-12 rounded-full object-cover"
        />
      );
    }
    if (chat.type === "GROUP") {
      return (
        <div className="w-12 h-12 rounded-full bg-gradient-to-br from-green-500 to-teal-600 flex items-center justify-center text-white">
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z"
            />
          </svg>
        </div>
      );
    }
    if (chat.ticketId) {
      return (
        <div className="w-12 h-12 rounded-full bg-gradient-to-br from-yellow-500 to-orange-500 flex items-center justify-center text-white">
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z"
            />
          </svg>
        </div>
      );
    }
    if (isDeletedUser(chat.otherUser)) {
      return (
        <div className="w-12 h-12 rounded-full bg-gray-300 dark:bg-gray-600 flex items-center justify-center text-gray-600 dark:text-gray-300" title="Удалённый пользователь">
          <UserMinus className="w-6 h-6" />
        </div>
      );
    }
    if (chat.otherUser?.avatarUrl) {
      return (
        <img
          src={getFileUrl(chat.otherUser.avatarUrl)}
          alt=""
          className="w-12 h-12 rounded-full object-cover"
        />
      );
    }
    return (
      <div className="w-12 h-12 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white font-semibold">
        {chat.otherUser?.firstName?.[0] || "?"}
        {chat.otherUser?.lastName?.[0] || ""}
      </div>
    );
  };

  return (
    <div
      className={`flex items-center gap-3 p-3 cursor-pointer hover-surface ${
        isSelected ? "bg-blue-50 dark:bg-blue-900/30" : ""
      }`}
      onClick={onClick}
    >
      {getAvatar()}
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between">
          <span className="font-medium text-gray-900 dark:text-white truncate">
            {getChatName()}
          </span>
          {chat.unreadCount > 0 && (
            <span className="ml-2 shrink-0 bg-blue-500 text-white text-xs px-2 py-0.5 rounded-full">
              {chat.unreadCount}
            </span>
          )}
        </div>
        <p className="text-sm text-gray-500 dark:text-gray-400 truncate">
          {chat.lastMessage || "Нет сообщений"}
        </p>
      </div>
    </div>
  );
}
