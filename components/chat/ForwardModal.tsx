"use client";

import { useState } from "react";
import { Chat, Message } from "@/types/chat";
import { getUserName, getFileUrl, isDeletedUser } from "@/lib/chat-utils";
import { Paperclip, UserMinus } from "lucide-react";

interface ForwardModalProps {
  message: Message;
  chats: Chat[];
  onSelect: (chat: Chat) => void;
  onClose: () => void;
}

export default function ForwardModal({
  message,
  chats,
  onSelect,
  onClose,
}: ForwardModalProps) {
  const [search, setSearch] = useState("");

  const filteredChats = chats.filter((chat) => {
    if (!search) return true;
    const name = getUserName(chat.otherUser).toLowerCase();
    return name.includes(search.toLowerCase());
  });

  return (
    <div
      className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-white dark:bg-gray-900 rounded-xl w-full max-w-md max-h-[70vh] flex flex-col shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Заголовок */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
            Переслать сообщение
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="p-2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700"
            aria-label="Закрыть"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        {/* Превью сообщения */}
        <div className="px-4 py-3 bg-gray-50 dark:bg-gray-900/50 border-b border-gray-200 dark:border-gray-700">
          <p className="text-sm text-gray-600 dark:text-gray-400 line-clamp-2">
            {message.content || (
              <span className="inline-flex items-center gap-1">
                <Paperclip className="h-3.5 w-3.5" />
                Вложение
              </span>
            )}
          </p>
        </div>

        {/* Поиск */}
        <div className="p-3 border-b border-gray-200 dark:border-gray-700">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Поиск чата..."
            className="w-full px-4 py-2.5 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 shadow-sm transition-colors text-sm"
          />
        </div>

        {/* Список чатов */}
        <div className="flex-1 overflow-y-auto">
          {filteredChats.length === 0 ? (
            <div className="p-8 text-center text-gray-500 dark:text-gray-400">
              {search ? "Чаты не найдены" : "Нет доступных чатов"}
            </div>
          ) : (
            filteredChats.map((chat) => (
              <button
                key={chat.id}
                onClick={() => onSelect(chat)}
                className="w-full flex items-center gap-3 p-3 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
              >
                {isDeletedUser(chat.otherUser) ? (
                  <div className="w-10 h-10 rounded-full bg-gray-300 dark:bg-gray-600 flex items-center justify-center text-gray-600 dark:text-gray-300" title="Удалённый пользователь">
                    <UserMinus className="w-5 h-5" />
                  </div>
                ) : chat.otherUser?.avatarUrl ? (
                  <img
                    src={getFileUrl(chat.otherUser.avatarUrl)}
                    alt={getUserName(chat.otherUser)}
                    className="w-10 h-10 rounded-full object-cover"
                  />
                ) : (
                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white font-semibold text-sm">
                    {chat.otherUser?.firstName?.[0] || "?"}
                    {chat.otherUser?.lastName?.[0] || ""}
                  </div>
                )}
                <div className="flex-1 min-w-0 text-left">
                  <p className="font-medium text-gray-900 dark:text-white truncate">
                    {getUserName(chat.otherUser)}
                  </p>
                  {chat.lastMessage && (
                    <p className="text-sm text-gray-500 dark:text-gray-400 truncate">
                      {chat.lastMessage}
                    </p>
                  )}
                </div>
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
