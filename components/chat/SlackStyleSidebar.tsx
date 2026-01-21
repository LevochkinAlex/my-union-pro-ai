"use client";

import { useState, useMemo, useCallback, useEffect } from "react";
import { useSession } from "next-auth/react";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import { formatLastSeen } from "@/lib/format-last-seen";
import {
  Search,
  Plus,
  Hash,
  MessageCircle,
  Bot,
  Users,
  Briefcase,
  ChevronDown,
  ChevronRight,
  UserPlus,
  X,
  Check,
  Loader2,
} from "lucide-react";
import { Chat, ChatUser } from "@/types/chat";

// ============================================================================
// ТИПЫ
// ============================================================================

export type ChatCategory = "work" | "personal" | "ai";

export interface SlackStyleSidebarProps {
  chats: Chat[];
  selectedChat: Chat | null;
  loading: boolean;
  currentUserId: string | null;
  isChairman?: boolean;
  onSelectChat: (chat: Chat) => void;
  onCreateChat?: (userId: string) => void;
  onCreateGroup?: () => void;
  onOpenAIChat?: () => void;
}

interface UserSearchResult {
  id: string;
  firstName: string | null;
  lastName: string | null;
  avatarUrl: string | null;
  email?: string | null;
  phone?: string | null;
  jobTitle?: string | null;
}

// ============================================================================
// УТИЛИТЫ
// ============================================================================

function getChatDisplayName(chat: Chat, currentUserId: string | null): string {
  if (chat.type === "GROUP") {
    return chat.name || "Групповой чат";
  }
  if (chat.otherUser) {
    const parts = [
      chat.otherUser.lastName,
      chat.otherUser.firstName,
    ].filter(Boolean);
    return parts.length > 0 ? parts.join(" ") : "Пользователь";
  }
  return "Чат";
}

function getChatAvatar(chat: Chat): string | null {
  if (chat.type === "GROUP") {
    return chat.iconUrl || null;
  }
  return chat.otherUser?.avatarUrl || null;
}

function isWorkChat(chat: Chat): boolean {
  return chat.type === "GROUP" && (!!chat.ticketId || !!chat.ticketPublicId);
}

function isAIChat(chat: Chat): boolean {
  // Проверка по ID другого участника
  if (chat.otherUser?.id) {
    const userIdLower = chat.otherUser.id.toLowerCase();
    if (userIdLower.includes('ai-assistant') || 
        userIdLower.includes('bot') ||
        userIdLower === 'ai-assistant-bot' ||
        userIdLower.includes('ai') && userIdLower.includes('assistant')) {
      return true;
    }
  }
  
  // Проверка по названию чата
  if (chat.name) {
    const nameLower = chat.name.toLowerCase();
    const aiPatterns = [
      "ии-ассистент",
      "ии ассистент",
      "ai assistant",
      "ai-assistant",
      "помощник ai",
      "ai помощник",
      "ai-помощник",
    ];
    if (aiPatterns.some(pattern => nameLower.includes(pattern))) {
      return true;
    }
  }
  
  // Проверка по displayName (для случаев, когда name не установлен)
  const displayName = getChatDisplayName(chat, null);
  const displayNameLower = displayName.toLowerCase();
  // Убираем первую букву, если она одна (например, "П Помощник AI" -> "помощник ai")
  const displayNameNormalized = displayNameLower.replace(/^[а-яa-z]\s+/, '');
  const displayNamePatterns = [
    "ии-ассистент",
    "ии ассистент",
    "ai assistant",
    "ai-assistant",
    "помощник ai",
    "ai помощник",
    "ai-помощник",
  ];
  if (displayNamePatterns.some(pattern => 
    displayNameLower.includes(pattern) || displayNameNormalized.includes(pattern)
  )) {
    return true;
  }
  
  // Дополнительная проверка: если есть "помощник" и ("ai" или "ии"), то это AI
  if ((displayNameLower.includes('помощник') || displayNameNormalized.includes('помощник')) &&
      (displayNameLower.includes('ai') || displayNameLower.includes('ии'))) {
    return true;
  }
  
  // Проверка по имени другого участника
  if (chat.otherUser) {
    const firstName = (chat.otherUser.firstName || '').toLowerCase();
    const lastName = (chat.otherUser.lastName || '').toLowerCase();
    const fullName = `${firstName} ${lastName}`.trim();
    
    if ((fullName.includes('помощник') || fullName.includes('ассистент')) && 
        (fullName.includes('ai') || fullName.includes('ии'))) {
      return true;
    }
    
    // Проверка только по фамилии (например, "Помощник AI")
    if (lastName && (
      (lastName.includes('помощник') && (lastName.includes('ai') || lastName.includes('ии'))) ||
      lastName.includes('ассистент')
    )) {
      return true;
    }
  }
  
  return false;
}

function formatLastMessageTime(date: Date | string | null): string {
  if (!date) return "";
  const d = new Date(date);
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (minutes < 1) return "сейчас";
  if (minutes < 60) return `${minutes}м`;
  if (hours < 24) return `${hours}ч`;
  if (days < 7) return `${days}д`;
  return d.toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit" });
}

function getUserDisplayName(user: UserSearchResult): string {
  const parts = [user.lastName, user.firstName].filter(Boolean);
  return parts.length > 0 ? parts.join(" ") : user.email || "Пользователь";
}

// ============================================================================
// МОДАЛ СОЗДАНИЯ ЧАТА
// ============================================================================

interface NewChatModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectUser: (userId: string) => void;
  currentUserId: string | null;
}

function NewChatModal({ isOpen, onClose, onSelectUser, currentUserId }: NewChatModalProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [users, setUsers] = useState<UserSearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedUser, setSelectedUser] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      loadUsers();
    } else {
      setSearchQuery("");
      setUsers([]);
      setSelectedUser(null);
    }
  }, [isOpen]);

  const loadUsers = async (query?: string) => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (query) params.set("q", query);
      params.set("limit", "50");
      
      const response = await fetch(`/api/chat/users/search?${params}`);
      if (response.ok) {
        const data = await response.json();
        // Фильтруем текущего пользователя
        setUsers((data.users || []).filter((u: UserSearchResult) => u.id !== currentUserId));
      }
    } catch (error) {
      console.error("Failed to load users:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = useCallback((query: string) => {
    setSearchQuery(query);
    if (query.length >= 2) {
      loadUsers(query);
    } else if (query.length === 0) {
      loadUsers();
    }
  }, []);

  const handleSelect = useCallback(() => {
    if (selectedUser) {
      onSelectUser(selectedUser);
      onClose();
    }
  }, [selectedUser, onSelectUser, onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-md mx-4 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-2">
            <UserPlus className="w-5 h-5 text-blue-500" />
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
              Новый чат
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
          >
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        {/* Search */}
        <div className="p-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input
              type="text"
              placeholder="Поиск по имени или email..."
              value={searchQuery}
              onChange={(e) => handleSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-3 bg-gray-100 dark:bg-gray-800 border-0 rounded-xl text-gray-900 dark:text-gray-100 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
              autoFocus
            />
          </div>
        </div>

        {/* User list */}
        <div className="max-h-[400px] overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-6 h-6 text-blue-500 animate-spin" />
            </div>
          ) : users.length === 0 ? (
            <div className="text-center py-8 text-gray-500 dark:text-gray-400">
              {searchQuery ? "Пользователи не найдены" : "Введите имя для поиска"}
            </div>
          ) : (
            <div className="pb-2">
              {users.map((user) => (
                <button
                  key={user.id}
                  onClick={() => setSelectedUser(user.id === selectedUser ? null : user.id)}
                  className={`
                    w-full flex items-center gap-3 px-4 py-3 transition-colors
                    ${user.id === selectedUser 
                      ? 'bg-blue-50 dark:bg-blue-900/20' 
                      : 'hover:bg-gray-50 dark:hover:bg-gray-800'
                    }
                  `}
                >
                  {/* Avatar */}
                  {user.avatarUrl ? (
                    <img
                      src={user.avatarUrl}
                      alt={getUserDisplayName(user)}
                      className="w-10 h-10 rounded-full object-cover"
                    />
                  ) : (
                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-400 to-purple-500 flex items-center justify-center text-white font-medium">
                      {getUserDisplayName(user)[0]?.toUpperCase() || "?"}
                    </div>
                  )}

                  {/* Info */}
                  <div className="flex-1 text-left min-w-0">
                    <div className="font-medium text-gray-900 dark:text-white truncate">
                      {getUserDisplayName(user)}
                    </div>
                    {(user.jobTitle || user.email) && (
                      <div className="text-sm text-gray-500 dark:text-gray-400 truncate">
                        {user.jobTitle || user.email}
                      </div>
                    )}
                  </div>

                  {/* Check */}
                  {user.id === selectedUser && (
                    <div className="w-6 h-6 rounded-full bg-blue-500 flex items-center justify-center">
                      <Check className="w-4 h-4 text-white" />
                    </div>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-gray-200 dark:border-gray-700">
          <button
            onClick={handleSelect}
            disabled={!selectedUser}
            className={`
              w-full py-3 rounded-xl font-medium transition-all
              ${selectedUser
                ? 'bg-blue-500 hover:bg-blue-600 text-white'
                : 'bg-gray-100 dark:bg-gray-800 text-gray-400 cursor-not-allowed'
              }
            `}
          >
            Начать чат
          </button>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// ЭЛЕМЕНТ ЧАТА
// ============================================================================

interface ChatListItemProps {
  chat: Chat;
  isSelected: boolean;
  currentUserId: string | null;
  onClick: () => void;
}

function ChatListItem({ chat, isSelected, currentUserId, onClick }: ChatListItemProps) {
  const displayName = getChatDisplayName(chat, currentUserId);
  const avatar = getChatAvatar(chat);
  const isGroup = chat.type === "GROUP";
  const isAI = isAIChat(chat);
  const hasUnread = (chat.unreadCount || 0) > 0;
  
  // Проверяем онлайн статус для личных чатов
  const otherUserId = !isGroup && !isAI && chat.otherUser?.id ? [chat.otherUser.id] : [];
  const { isOnline, getLastSeenAt } = useOnlineStatus(otherUserId);
  const isOtherUserOnline = otherUserId.length > 0 ? isOnline(otherUserId[0]) : false;
  const lastSeenAt = otherUserId.length > 0 ? getLastSeenAt(otherUserId[0]) : null;
  
  // Форматируем время последней активности для отображения в списке
  const lastSeenText = !isGroup && !isAI && !isOtherUserOnline && lastSeenAt
    ? formatLastSeen(lastSeenAt, false)
    : null;

  return (
    <button
      onClick={onClick}
      className={`
        w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-all duration-150
        ${isSelected
          ? "bg-blue-100 dark:bg-blue-900/30 shadow-sm"
          : "hover:bg-gray-100 dark:hover:bg-gray-800"
        }
      `}
    >
      {/* Avatar */}
      <div className="relative flex-shrink-0">
        {isAI ? (
          <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-purple-500 to-blue-500 flex items-center justify-center shadow-lg">
            <Bot className="w-5 h-5 text-white" />
          </div>
        ) : isGroup ? (
          avatar ? (
            <img
              src={avatar}
              alt={displayName}
              className="w-11 h-11 rounded-xl object-cover"
            />
          ) : (
            <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-green-400 to-teal-500 flex items-center justify-center shadow-sm">
              <Hash className="w-5 h-5 text-white" />
            </div>
          )
        ) : avatar ? (
          <img
            src={avatar}
            alt={displayName}
            className="w-11 h-11 rounded-full object-cover"
          />
        ) : (
          <div className="w-11 h-11 rounded-full bg-gradient-to-br from-gray-400 to-gray-500 flex items-center justify-center text-white font-medium text-sm">
            {displayName[0]?.toUpperCase() || "?"}
          </div>
        )}
        
        {/* Online indicator */}
        {isAI ? (
          // ИИ помощник всегда онлайн
          <div className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full border-2 border-white dark:border-gray-900 bg-green-500" />
        ) : !isGroup && (
          // Для обычных пользователей показываем реальный статус
          <div className={`absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full border-2 border-white dark:border-gray-900 ${
            isOtherUserOnline ? 'bg-green-500' : 'bg-gray-400'
          }`} />
        )}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between mb-0.5">
          <span className={`font-semibold text-sm truncate text-gray-900 dark:text-white ${hasUnread ? "font-bold" : ""}`}>
            {displayName}
          </span>
          {chat.lastMessageAt && (
            <span className="text-xs text-gray-400 dark:text-gray-500 flex-shrink-0 ml-2">
              {formatLastMessageTime(chat.lastMessageAt)}
            </span>
          )}
        </div>
        
        <div className="flex items-center justify-between">
          <div className="flex-1 min-w-0">
            <span className={`text-sm truncate block ${hasUnread ? 'text-gray-700 dark:text-gray-300 font-medium' : 'text-gray-500 dark:text-gray-400'}`}>
              {chat.lastMessage || (isGroup ? `${chat.participantsCount || 0} участников` : "Нет сообщений")}
            </span>
            {lastSeenText && (
              <span className="text-xs text-gray-400 dark:text-gray-500 truncate block">
                {lastSeenText}
              </span>
            )}
          </div>
          
          {hasUnread && (
            <span className="flex-shrink-0 ml-2 w-5 h-5 flex items-center justify-center text-xs font-bold bg-blue-500 text-white rounded-full">
              {chat.unreadCount! > 9 ? "9+" : chat.unreadCount}
            </span>
          )}
        </div>
      </div>
    </button>
  );
}

// ============================================================================
// СЕКЦИЯ ЧАТОВ
// ============================================================================

interface ChatSectionProps {
  title: string;
  icon: React.ReactNode;
  chats: Chat[];
  selectedChat: Chat | null;
  currentUserId: string | null;
  defaultExpanded?: boolean;
  onSelectChat: (chat: Chat) => void;
}

function ChatSection({
  title,
  icon,
  chats,
  selectedChat,
  currentUserId,
  defaultExpanded = true,
  onSelectChat,
}: ChatSectionProps) {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);
  const unreadCount = chats.reduce((sum, c) => sum + (c.unreadCount || 0), 0);

  if (chats.length === 0) return null;

  return (
    <div className="mb-2">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center justify-between px-3 py-2 text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-colors"
      >
        <div className="flex items-center gap-2">
          {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
          {icon}
          <span className="font-semibold text-xs uppercase tracking-wider">{title}</span>
          <span className="text-xs text-gray-400">({chats.length})</span>
        </div>
        {unreadCount > 0 && (
          <span className="px-2 py-0.5 text-xs font-bold bg-blue-500 text-white rounded-full">
            {unreadCount}
          </span>
        )}
      </button>

      {isExpanded && (
        <div className="space-y-1 px-1">
          {chats.map((chat) => (
            <ChatListItem
              key={chat.id}
              chat={chat}
              isSelected={selectedChat?.id === chat.id}
              currentUserId={currentUserId}
              onClick={() => onSelectChat(chat)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// ОСНОВНОЙ КОМПОНЕНТ
// ============================================================================

export default function SlackStyleSidebar({
  chats,
  selectedChat,
  loading,
  currentUserId,
  isChairman = false,
  onSelectChat,
  onCreateChat,
  onCreateGroup,
  onOpenAIChat,
}: SlackStyleSidebarProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [activeTab, setActiveTab] = useState<"all" | "work" | "personal">("all");
  const [showNewChatModal, setShowNewChatModal] = useState(false);

  // Разделяем чаты по категориям
  const { workChats, personalChats, aiChat } = useMemo(() => {
    const filtered = searchQuery
      ? chats.filter((chat) => {
          const name = getChatDisplayName(chat, currentUserId);
          return name.toLowerCase().includes(searchQuery.toLowerCase());
        })
      : chats;

    const work: Chat[] = [];
    const personal: Chat[] = [];
    let ai: Chat | null = null;

    for (const chat of filtered) {
      // Сначала проверяем, является ли это AI чатом
      const isAI = isAIChat(chat);
      
      if (isAI) {
        // Если это ИИ-чат, сохраняем первый найденный и НЕ добавляем в personal
        if (!ai) {
          ai = chat;
        }
        // Все остальные ИИ-чаты просто пропускаем (не добавляем никуда)
        continue; // Явно пропускаем, чтобы не попало в personal
      }
      
      // Если не AI чат, проверяем остальные категории
      if (isWorkChat(chat)) {
        work.push(chat);
      } else {
        // Дополнительная проверка: убеждаемся, что это точно не AI чат
        // (на случай, если isAIChat вернул false, но мы хотим быть уверены)
        if (!isAIChat(chat)) {
          personal.push(chat);
        }
      }
    }

    return { workChats: work, personalChats: personal, aiChat: ai };
  }, [chats, searchQuery, currentUserId]);

  const displayedChats = useMemo(() => {
    switch (activeTab) {
      case "work": return { work: workChats, personal: [], ai: null };
      case "personal": return { work: [], personal: personalChats, ai: null };
      default: return { work: workChats, personal: personalChats, ai: aiChat };
    }
  }, [activeTab, workChats, personalChats, aiChat]);

  const handleAIChatClick = useCallback(() => {
    if (aiChat) {
      onSelectChat(aiChat);
    } else if (onOpenAIChat) {
      onOpenAIChat();
    }
  }, [aiChat, onSelectChat, onOpenAIChat]);

  const handleCreateChat = useCallback((userId: string) => {
    onCreateChat?.(userId);
  }, [onCreateChat]);

  if (loading) {
    return (
      <div className="h-full flex flex-col bg-white dark:bg-gray-900">
        <div className="p-4 space-y-4">
          <div className="h-12 bg-gray-200 dark:bg-gray-800 rounded-xl animate-pulse" />
          <div className="space-y-3">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="flex items-center gap-3 animate-pulse">
                <div className="w-11 h-11 rounded-xl bg-gray-200 dark:bg-gray-800" />
                <div className="flex-1">
                  <div className="h-4 bg-gray-200 dark:bg-gray-800 rounded w-3/4 mb-2" />
                  <div className="h-3 bg-gray-200 dark:bg-gray-800 rounded w-1/2" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-white dark:bg-gray-900">
      {/* Header */}
      <div className="p-4 border-b border-gray-100 dark:border-gray-800">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-xl font-bold text-gray-900 dark:text-white">
            Чаты
          </h1>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setShowNewChatModal(true)}
              className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
              title="Новый чат"
            >
              <MessageCircle className="w-5 h-5 text-gray-600 dark:text-gray-300" />
            </button>
            {isChairman && onCreateGroup && (
              <button
                onClick={onCreateGroup}
                className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
                title="Создать группу"
              >
                <Users className="w-5 h-5 text-gray-600 dark:text-gray-300" />
              </button>
            )}
          </div>
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="Поиск чатов..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 bg-gray-100 dark:bg-gray-800 border-0 rounded-xl text-sm text-gray-900 dark:text-gray-100 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        {/* Tabs for Chairman */}
        {isChairman && (
          <div className="flex mt-3 bg-gray-100 dark:bg-gray-800 rounded-xl p-1">
            {[
              { key: "all", label: "Все" },
              { key: "work", label: "Рабочие" },
              { key: "personal", label: "Личные" },
            ].map(({ key, label }) => (
              <button
                key={key}
                onClick={() => setActiveTab(key as any)}
                className={`flex-1 py-2 px-3 text-sm font-medium rounded-lg transition-all ${
                  activeTab === key
                    ? "bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm"
                    : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Chat List */}
      <div className="flex-1 overflow-y-auto p-2">
        {/* AI Chat - Always on top */}
        <button
          onClick={handleAIChatClick}
          className={`
            w-full flex items-center gap-3 px-3 py-3 rounded-xl text-left transition-all duration-150 mb-3
            ${aiChat && selectedChat?.id === aiChat.id
              ? "bg-gradient-to-r from-purple-100 to-blue-100 dark:from-purple-900/30 dark:to-blue-900/30 shadow-sm"
              : "bg-gradient-to-r from-purple-50 to-blue-50 dark:from-purple-900/10 dark:to-blue-900/10 hover:from-purple-100 hover:to-blue-100 dark:hover:from-purple-900/20 dark:hover:to-blue-900/20"
            }
          `}
        >
          <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-purple-500 to-blue-500 flex items-center justify-center shadow-lg">
            <Bot className="w-5 h-5 text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="font-semibold text-sm text-gray-900 dark:text-white">
              ИИ-Ассистент
            </div>
            <div className="text-xs text-gray-500 dark:text-gray-400">
              Помощник по профсоюзным вопросам
            </div>
          </div>
          <div className="w-2.5 h-2.5 bg-green-500 rounded-full animate-pulse" />
        </button>

        {/* Work Chats */}
        {isChairman && (activeTab === "all" || activeTab === "work") && displayedChats.work.length > 0 && (
          <ChatSection
            title="Рабочие чаты"
            icon={<Briefcase className="w-4 h-4" />}
            chats={displayedChats.work}
            selectedChat={selectedChat}
            currentUserId={currentUserId}
            onSelectChat={onSelectChat}
          />
        )}

        {/* Personal Chats */}
        {(activeTab === "all" || activeTab === "personal") && displayedChats.personal.length > 0 && (
          <ChatSection
            title={isChairman ? "Личные чаты" : "Чаты"}
            icon={<MessageCircle className="w-4 h-4" />}
            chats={displayedChats.personal.filter(chat => !isAIChat(chat))} // Дополнительная фильтрация AI чатов
            selectedChat={selectedChat}
            currentUserId={currentUserId}
            onSelectChat={onSelectChat}
          />
        )}

        {/* Empty state */}
        {!loading && chats.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-center p-6">
            <div className="w-16 h-16 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center mb-4">
              <MessageCircle className="w-8 h-8 text-gray-400" />
            </div>
            <p className="text-gray-500 dark:text-gray-400 mb-4">
              У вас пока нет чатов
            </p>
            <button
              onClick={() => setShowNewChatModal(true)}
              className="px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-xl font-medium transition-colors"
            >
              Начать чат
            </button>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="p-3 border-t border-gray-100 dark:border-gray-800">
        <div className="flex items-center gap-2 text-xs text-gray-400 dark:text-gray-500">
          <div className="w-2 h-2 bg-green-500 rounded-full" />
          <span>Подключено</span>
        </div>
      </div>

      {/* New Chat Modal */}
      <NewChatModal
        isOpen={showNewChatModal}
        onClose={() => setShowNewChatModal(false)}
        onSelectUser={handleCreateChat}
        currentUserId={currentUserId}
      />
    </div>
  );
}
