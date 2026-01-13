"use client";

import { memo, useState, useCallback } from "react";
import { Chat, ChatUser } from "@/types/chat";
import { getUserName, getInitials, formatTime, getFileUrl } from "@/lib/chat-utils";

interface ChatSidebarProps {
  chats: Chat[];
  selectedChat: Chat | null;
  loading: boolean;
  currentUserId: string | null;
  onSelectChat: (chat: Chat) => void;
  onCreateChat: (userId: string) => void;
}

function ChatSidebarComponent({
  chats,
  selectedChat,
  loading,
  currentUserId,
  onSelectChat,
  onCreateChat,
}: ChatSidebarProps) {
  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<ChatUser[]>([]);
  const [searching, setSearching] = useState(false);

  const handleSearch = useCallback(async (query: string) => {
    setSearchQuery(query);
    if (!query.trim()) {
      setSearchResults([]);
      return;
    }

    setSearching(true);
    try {
      const response = await fetch(`/api/users?search=${encodeURIComponent(query)}&limit=10`);
      if (response.ok) {
        const data = await response.json();
        setSearchResults(data.users || []);
      }
    } catch (error) {
      console.error("[ChatSidebar] Search error:", error);
    } finally {
      setSearching(false);
    }
  }, []);

  const handleSelectUser = useCallback((user: ChatUser) => {
    if (currentUserId && user.id === currentUserId) return;
    onCreateChat(user.id);
    setShowSearch(false);
    setSearchQuery("");
    setSearchResults([]);
  }, [currentUserId, onCreateChat]);

  return (
    <div className="flex flex-col h-full bg-white dark:bg-gray-800">
      {/* Заголовок */}
      <div className="p-3 md:p-4 border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg md:text-xl font-semibold text-gray-900 dark:text-white">Чаты</h2>
          <button
            onClick={() => setShowSearch(!showSearch)}
            className="p-2 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
            aria-label="Новый чат"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
          </button>
        </div>
        
        {showSearch && (
          <div className="relative">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => handleSearch(e.target.value)}
              placeholder="Поиск пользователей..."
              className="w-full px-4 py-2.5 pl-10 border border-gray-300 dark:border-gray-600 rounded-lg bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
              autoFocus
            />
            <svg
              className="absolute left-3 top-3 h-5 w-5 text-gray-400"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </div>
        )}
      </div>

      {/* Список */}
      <div className="flex-1 overflow-y-auto">
        {showSearch && searchQuery ? (
          // Результаты поиска
          <SearchResults
            results={searchResults}
            searching={searching}
            currentUserId={currentUserId}
            onSelect={handleSelectUser}
          />
        ) : loading ? (
          <LoadingState />
        ) : chats.length > 0 ? (
          <ChatList
            chats={chats}
            selectedChat={selectedChat}
            currentUserId={currentUserId}
            onSelect={onSelectChat}
          />
        ) : (
          <EmptyState />
        )}
      </div>
    </div>
  );
}

// Мемоизированные подкомпоненты
const SearchResults = memo(function SearchResults({
  results,
  searching,
  currentUserId,
  onSelect,
}: {
  results: ChatUser[];
  searching: boolean;
  currentUserId: string | null;
  onSelect: (user: ChatUser) => void;
}) {
  if (searching) {
    return <div className="p-4 text-center text-gray-500 dark:text-gray-400">Поиск...</div>;
  }

  if (results.length === 0) {
    return <div className="p-4 text-center text-gray-500 dark:text-gray-400">Пользователи не найдены</div>;
  }

  return (
    <div>
      {results.map((user) => (
        <UserItem
          key={user.id}
          user={user}
          disabled={currentUserId === user.id}
          onClick={() => onSelect(user)}
        />
      ))}
    </div>
  );
});

const UserItem = memo(function UserItem({
  user,
  disabled,
  onClick,
}: {
  user: ChatUser;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="w-full px-3 md:px-4 py-3 flex items-center gap-3 hover:bg-gray-100 dark:hover:bg-gray-700 border-b border-gray-100 dark:border-gray-700/50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
    >
      <Avatar user={user} size="md" />
      <div className="flex-1 text-left min-w-0">
        <p className="font-medium text-gray-900 dark:text-white truncate text-sm md:text-base">
          {getUserName(user)}
        </p>
        {user.jobTitle && (
          <p className="text-sm text-gray-500 dark:text-gray-400 truncate">{user.jobTitle}</p>
        )}
      </div>
      <svg className="w-5 h-5 text-gray-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
      </svg>
    </button>
  );
});

const ChatList = memo(function ChatList({
  chats,
  selectedChat,
  currentUserId,
  onSelect,
}: {
  chats: Chat[];
  selectedChat: Chat | null;
  currentUserId: string | null;
  onSelect: (chat: Chat) => void;
}) {
  return (
    <div>
      {chats.map((chat) => {
        // Для приватных чатов пропускаем чаты с самим собой
        // Для групповых чатов (включая обращения) - показываем всегда
        const isGroupOrAppeal = chat.type === "GROUP" || chat.ticketId || (chat.otherUser as any)?.isGroup;
        if (!isGroupOrAppeal && currentUserId && chat.otherUser.id === currentUserId) return null;
        
        return (
          <ChatItem
            key={chat.id}
            chat={chat}
            isSelected={selectedChat?.id === chat.id}
            onSelect={onSelect}
          />
        );
      })}
    </div>
  );
});

const ChatItem = memo(function ChatItem({
  chat,
  isSelected,
  onSelect,
}: {
  chat: Chat;
  isSelected: boolean;
  onSelect: (chat: Chat) => void;
}) {
  const isGroupChat = chat.type === "GROUP" || (chat.otherUser as any)?.isGroup;
  const isAppealChat = !!(chat.ticketId);
  
  // Определяем название чата
  const getChatName = () => {
    if (isAppealChat && chat.ticketPublicId) return `Обращение #${chat.ticketPublicId}`;
    if (chat.name) return chat.name;
    return getUserName(chat.otherUser);
  };

  // Определяем подзаголовок
  const getSubtitle = () => {
    if (isGroupChat) {
      const count = (chat as any).participantsCount || chat._count?.participants || 0;
      if (count > 0) return `${count} участник${count === 1 ? "" : count < 5 ? "а" : "ов"}`;
    }
    if (chat.ticketTitle) return chat.ticketTitle;
    return chat.lastMessage || "Нет сообщений";
  };

  return (
    <button
      onClick={() => onSelect(chat)}
      className={`w-full px-3 md:px-4 py-3 flex items-center gap-3 hover:bg-gray-100 dark:hover:bg-gray-700 border-b border-gray-200 dark:border-gray-700/50 transition-colors ${
        isSelected ? "bg-blue-100 dark:bg-blue-900/20" : "bg-white dark:bg-gray-800"
      }`}
    >
      {isAppealChat ? (
        <div className="w-12 h-12 md:w-14 md:h-14 rounded-full bg-gradient-to-br from-yellow-500 to-orange-500 flex items-center justify-center text-white flex-shrink-0">
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
          </svg>
        </div>
      ) : isGroupChat ? (
        chat.iconUrl ? (
          <img 
            src={getFileUrl(chat.iconUrl)} 
            alt={chat.name || "Группа"} 
            className="w-12 h-12 md:w-14 md:h-14 rounded-full object-cover flex-shrink-0"
          />
        ) : (
          <div className="w-12 h-12 md:w-14 md:h-14 rounded-full bg-gradient-to-br from-green-500 to-teal-600 flex items-center justify-center text-white flex-shrink-0">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </div>
        )
      ) : (
        <Avatar user={chat.otherUser} size="md" />
      )}
      <div className="flex-1 text-left min-w-0">
        <div className="flex items-center justify-between mb-1 gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <p className="font-medium text-gray-900 dark:text-white truncate text-sm md:text-base">
              {getChatName()}
            </p>
            {isAppealChat && (
              <span className="shrink-0 text-xs bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400 px-1.5 py-0.5 rounded">
                Обращение
              </span>
            )}
          </div>
          {chat.lastMessageAt && (
            <span className="text-xs text-gray-500 dark:text-gray-400 whitespace-nowrap flex-shrink-0">
              {formatTime(chat.lastMessageAt.toString())}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <p className="text-sm text-gray-500 dark:text-gray-400 truncate flex-1">
            {getSubtitle()}
          </p>
          {chat.unreadCount > 0 && (
            <span className="bg-blue-500 text-white text-xs font-medium px-2 py-0.5 rounded-full min-w-[20px] text-center flex-shrink-0">
              {chat.unreadCount > 99 ? "99+" : chat.unreadCount}
            </span>
          )}
        </div>
      </div>
    </button>
  );
});

const Avatar = memo(function Avatar({
  user,
  size = "md",
}: {
  user: ChatUser;
  size?: "sm" | "md" | "lg";
}) {
  const sizeClasses = {
    sm: "w-10 h-10 text-sm",
    md: "w-12 h-12 md:w-14 md:h-14 text-lg",
    lg: "w-16 h-16 text-xl",
  };

  if (user.avatarUrl) {
    return (
      <img
        src={getFileUrl(user.avatarUrl)}
        alt={getUserName(user)}
        className={`${sizeClasses[size]} rounded-full object-cover flex-shrink-0`}
        onError={(e) => {
          e.currentTarget.style.display = "none";
        }}
      />
    );
  }

  return (
    <div
      className={`${sizeClasses[size]} rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white font-semibold flex-shrink-0`}
    >
      {getInitials(user)}
    </div>
  );
});

const LoadingState = memo(function LoadingState() {
  return (
    <div className="p-4 space-y-3">
      {[1, 2, 3].map((i) => (
        <div key={i} className="flex items-center gap-3 animate-pulse">
          <div className="w-12 h-12 rounded-full bg-gray-200 dark:bg-gray-700" />
          <div className="flex-1">
            <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-3/4 mb-2" />
            <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-1/2" />
          </div>
        </div>
      ))}
    </div>
  );
});

const EmptyState = memo(function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center h-full text-center p-6">
      <svg
        className="w-16 h-16 text-gray-300 dark:text-gray-600 mb-4"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={1.5}
          d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
        />
      </svg>
      <p className="text-gray-500 dark:text-gray-400">Нет чатов</p>
      <p className="text-sm text-gray-400 dark:text-gray-500 mt-1">
        Нажмите + чтобы начать новый чат
      </p>
    </div>
  );
});

export const ChatSidebar = memo(ChatSidebarComponent);
export default ChatSidebar;

