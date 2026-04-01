"use client";

import { useState, useMemo, useCallback, useEffect } from "react";
import { useSession } from "next-auth/react";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import { formatLastSeen } from "@/lib/format-last-seen";
import { safeJsonParse } from "@/lib/api-client";
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
  UserMinus,
  X,
  Check,
  Loader2,
  Image as ImageIcon,
  Archive,
  FolderPlus,
  Folder,
  FolderOpen,
  Files,
  ClipboardList,
  ArrowLeft,
  Trash2,
  Headset,
  Building2,
  BarChart3,
  NotebookPen,
  Star,
  Flame,
  Lightbulb,
  Target,
} from "lucide-react";
import CreateFolderModal from "./CreateFolderModal";
import { Chat, ChatUser } from "@/types/chat";
import styles from "./SlackStyleSidebar.module.css";

// Цвета папок (тот же порядок, что в CreateFolderModal) для маппинга в классы
const FOLDER_COLOR_HEXES = ["#3B82F6", "#10B981", "#F59E0B", "#EF4444", "#8B5CF6", "#EC4899", "#6B7280"];
const FOLDER_ICON_CLASSES = [
  styles.folderIconBlue,
  styles.folderIconGreen,
  styles.folderIconOrange,
  styles.folderIconRed,
  styles.folderIconViolet,
  styles.folderIconPink,
  styles.folderIconGray,
];
function getFolderIconClass(color: string | null | undefined): string {
  if (!color) return styles.folderIconDefault;
  const i = FOLDER_COLOR_HEXES.indexOf(color);
  return i >= 0 ? FOLDER_ICON_CLASSES[i] : styles.folderIconDefault;
}

function renderFolderIcon(icon: string | null | undefined, className: string) {
  switch (icon) {
    case "folder-open":
      return <FolderOpen className={className} />;
    case "files":
      return <Files className={className} />;
    case "clipboard":
      return <ClipboardList className={className} />;
    case "briefcase":
      return <Briefcase className={className} />;
    case "building":
      return <Building2 className={className} />;
    case "chart":
      return <BarChart3 className={className} />;
    case "notes":
      return <NotebookPen className={className} />;
    case "star":
      return <Star className={className} />;
    case "flame":
      return <Flame className={className} />;
    case "idea":
      return <Lightbulb className={className} />;
    case "target":
      return <Target className={className} />;
    case "folder":
    default:
      return <Folder className={className} />;
  }
}

// ============================================================================
// ТИПЫ
// ============================================================================

export type ChatCategory = "work" | "personal" | "ai";

// Интерфейс для папки чатов
export interface ChatFolder {
  id: string;
  name: string;
  icon?: string;
  color?: string | null;
  order: number;
  chatCount: number;
  unreadCount: number;
  chats: Array<{
    id: string;
    type: string;
    name?: string;
    avatarUrl?: string | null;
  }>;
  createdAt?: string;
  updatedAt?: string;
}

export interface SlackStyleSidebarProps {
  chats: Chat[];
  selectedChat: Chat | null;
  loading: boolean;
  currentUserId: string | null;
  isChairman?: boolean;
  /** Может ли пользователь создавать папки (председатель, сотрудник, член выборного органа) */
  canCreateFolders?: boolean;
  onSelectChat: (chat: Chat) => void;
  onCreateChat?: (userId: string) => void;
  onCreateGroup?: () => void;
  onCreateChannel?: () => void;
  onOpenAIChat?: () => void;
  /** Вызывается при переходе на вкладку «Архив» — обновить список без кэша */
  onArchiveTabFocus?: () => void;
  /** ID пользователя техподдержки (из GET /api/chat) — чтобы открыть чат до первого сообщения */
  supportUserId?: string | null;
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
  if (chat.type === "GROUP" || chat.type === "CHANNEL") {
    // Для канала приоритет: displayName из API (название ППО), затем name
    const fromApi = (chat as any).displayName ?? (chat.otherUser as any)?.lastName;
    const name = fromApi || chat.name || (chat.type === "CHANNEL" ? "Канал" : "Групповой чат");
    return name === "Основной" ? (fromApi || "Канал организации") : name;
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
  if (chat.type === "CHANNEL") {
    return chat.iconUrl || null;
  }
  if (chat.type === "GROUP") {
    return chat.iconUrl || null;
  }
  // Удалённый пользователь — плейсхолдер без фото
  if ((chat.otherUser as { isDeleted?: boolean })?.isDeleted) {
    return null;
  }
  return chat.otherUser?.avatarUrl || null;
}

function isWorkChat(chat: Chat): boolean {
  // Рабочие чаты: только обращения (любой тип с ticketId или ticket, но НЕ каналы)
  const hasTicket = !!(chat.ticketId || chat.ticketPublicId || (chat as any).ticket);
  // Исключаем каналы - они в отдельной секции
  return hasTicket && chat.type !== 'CHANNEL';
}

// Вспомогательная функция для проверки наличия обращения
function hasTicket(chat: Chat): boolean {
  return !!(chat.ticketId || chat.ticketPublicId || (chat as any).ticket);
}

function isChannelChat(chat: Chat): boolean {
  // Каналы: только CHANNEL тип
  return chat.type === 'CHANNEL';
}

function isAIChat(chat: Chat): boolean {
  if ((chat as any).isAIChat === true) return true;
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
  return false;
}

function isSupportChat(chat: Chat): boolean {
  if ((chat as any).isSupportChat === true) return true;
  const name = (chat as any).displayName || chat.name || "";
  return name === "Техподдержка" || name.toLowerCase().includes("техподдерж");
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
        const data = await safeJsonParse(response);
        // Фильтруем текущего пользователя
        setUsers((data?.users || []).filter((u: UserSearchResult) => u.id !== currentUserId));
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
            type="button"
            onClick={onClose}
            className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
            aria-label="Закрыть"
          >
            <X className="w-5 h-5 text-gray-500" aria-hidden="true" />
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
// КОМПОНЕНТ АВАТАРА КАНАЛА
// ============================================================================

function ChannelAvatar({ src, alt }: { src: string; alt: string }) {
  const [imageError, setImageError] = useState(false);
  const [cdnUrl, setCdnUrl] = useState<string | null>(null);

  // Используем CDN для иконок каналов (только на клиенте после гидратации)
  useEffect(() => {
    if (!src) {
      setCdnUrl(null);
      return;
    }

    // Если это уже полный URL, используем как есть
    if (src.startsWith('http://') || src.startsWith('https://') || src.startsWith('data:')) {
      setCdnUrl(src);
      return;
    }

    // Пытаемся получить CDN URL с обработкой ошибок
    try {
      const { getFileUrlWithCDN } = require("@/lib/cdn");
      const cdnUrl = getFileUrlWithCDN(src, true);
      setCdnUrl(cdnUrl);
    } catch (error) {
      // В случае ошибки используем оригинальный URL
      console.warn('[ChannelAvatar] Failed to get CDN URL, using original:', error);
      setCdnUrl(src);
    }
  }, [src]);

  if (imageError || !src) {
    return (
      <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-blue-400 to-purple-500 flex items-center justify-center shadow-sm">
        <ImageIcon className="w-6 h-6 text-white" />
      </div>
    );
  }

  // Используем оригинальный src до завершения гидратации, затем переключаемся на CDN URL
  const displayUrl = cdnUrl !== null ? cdnUrl : src;

  return (
    <img
      src={displayUrl}
      alt={alt}
      className="w-11 h-11 rounded-xl object-cover"
      onError={() => setImageError(true)}
    />
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
  const isGroup = chat.type === "GROUP" || chat.type === "CHANNEL";
  const isAI = isAIChat(chat);
  const hasUnread = (chat.unreadCount || 0) > 0;
  
  // Проверяем онлайн статус для личных чатов (исключаем удалённого пользователя)
  const isDeleted = (chat.otherUser as { isDeleted?: boolean; id?: string })?.isDeleted || chat.otherUser?.id === "deleted";
  const otherUserId = !isGroup && !isAI && chat.otherUser?.id && !isDeleted && chat.otherUser.id !== "deleted" ? [chat.otherUser.id] : [];
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
        ) : chat.type === "CHANNEL" ? (
          // Для каналов показываем иконку канала или заглушку с иконкой изображения
          avatar ? (
            <ChannelAvatar src={avatar} alt={displayName} />
          ) : (
            <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-blue-400 to-purple-500 flex items-center justify-center shadow-sm">
              <ImageIcon className="w-6 h-6 text-white" />
            </div>
          )
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
        ) : isDeleted ? (
          <div className="w-11 h-11 rounded-full bg-gray-300 dark:bg-gray-600 flex items-center justify-center text-gray-600 dark:text-gray-300" title="Удалённый пользователь">
            <UserMinus className="w-5 h-5" />
          </div>
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
          <div className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full border-2 border-white dark:border-gray-900 bg-green-500" />
        ) : !isGroup && !isDeleted && (
          <div className={`absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full border-2 border-white dark:border-gray-900 ${
            isOtherUserOnline ? 'bg-green-500' : 'bg-gray-400'
          }`} />
        )}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between mb-0.5">
          <div className="flex items-center gap-1.5 min-w-0">
            <span className={`font-semibold text-sm truncate text-gray-900 dark:text-white ${hasUnread ? "font-bold" : ""}`}>
              {displayName}
            </span>
            {(chat as any).archivedAt && (
              <span title="В архиве">
                <Archive className="w-3.5 h-3.5 flex-shrink-0 text-gray-400 dark:text-gray-500" />
              </span>
            )}
          </div>
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
  canCreateFolders = false,
  onSelectChat,
  onCreateChat,
  onCreateGroup,
  onCreateChannel,
  onOpenAIChat,
  onArchiveTabFocus,
  supportUserId = null,
}: SlackStyleSidebarProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [activeTab, setActiveTab] = useState<"all" | "work" | "personal" | "archived">("all");

  const handleTabChange = useCallback((key: "all" | "work" | "personal" | "archived") => {
    setActiveTab(key);
    if (key === "archived") onArchiveTabFocus?.();
  }, [onArchiveTabFocus]);
  const [showNewChatModal, setShowNewChatModal] = useState(false);
  
  // Состояния для папок
  const [folders, setFolders] = useState<ChatFolder[]>([]);
  const [foldersLoading, setFoldersLoading] = useState(false);
  const [showCreateFolderModal, setShowCreateFolderModal] = useState(false);
  const [openFolderId, setOpenFolderId] = useState<string | null>(null);
  const [deletingFolderId, setDeletingFolderId] = useState<string | null>(null);

  // Загрузка папок
  const loadFolders = useCallback(async () => {
    if (!canCreateFolders && !isChairman) return;
    
    setFoldersLoading(true);
    try {
      const response = await fetch("/api/chat/folders");
      if (response.ok) {
        const data = await safeJsonParse(response);
        setFolders(data?.folders || []);
      }
    } catch (error) {
      console.error("Failed to load folders:", error);
    } finally {
      setFoldersLoading(false);
    }
  }, [canCreateFolders, isChairman]);

  // Загружаем папки при монтировании и при изменении чатов (для обновления непрочитанных)
  useEffect(() => {
    if (canCreateFolders || isChairman) {
      loadFolders();
    }
  }, [canCreateFolders, isChairman, loadFolders]);

  // Обновляем непрочитанные в папках при изменении чатов
  useEffect(() => {
    if ((canCreateFolders || isChairman) && folders.length > 0) {
      // Debounce обновления папок при изменении чатов
      const timer = setTimeout(() => {
        loadFolders();
      }, 1000);
      return () => clearTimeout(timer);
    }
  }, [chats, canCreateFolders, isChairman]); // eslint-disable-line react-hooks/exhaustive-deps

  // Создание папки
  const handleCreateFolder = useCallback(async (data: { name: string; chatIds: string[]; icon?: string; color?: string }) => {
    const response = await fetch("/api/chat/folders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    
    if (!response.ok) {
      const error = await safeJsonParse(response);
      throw new Error(error?.error || "Ошибка создания папки");
    }
    
    // Перезагружаем папки
    await loadFolders();
  }, [loadFolders]);

  // Удаление (разбор) папки
  const handleDeleteFolder = useCallback(async (folderId: string) => {
    if (!confirm("Вы уверены, что хотите разобрать эту папку? Чаты останутся на месте.")) {
      return;
    }
    
    setDeletingFolderId(folderId);
    try {
      const response = await fetch(`/api/chat/folders/${folderId}`, {
        method: "DELETE",
      });
      
      if (response.ok) {
        // Если была открыта удаляемая папка, закрываем её
        if (openFolderId === folderId) {
          setOpenFolderId(null);
        }
        // Перезагружаем папки
        await loadFolders();
      } else {
        const error = await safeJsonParse(response);
        alert(error?.error || "Ошибка удаления папки");
      }
    } catch (error) {
      console.error("Failed to delete folder:", error);
      alert("Ошибка удаления папки");
    } finally {
      setDeletingFolderId(null);
    }
  }, [openFolderId, loadFolders]);

  // Получаем чаты внутри открытой папки
  const openFolder = useMemo(() => {
    if (!openFolderId) return null;
    return folders.find(f => f.id === openFolderId) || null;
  }, [folders, openFolderId]);

  // Получаем ID чатов, которые находятся в папках (для скрытия из общего списка)
  const chatsInFolders = useMemo(() => {
    const ids = new Set<string>();
    folders.forEach(folder => {
      folder.chats.forEach(chat => ids.add(chat.id));
    });
    return ids;
  }, [folders]);

  // Разделяем чаты по категориям
  const { workChats, personalChats, channels, archivedChats, aiChat, supportChat } = useMemo(() => {
    // Фильтруем по поиску
    let filtered = searchQuery
      ? chats.filter((chat) => {
          const name = getChatDisplayName(chat, currentUserId);
          return name.toLowerCase().includes(searchQuery.toLowerCase());
        })
      : chats;

    // Если не смотрим содержимое папки, скрываем чаты из папок
    if (!openFolderId) {
      filtered = filtered.filter(chat => !chatsInFolders.has(chat.id));
    }

    const work: Chat[] = [];
    const personal: Chat[] = [];
    const channelList: Chat[] = [];
    const archived: Chat[] = [];
    let ai: Chat | null = null;
    let support: Chat | null = null;

    for (const chat of filtered) {
      const isAI = isAIChat(chat);
      if (isAI) {
        if (!ai) ai = chat;
        continue;
      }
      const isSupport = isSupportChat(chat);
      if (isSupport) {
        if (!support) support = chat;
        continue;
      }

      // Проверяем, архивирован ли чат
      const isArchived = !!(chat as any).archivedAt;
      
      if (isArchived) {
        // Архивные чаты идут в отдельный список
        archived.push(chat);
        continue;
      }
      
      // Каналы - отдельная секция (обрабатываем первыми)
      if (isChannelChat(chat)) {
        channelList.push(chat);
        continue; // Каналы не должны попадать в другие категории
      }
      
      // Проверяем наличие обращения (ticketId) - проверяем все возможные варианты
      // Данные могут быть в chat.ticketId, chat.ticketPublicId или в chat.ticket (объект из relation)
      const hasTicket = !!(
        chat.ticketId ||
        chat.ticketPublicId ||
        (chat as any).ticket?.id ||
        (chat as any).ticket?.publicId
      );
      // Чат заседания (групповой чат, привязанный к заседанию)
      const isMeetingChat = !!(chat as any).meetingId;

      // Рабочие чаты: обращения (ticketId) и чаты заседаний (meetingId)
      if (hasTicket || isMeetingChat) {
        work.push(chat);
      } else if (chat.type === 'PRIVATE') {
        // Личные чаты: только приватные чаты без ticketId и не заседания
        personal.push(chat);
      } else {
        // Остальные групповые чаты — в личные
        personal.push(chat);
      }
    }

    return { workChats: work, personalChats: personal, channels: channelList, archivedChats: archived, aiChat: ai, supportChat: support };
  }, [chats, searchQuery, currentUserId, openFolderId, chatsInFolders]);

  const displayedChats = useMemo(() => {
    // ИИ и Техподдержка показываем на всех вкладках
    switch (activeTab) {
      case "work":
        return { work: workChats, personal: [], channels: channels, archived: [], ai: aiChat, support: supportChat };
      case "personal":
        return { work: [], personal: personalChats, channels: [], archived: [], ai: aiChat, support: supportChat };
      case "archived":
        return { work: [], personal: [], channels: [], archived: archivedChats, ai: aiChat, support: supportChat };
      default:
        // На вкладке «Все» показываем и архив, чтобы завершённые чаты заседаний были видны в блоке «Архив»
        return { work: workChats, personal: personalChats, channels: channels, archived: archivedChats, ai: aiChat, support: supportChat };
    }
  }, [activeTab, workChats, personalChats, channels, archivedChats, aiChat, supportChat]);

  const handleAIChatClick = useCallback(() => {
    if (aiChat) {
      onSelectChat(aiChat);
    } else if (onOpenAIChat) {
      onOpenAIChat();
    }
  }, [aiChat, onSelectChat, onOpenAIChat]);

  const handleSupportChatClick = useCallback(() => {
    if (supportChat) {
      onSelectChat(supportChat);
      return;
    }
    if (supportUserId && onCreateChat) onCreateChat(supportUserId);
  }, [supportChat, supportUserId, onCreateChat, onSelectChat]);

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
            {isChairman && onCreateChannel && (
              <button
                onClick={onCreateChannel}
                className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
                title="Создать канал"
              >
                <Hash className="w-5 h-5 text-gray-600 dark:text-gray-300" />
              </button>
            )}
            {(canCreateFolders || isChairman) && (
              <button
                onClick={() => setShowCreateFolderModal(true)}
                className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
                title="Создать папку"
              >
                <FolderPlus className="w-5 h-5 text-gray-600 dark:text-gray-300" />
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

        {/* Табы фильтрации - показываем всем пользователям */}
        {/* Для председателей: Все, Рабочие, Личные, Архив */}
        {/* Для участников: Все, Архив */}
        <div className="flex mt-3 bg-gray-100 dark:bg-gray-800 rounded-xl p-1">
          {(isChairman
            ? [
                { key: "all", label: "Все" },
                { key: "work", label: "Рабочие" },
                { key: "personal", label: "Личные" },
                { key: "archived", label: "Архив" },
              ]
            : [
                { key: "all", label: "Все" },
                { key: "archived", label: "Архив" },
              ]
          ).map(({ key, label }) => (
            <button
              key={key}
              onClick={() => handleTabChange(key as "all" | "work" | "personal" | "archived")}
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
      </div>

      {/* Chat List */}
      <div className="flex-1 overflow-y-auto p-2">
        {/* AI Chat - Always on top */}
        <button
          onClick={handleAIChatClick}
          className={`
            w-full flex items-center gap-3 px-3 py-3 rounded-xl text-left transition-all duration-150 mb-2
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

        {/* Техподдержка - сразу под ИИ (показываем всегда, если есть id поддержки или уже есть чат) */}
        {(displayedChats.support || supportUserId) && (
          <button
            type="button"
            onClick={handleSupportChatClick}
            className={`
              w-full flex items-center gap-3 px-3 py-3 rounded-xl text-left transition-all duration-150 mb-3
              ${supportChat && selectedChat?.id === supportChat.id
                ? "bg-amber-100 dark:bg-amber-900/30 shadow-sm"
                : "bg-amber-50 dark:bg-amber-900/10 hover:bg-amber-100 dark:hover:bg-amber-900/20"
              }
            `}
            aria-label="Чат с техподдержкой"
          >
            <div className="w-11 h-11 rounded-xl bg-amber-500 flex items-center justify-center shadow-lg">
              <Headset className="w-5 h-5 text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-semibold text-sm text-gray-900 dark:text-white">
                Техподдержка
              </div>
              <div className="text-xs text-gray-500 dark:text-gray-400">
                Вопросы по работе платформы
              </div>
            </div>
          </button>
        )}

        {/* Папки - показываем если есть и не открыта папка */}
        {!openFolderId && folders.length > 0 && activeTab === "all" && (
          <div className="mb-3">
            <div className="flex items-center gap-2 px-3 py-2 text-gray-500 dark:text-gray-400">
              <Folder className="w-4 h-4" />
              <span className="font-semibold text-xs uppercase tracking-wider">Папки</span>
              <span className="text-xs text-gray-400">({folders.length})</span>
            </div>
            <div className="space-y-1 px-1">
              {folders.map((folder) => (
                <div
                  key={folder.id}
                  className="group flex items-center gap-2"
                >
                  <button
                    onClick={() => setOpenFolderId(folder.id)}
                    className={`flex-1 flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-all duration-150 hover:bg-gray-100 dark:hover:bg-gray-800 ${
                      folder.unreadCount > 0 ? 'bg-blue-50 dark:bg-blue-900/10' : ''
                    }`}
                  >
                    {/* Иконка папки с индикатором непрочитанных */}
                    <div className="relative flex-shrink-0">
                      <div
                        className={`w-10 h-10 rounded-xl flex items-center justify-center text-xl ${getFolderIconClass(folder.color)}`}
                      >
                        {renderFolderIcon(folder.icon, "h-5 w-5")}
                      </div>
                      {/* Красная точка если есть непрочитанные */}
                      {folder.unreadCount > 0 && (
                        <div className="absolute -top-0.5 -right-0.5 w-3 h-3 bg-red-500 rounded-full border-2 border-white dark:border-gray-900" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className={`font-semibold text-sm truncate ${
                        folder.unreadCount > 0 
                          ? 'text-gray-900 dark:text-white font-bold' 
                          : 'text-gray-900 dark:text-white'
                      }`}>
                        {folder.name}
                      </div>
                      <div className="text-xs text-gray-500 dark:text-gray-400">
                        {folder.chatCount} чат{folder.chatCount === 1 ? '' : folder.chatCount < 5 ? 'а' : 'ов'}
                        {folder.unreadCount > 0 && (
                          <span className="text-blue-600 dark:text-blue-400 ml-1">
                            · {folder.unreadCount} непрочит.
                          </span>
                        )}
                      </div>
                    </div>
                    {/* Бейдж с числом непрочитанных */}
                    {folder.unreadCount > 0 && (
                      <span className="flex-shrink-0 min-w-[20px] h-5 px-1.5 flex items-center justify-center text-xs font-bold bg-blue-500 text-white rounded-full">
                        {folder.unreadCount > 99 ? "99+" : folder.unreadCount}
                      </span>
                    )}
                  </button>
                  <button
                    onClick={() => handleDeleteFolder(folder.id)}
                    disabled={deletingFolderId === folder.id}
                    className="p-2 opacity-0 group-hover:opacity-100 hover:bg-red-100 dark:hover:bg-red-900/20 rounded-lg transition-all"
                    title="Разобрать папку"
                  >
                    {deletingFolderId === folder.id ? (
                      <Loader2 className="w-4 h-4 text-gray-400 animate-spin" />
                    ) : (
                      <Trash2 className="w-4 h-4 text-red-500" />
                    )}
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Режим просмотра содержимого папки */}
        {openFolder && (
          <div className="mb-3">
            {/* Кнопка "Назад" и название папки */}
            <div className="flex items-center gap-2 px-3 py-2 mb-2">
              <button
                onClick={() => setOpenFolderId(null)}
                className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
                title="Назад к списку"
              >
                <ArrowLeft className="w-4 h-4 text-gray-600 dark:text-gray-300" />
              </button>
              <div
                className={`w-8 h-8 rounded-lg flex items-center justify-center text-lg ${getFolderIconClass(openFolder.color)}`}
              >
                {renderFolderIcon(openFolder.icon, "h-4 w-4")}
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-semibold text-sm text-gray-900 dark:text-white truncate">
                  {openFolder.name}
                </div>
                <div className="text-xs text-gray-500 dark:text-gray-400">
                  {openFolder.chatCount} чат{openFolder.chatCount === 1 ? '' : openFolder.chatCount < 5 ? 'а' : 'ов'}
                </div>
              </div>
              <button
                onClick={() => handleDeleteFolder(openFolder.id)}
                disabled={deletingFolderId === openFolder.id}
                className="p-2 hover:bg-red-100 dark:hover:bg-red-900/20 rounded-lg transition-all"
                title="Разобрать папку"
              >
                {deletingFolderId === openFolder.id ? (
                  <Loader2 className="w-4 h-4 text-gray-400 animate-spin" />
                ) : (
                  <Trash2 className="w-4 h-4 text-red-500" />
                )}
              </button>
            </div>
            
            {/* Чаты внутри папки */}
            <div className="space-y-1 px-1">
              {openFolder.chats.map((folderChat) => {
                const chat = chats.find(c => c.id === folderChat.id);
                if (!chat) return null;
                return (
                  <ChatListItem
                    key={chat.id}
                    chat={chat}
                    isSelected={selectedChat?.id === chat.id}
                    currentUserId={currentUserId}
                    onClick={() => onSelectChat(chat)}
                  />
                );
              })}
            </div>
          </div>
        )}

        {/* Work Chats (Обращения) - показываем если есть и папка не открыта */}
        {!openFolderId && displayedChats.work.length > 0 && (
          <ChatSection
            title={isChairman ? "Рабочие чаты" : "Мои обращения"}
            icon={<Briefcase className="w-4 h-4" />}
            chats={displayedChats.work}
            selectedChat={selectedChat}
            currentUserId={currentUserId}
            onSelectChat={onSelectChat}
          />
        )}
        {/* Пустое состояние для рабочих чатов (только на вкладке "Рабочие") */}
        {!openFolderId && activeTab === "work" && displayedChats.work.length === 0 && (
          <div className="mb-4 px-3">
            <div className="flex items-center gap-2 mb-2 px-1">
              <Briefcase className="w-4 h-4 text-gray-400 dark:text-gray-500" />
              <h3 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                Рабочие чаты
              </h3>
            </div>
            <div className="rounded-xl border-2 border-dashed border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 p-6 text-center">
              <div className="w-12 h-12 mx-auto mb-3 rounded-full bg-gray-100 dark:bg-gray-700 flex items-center justify-center">
                <Briefcase className="w-6 h-6 text-gray-400 dark:text-gray-500" />
              </div>
              <p className="text-sm font-medium text-gray-600 dark:text-gray-400 mb-1">
                Нет обращений
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-500">
                Обращения будут отображаться здесь
              </p>
            </div>
          </div>
        )}

        {/* Personal Chats - показываем если есть */}
        {!openFolderId && displayedChats.personal.length > 0 && (
          <ChatSection
            title={isChairman ? "Личные чаты" : "Чаты"}
            icon={<MessageCircle className="w-4 h-4" />}
            chats={displayedChats.personal.filter(chat => !isAIChat(chat))}
            selectedChat={selectedChat}
            currentUserId={currentUserId}
            onSelectChat={onSelectChat}
          />
        )}

        {/* Channels - показываем если есть */}
        {!openFolderId && displayedChats.channels.length > 0 && (
          <ChatSection
            title="Каналы"
            icon={<Hash className="w-4 h-4" />}
            chats={displayedChats.channels}
            selectedChat={selectedChat}
            currentUserId={currentUserId}
            onSelectChat={onSelectChat}
          />
        )}

        {/* Archived Chats - показываем если есть или на вкладке "Архив" */}
        {!openFolderId && (activeTab === "archived" || displayedChats.archived.length > 0) && (
          <>
            {displayedChats.archived.length > 0 ? (
              <ChatSection
                title="Архив"
                icon={<Archive className="w-4 h-4" />}
                chats={displayedChats.archived}
                selectedChat={selectedChat}
                currentUserId={currentUserId}
                onSelectChat={onSelectChat}
              />
            ) : activeTab === "archived" ? (
              <div className="mb-4 px-3">
                <div className="flex items-center gap-2 mb-2 px-1">
                  <Archive className="w-4 h-4 text-gray-400 dark:text-gray-500" />
                  <h3 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                    Архив
                  </h3>
                </div>
                <div className="rounded-xl border-2 border-dashed border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 p-6 text-center">
                  <div className="w-12 h-12 mx-auto mb-3 rounded-full bg-gray-100 dark:bg-gray-700 flex items-center justify-center">
                    <Archive className="w-6 h-6 text-gray-400 dark:text-gray-500" />
                  </div>
                  <p className="text-sm font-medium text-gray-600 dark:text-gray-400 mb-1">
                    Архив пуст
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-500">
                    Закрытые обращения и завершённые заседания будут здесь
                  </p>
                </div>
              </div>
            ) : null}
          </>
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

      {/* Create Folder Modal */}
      {(canCreateFolders || isChairman) && (
        <CreateFolderModal
          isOpen={showCreateFolderModal}
          onClose={() => setShowCreateFolderModal(false)}
          onCreate={handleCreateFolder}
          chats={chats}
          currentUserId={currentUserId || undefined}
        />
      )}
    </div>
  );
}
