"use client";

import { Chat } from "@/types/chat";
import { getUserName, getFileUrl } from "@/lib/chat-utils";

interface DefaultChatHeaderProps {
  chat: Chat;
  onBack: () => void;
  onProfileClick?: (userId: string) => void;
}

export default function DefaultChatHeader({
  chat,
  onBack,
  onProfileClick,
}: DefaultChatHeaderProps) {
  const handleClick = () => {
    if (onProfileClick && chat.otherUser?.id) {
      onProfileClick(chat.otherUser.id);
    }
  };

  const isClickable = !!onProfileClick && !!chat.otherUser?.id;

  return (
    <div className="flex items-center gap-3 p-3 md:p-4 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
      <button
        onClick={onBack}
        className="md:hidden p-2 -ml-2 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"
      >
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M15 19l-7-7 7-7"
          />
        </svg>
      </button>

      <button
        className={`flex-shrink-0 ${
          isClickable ? "cursor-pointer hover:opacity-80 transition-opacity" : "cursor-default"
        }`}
        onClick={handleClick}
        disabled={!isClickable}
      >
        {chat.otherUser?.avatarUrl ? (
          <img
            src={getFileUrl(chat.otherUser.avatarUrl)}
            alt={getUserName(chat.otherUser)}
            className="w-10 h-10 rounded-full object-cover"
          />
        ) : (
          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white font-semibold">
            {chat.otherUser?.firstName?.[0] || "?"}
            {chat.otherUser?.lastName?.[0] || ""}
          </div>
        )}
      </button>

      <button
        className={`flex-1 min-w-0 text-left ${
          isClickable ? "cursor-pointer hover:opacity-80 transition-opacity" : "cursor-default"
        }`}
        onClick={handleClick}
        disabled={!isClickable}
      >
        <h3 className="font-semibold text-gray-900 dark:text-white truncate">
          {getUserName(chat.otherUser)}
        </h3>
        {chat.otherUser?.phone && (
          <p className="text-sm text-gray-500 dark:text-gray-400 truncate">
            {chat.otherUser.phone}
          </p>
        )}
      </button>
    </div>
  );
}
