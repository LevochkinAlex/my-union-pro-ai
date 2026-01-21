"use client";

import { useState, useMemo, useCallback } from "react";
import { useSession } from "next-auth/react";
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
  Settings,
  Bell,
  Archive,
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
  // Рабочий чат = групповой чат, связанный с обращением
  return chat.type === "GROUP" && (!!chat.ticketId || !!chat.ticketPublicId);
}

function isAIChat(chat: Chat): boolean {
  // ИИ чат определяется по имени или специальному флагу
  const aiNames = ["ИИ-Ассистент", "AI Assistant", "Помощник", "Бот"];
  return chat.name ? aiNames.some(name => chat.name?.toLowerCase().includes(name.toLowerCase())) : false;
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

// ============================================================================
// КОМПОНЕНТЫ
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

  return (
    <button
      onClick={onClick}
      className={`
        w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left transition-all duration-150
        ${isSelected
          ? "bg-blue-100 dark:bg-blue-900/30 text-blue-900 dark:text-blue-100"
          : "hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-900 dark:text-gray-100"
        }
      `}
    >
      {/* Avatar / Icon */}
      <div className="relative flex-shrink-0">
        {isAI ? (
          <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-purple-500 to-blue-500 flex items-center justify-center">
            <Bot className="w-5 h-5 text-white" />
          </div>
        ) : isGroup ? (
          avatar ? (
            <img
              src={avatar}
              alt={displayName}
              className="w-9 h-9 rounded-lg object-cover"
            />
          ) : (
            <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-green-400 to-blue-500 flex items-center justify-center">
              <Hash className="w-5 h-5 text-white" />
            </div>
          )
        ) : avatar ? (
          <img
            src={avatar}
            alt={displayName}
            className="w-9 h-9 rounded-full object-cover"
          />
        ) : (
          <div className="w-9 h-9 rounded-full bg-gradient-to-br from-gray-400 to-gray-500 flex items-center justify-center text-white font-medium text-sm">
            {displayName[0]?.toUpperCase() || "?"}
          </div>
        )}
        
        {/* Online indicator for private chats */}
        {!isGroup && !isAI && (
          <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-green-500 rounded-full border-2 border-white dark:border-gray-900" />
        )}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between">
          <span className={`font-medium text-sm truncate ${hasUnread ? "font-semibold" : ""}`}>
            {displayName}
          </span>
          {chat.lastMessageAt && (
            <span className="text-xs text-gray-500 dark:text-gray-400 flex-shrink-0 ml-2">
              {formatLastMessageTime(chat.lastMessageAt)}
            </span>
          )}
        </div>
        
        <div className="flex items-center justify-between">
          <span className="text-xs text-gray-500 dark:text-gray-400 truncate">
            {chat.lastMessage || (isGroup ? `${chat.participantsCount || chat._count?.participants || 0} участников` : "Нет сообщений")}
          </span>
          
          {hasUnread && (
            <span className="flex-shrink-0 ml-2 px-1.5 py-0.5 text-xs font-semibold bg-blue-600 text-white rounded-full min-w-[20px] text-center">
              {chat.unreadCount! > 99 ? "99+" : chat.unreadCount}
            </span>
          )}
        </div>
      </div>
    </button>
  );
}

interface ChatSectionProps {
  title: string;
  icon: React.ReactNode;
  chats: Chat[];
  selectedChat: Chat | null;
  currentUserId: string | null;
  defaultExpanded?: boolean;
  onSelectChat: (chat: Chat) => void;
  actionButton?: React.ReactNode;
}

function ChatSection({
  title,
  icon,
  chats,
  selectedChat,
  currentUserId,
  defaultExpanded = true,
  onSelectChat,
  actionButton,
}: ChatSectionProps) {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);
  const unreadCount = chats.reduce((sum, c) => sum + (c.unreadCount || 0), 0);

  return (
    <div className="mb-2">
      {/* Section Header */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center justify-between px-3 py-2 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200 transition-colors"
      >
        <div className="flex items-center gap-2">
          {isExpanded ? (
            <ChevronDown className="w-4 h-4" />
          ) : (
            <ChevronRight className="w-4 h-4" />
          )}
          {icon}
          <span className="font-semibold text-xs uppercase tracking-wider">
            {title}
          </span>
          {unreadCount > 0 && (
            <span className="px-1.5 py-0.5 text-xs font-semibold bg-red-500 text-white rounded-full">
              {unreadCount}
            </span>
          )}
        </div>
        {actionButton}
      </button>

      {/* Section Content */}
      {isExpanded && (
        <div className="space-y-0.5">
          {chats.length === 0 ? (
            <div className="px-3 py-4 text-center text-gray-400 dark:text-gray-500 text-sm">
              Нет чатов
            </div>
          ) : (
            chats.map((chat) => (
              <ChatListItem
                key={chat.id}
                chat={chat}
                isSelected={selectedChat?.id === chat.id}
                currentUserId={currentUserId}
                onClick={() => onSelectChat(chat)}
              />
            ))
          )}
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
  const { data: session } = useSession();
  const [searchQuery, setSearchQuery] = useState("");
  const [activeTab, setActiveTab] = useState<"all" | "work" | "personal">("all");

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
      if (isAIChat(chat)) {
        ai = chat;
      } else if (isWorkChat(chat)) {
        work.push(chat);
      } else {
        personal.push(chat);
      }
    }

    return {
      workChats: work,
      personalChats: personal,
      aiChat: ai,
    };
  }, [chats, searchQuery, currentUserId]);

  // Фильтруем по активной вкладке
  const displayedChats = useMemo(() => {
    switch (activeTab) {
      case "work":
        return { work: workChats, personal: [], ai: null };
      case "personal":
        return { work: [], personal: personalChats, ai: null };
      default:
        return { work: workChats, personal: personalChats, ai: aiChat };
    }
  }, [activeTab, workChats, personalChats, aiChat]);

  // Обработчик клика по ИИ чату
  const handleAIChatClick = useCallback(() => {
    if (aiChat) {
      onSelectChat(aiChat);
    } else if (onOpenAIChat) {
      onOpenAIChat();
    }
  }, [aiChat, onSelectChat, onOpenAIChat]);

  if (loading) {
    return (
      <div className="h-full flex flex-col bg-gray-50 dark:bg-gray-900">
        <div className="p-4">
          <div className="h-10 bg-gray-200 dark:bg-gray-700 rounded-lg animate-pulse mb-4" />
          <div className="space-y-3">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="flex items-center gap-3 animate-pulse">
                <div className="w-9 h-9 rounded-lg bg-gray-200 dark:bg-gray-700" />
                <div className="flex-1">
                  <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-3/4 mb-1" />
                  <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-1/2" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-gray-50 dark:bg-gray-900">
      {/* Header */}
      <div className="p-4 border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-xl font-bold text-gray-900 dark:text-white">
            Чаты
          </h1>
          <div className="flex items-center gap-2">
            {isChairman && onCreateGroup && (
              <button
                onClick={onCreateGroup}
                className="p-2 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-lg transition-colors"
                title="Создать группу"
              >
                <Plus className="w-5 h-5 text-gray-600 dark:text-gray-300" />
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
            className="w-full pl-10 pr-4 py-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400"
          />
        </div>

        {/* Tabs for Chairman */}
        {isChairman && (
          <div className="flex mt-4 bg-gray-100 dark:bg-gray-800 rounded-lg p-1">
            <button
              onClick={() => setActiveTab("all")}
              className={`flex-1 py-1.5 px-3 text-sm font-medium rounded-md transition-colors ${
                activeTab === "all"
                  ? "bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm"
                  : "text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white"
              }`}
            >
              Все
            </button>
            <button
              onClick={() => setActiveTab("work")}
              className={`flex-1 py-1.5 px-3 text-sm font-medium rounded-md transition-colors ${
                activeTab === "work"
                  ? "bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm"
                  : "text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white"
              }`}
            >
              Рабочие
            </button>
            <button
              onClick={() => setActiveTab("personal")}
              className={`flex-1 py-1.5 px-3 text-sm font-medium rounded-md transition-colors ${
                activeTab === "personal"
                  ? "bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm"
                  : "text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white"
              }`}
            >
              Личные
            </button>
          </div>
        )}
      </div>

      {/* Chat List */}
      <div className="flex-1 overflow-y-auto p-2">
        {/* AI Chat - Always on top */}
        <button
          onClick={handleAIChatClick}
          className={`
            w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-all duration-150 mb-2
            ${aiChat && selectedChat?.id === aiChat.id
              ? "bg-purple-100 dark:bg-purple-900/30 text-purple-900 dark:text-purple-100"
              : "bg-gradient-to-r from-purple-50 to-blue-50 dark:from-purple-900/20 dark:to-blue-900/20 hover:from-purple-100 hover:to-blue-100 dark:hover:from-purple-900/30 dark:hover:to-blue-900/30"
            }
          `}
        >
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-500 to-blue-500 flex items-center justify-center shadow-lg">
            <Bot className="w-5 h-5 text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <span className="font-semibold text-sm text-gray-900 dark:text-white">
              ИИ-Ассистент
            </span>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Помощник по профсоюзным вопросам
            </p>
          </div>
          <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
        </button>

        {/* Work Chats (для председателя) */}
        {isChairman && (activeTab === "all" || activeTab === "work") && (
          <ChatSection
            title="Рабочие чаты"
            icon={<Briefcase className="w-4 h-4" />}
            chats={displayedChats.work}
            selectedChat={selectedChat}
            currentUserId={currentUserId}
            onSelectChat={onSelectChat}
            actionButton={
              <span className="text-xs text-gray-400">
                {workChats.length}
              </span>
            }
          />
        )}

        {/* Personal Chats */}
        {(activeTab === "all" || activeTab === "personal") && (
          <ChatSection
            title={isChairman ? "Личные чаты" : "Чаты"}
            icon={<MessageCircle className="w-4 h-4" />}
            chats={displayedChats.personal}
            selectedChat={selectedChat}
            currentUserId={currentUserId}
            onSelectChat={onSelectChat}
            actionButton={
              <span className="text-xs text-gray-400">
                {personalChats.length}
              </span>
            }
          />
        )}
      </div>

      {/* Footer */}
      <div className="p-3 border-t border-gray-200 dark:border-gray-700">
        <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
          <div className="w-2 h-2 bg-green-500 rounded-full" />
          <span>Подключено</span>
        </div>
      </div>
    </div>
  );
}
