"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import dynamic from "next/dynamic";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import { formatLastSeen } from "@/lib/format-last-seen";
import { safeJsonParse } from "@/lib/api-client";
import { normalizeUserAvatar } from "@/lib/api-helpers";
import { useToast } from "@/components/ui/Toast";
import { useChat } from "@/hooks/useChat";
import { Chat, Message } from "@/types/chat";
import clsx from "clsx";
import SlackStyleSidebar from "./SlackStyleSidebar";
import SlackStyleMessages from "./SlackStyleMessages";
import ChatInput from "./ChatInput";
import EmptyChatState from "./EmptyChatState";
import GroupChatModal from "./GroupChatModal";
import ThreadView from "./ThreadView";
import ChannelThreadView from "./ChannelThreadView";
import ImageModal from "./ImageModal";
import ChannelPostModal from "./ChannelPostModal";
import CloseAppealModal from "@/components/appeals/CloseAppealModal";
import ParticipantsPanel from "./ParticipantsPanel";
import AddParticipantModal from "./AddParticipantModal";
import {
  Users,
  Settings,
  ArrowLeft,
  MoreVertical,
  UserPlus,
  Hash,
  Bot,
  Info,
  Bell,
  Archive,
  Trash2,
  X,
  CheckCircle,
} from "lucide-react";

const AlertDialog = dynamic(() => import("@/components/ui/AlertDialog"), {
  ssr: false,
});

// ============================================================================
// ТИПЫ
// ============================================================================

export interface SlackStyleChatProps {
  isChairman?: boolean;
  baseUrl?: string;
  containerHeight?: string;
}

// ============================================================================
// ХЕЛПЕРЫ
// ============================================================================

// Форматирование даты создания канала
function formatChannelCreatedDate(createdAt: Date | string | null | undefined): string {
  if (!createdAt) return "";
  
  const date = typeof createdAt === 'string' ? new Date(createdAt) : createdAt;
  if (isNaN(date.getTime())) return "";
  
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const months = Math.floor(days / 30);
  const years = Math.floor(days / 365);
  
  if (years > 0) {
    return `Создан ${years} ${years === 1 ? 'год' : years < 5 ? 'года' : 'лет'} назад`;
  } else if (months > 0) {
    return `Создан ${months} ${months === 1 ? 'месяц' : months < 5 ? 'месяца' : 'месяцев'} назад`;
  } else if (days > 0) {
    return `Создан ${days} ${days === 1 ? 'день' : days < 5 ? 'дня' : 'дней'} назад`;
  } else {
    // Если создан сегодня, показываем дату
    const day = date.getDate().toString().padStart(2, '0');
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const year = date.getFullYear();
    return `Создан ${day}.${month}.${year}`;
  }
}

function getChatDisplayInfo(chat: Chat, currentUserId: string | null) {
  const isAI = chat.name === "ИИ-Ассистент";
  const isGroup = chat.type === "GROUP" || chat.type === "CHANNEL";
  const isChannel = chat.type === "CHANNEL";
  const isTicketChat = !!chat.ticketId || !!chat.ticketPublicId;

  let displayName = "Чат";
  let avatarUrl: string | null = null;
  let subtitle = "";

  if (isAI) {
    displayName = "ИИ-Ассистент";
    subtitle = "Всегда онлайн";
  } else if (isGroup) {
    displayName = chat.name || "Групповой чат";
    avatarUrl = chat.iconUrl || null;
    const participantsCount = chat.participantsCount || chat._count?.participants || 0;
    
    if (isChannel) {
      // Для каналов показываем дату создания
      const createdDate = formatChannelCreatedDate(chat.createdAt);
      if (createdDate) {
        subtitle = createdDate;
      } else {
        subtitle = `${participantsCount} участников`;
      }
    } else {
      subtitle = `${participantsCount} участников`;
    }
    
    if (isTicketChat && chat.ticketPublicId) {
      subtitle = `Обращение #${chat.ticketPublicId} · ${subtitle}`;
    }
  } else if (chat.otherUser) {
    displayName = [chat.otherUser.lastName, chat.otherUser.firstName]
      .filter(Boolean)
      .join(" ") || "Пользователь";
    // Нормализуем аватар через normalizeUserAvatar для правильного отображения
    const normalized = normalizeUserAvatar(chat.otherUser);
    avatarUrl = normalized.avatarUrl || null;
    subtitle = chat.otherUser.jobTitle || chat.otherUser.profession || "Онлайн";
  }

  return { displayName, avatarUrl, subtitle, isAI, isGroup, isTicketChat };
}

// ============================================================================
// ЗАГОЛОВОК ЧАТА
// ============================================================================

interface ChatHeaderProps {
  chat: Chat;
  currentUserId: string | null;
  onBack: () => void;
  onManageParticipants?: () => void;
  onEditGroup?: () => void;
  isCurrentUserAdmin?: boolean;
  ticketId?: string | null;
  ticketPublicId?: string | null;
  onCloseAppeal?: () => void;
  isChairman?: boolean; // Для проверки прав доступа
}

function ChatHeader({ chat, currentUserId, onBack, onManageParticipants, onEditGroup, isCurrentUserAdmin, ticketId, ticketPublicId, onCloseAppeal, isChairman = false }: ChatHeaderProps) {
  const [showMenu, setShowMenu] = useState(false);
  const router = useRouter();
  const { displayName, avatarUrl, subtitle, isAI, isGroup, isTicketChat } = getChatDisplayInfo(chat, currentUserId);
  const { showToast } = useToast();
  
  // Закрываем меню при клике вне его
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Element;
      if (showMenu && !target.closest('.relative') && !target.closest('.absolute')) {
        setShowMenu(false);
      }
    };
    
    if (showMenu) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [showMenu]);
  
  // Проверяем онлайн статус для личных чатов
  const otherUserId = !isGroup && !isAI && chat.otherUser?.id ? [chat.otherUser.id] : [];
  const { isOnline, getLastSeenAt } = useOnlineStatus(otherUserId);
  const isOtherUserOnline = otherUserId.length > 0 ? isOnline(otherUserId[0]) : false;
  const lastSeenAt = otherUserId.length > 0 ? getLastSeenAt(otherUserId[0]) : null;
  
  // Обновляем subtitle с реальным статусом
  // ИИ помощник всегда онлайн
  // Для каналов используем subtitle из getChatDisplayInfo (дата создания)
  // Для групповых чатов используем subtitle из getChatDisplayInfo (количество участников)
  // Для личных чатов показываем онлайн статус
  const statusSubtitle = isAI 
    ? "Всегда онлайн"
    : isGroup
      ? subtitle // Для групп и каналов используем subtitle (дата создания для каналов, количество участников для групп)
      : (isOtherUserOnline 
          ? "Онлайн" 
          : formatLastSeen(lastSeenAt, false));

  return (
    <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900">
      <div className="flex items-center gap-3 min-w-0">
        <button
          onClick={onBack}
          className="md:hidden p-2 -ml-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-xl"
        >
          <ArrowLeft className="w-5 h-5 text-gray-600 dark:text-gray-300" />
        </button>

        {isAI ? (
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-500 to-blue-500 flex items-center justify-center shadow-lg flex-shrink-0">
            <Bot className="w-5 h-5 text-white" />
          </div>
        ) : isGroup ? (
          avatarUrl ? (
            <img src={avatarUrl} alt={displayName} className="w-10 h-10 rounded-xl object-cover flex-shrink-0" />
          ) : (
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-green-400 to-teal-500 flex items-center justify-center flex-shrink-0">
              <Hash className="w-5 h-5 text-white" />
            </div>
          )
        ) : avatarUrl ? (
          <img 
            src={avatarUrl} 
            alt={displayName} 
            className="w-10 h-10 rounded-full object-cover flex-shrink-0"
            onError={(e) => {
              // Если аватар не загрузился, скрываем img и показываем плейсхолдер
              e.currentTarget.style.display = 'none';
              const parent = e.currentTarget.parentElement;
              if (parent && !parent.querySelector('.avatar-fallback')) {
                const fallback = document.createElement('div');
                fallback.className = 'avatar-fallback w-10 h-10 rounded-full bg-gradient-to-br from-blue-400 to-purple-500 flex items-center justify-center text-white font-medium flex-shrink-0';
                fallback.textContent = displayName[0]?.toUpperCase() || "?";
                parent.appendChild(fallback);
              }
            }}
          />
        ) : (
          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-400 to-purple-500 flex items-center justify-center text-white font-medium flex-shrink-0">
            {displayName[0]?.toUpperCase() || "?"}
          </div>
        )}

        <div className="min-w-0">
          <h2 className="font-semibold text-gray-900 dark:text-white truncate">{displayName}</h2>
          <p className={`text-sm truncate ${
            isAI
              ? 'text-green-600 dark:text-green-400' // ИИ помощник всегда онлайн - зеленый цвет
              : !isGroup && isOtherUserOnline 
                ? 'text-green-600 dark:text-green-400' 
                : 'text-gray-500 dark:text-gray-400'
          }`}>
            {statusSubtitle}
          </p>
        </div>
      </div>

      <div className="flex items-center gap-1">
        {/* Кнопка закрытия обращения */}
        {(isTicketChat || ticketId) && onCloseAppeal && (
          <button
            onClick={onCloseAppeal}
            className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-xl text-green-600 dark:text-green-400"
            title="Закрыть обращение"
          >
            <CheckCircle className="w-5 h-5" />
          </button>
        )}
        
        {/* Кнопка "Участники" - только для групп и каналов, и только если есть обработчик */}
        {isGroup && !isAI && onManageParticipants && (
          <button
            onClick={onManageParticipants}
            className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-xl"
            title="Участники"
          >
            <Users className="w-5 h-5 text-gray-600 dark:text-gray-300" />
          </button>
        )}

        <div className="relative">
          <button
            onClick={() => setShowMenu(!showMenu)}
            className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-xl"
          >
            <MoreVertical className="w-5 h-5 text-gray-600 dark:text-gray-300" />
          </button>

          {showMenu && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setShowMenu(false)} />
              <div className="absolute right-0 top-full mt-1 w-52 bg-white dark:bg-gray-800 rounded-xl shadow-xl border border-gray-200 dark:border-gray-700 py-1 z-50">
                {isGroup && isCurrentUserAdmin && onEditGroup && (
                  <>
                    <button 
                      onClick={() => { onEditGroup(); setShowMenu(false); }}
                      className="w-full flex items-center justify-start gap-3 px-4 py-2.5 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700"
                    >
                      <Settings className="w-4 h-4" />
                      Редактировать
                    </button>
                    <div className="my-1 border-t border-gray-200 dark:border-gray-700" />
                  </>
                )}
                <button 
                  onClick={() => {
                    setShowMenu(false);
                    if (isTicketChat || ticketId || ticketPublicId) {
                      // Для обращений открываем страницу обращения
                      const ticketIdToUse = ticketPublicId || ticketId || chat.ticketPublicId || chat.ticketId;
                      if (ticketIdToUse) {
                        router.push(`/dashboard/appeals?ticketId=${ticketIdToUse}`);
                      } else {
                        showToast('Не удалось найти обращение', 'error');
                      }
                    } else {
                      // Для обычных чатов можно показать информацию о чате
                      showToast('Информация о чате: ' + displayName, 'info');
                    }
                  }}
                  className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                >
                  <Info className="w-4 h-4" />
                  Подробности
                </button>
                <button 
                  onClick={() => {
                    setShowMenu(false);
                    showToast('Настройки уведомлений для чата', 'info');
                    // TODO: Реализовать модальное окно с настройками уведомлений
                  }}
                  className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                >
                  <Bell className="w-4 h-4" />
                  Уведомления
                </button>
                <div className="my-1 border-t border-gray-200 dark:border-gray-700" />
                {/* Архивировать - только для председателей и админов групп */}
                {isGroup && isChairman && (isCurrentUserAdmin || chat.type === 'CHANNEL') && (
                  <button 
                    onClick={async () => {
                      setShowMenu(false);
                      if (confirm('Вы уверены, что хотите архивировать этот чат?')) {
                        try {
                          const response = await fetch(`/api/chat/${chat.id}/archive`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ archive: true }),
                          });
                          if (response.ok) {
                            showToast('Чат архивирован', 'success');
                            setTimeout(() => window.location.reload(), 1000);
                          } else {
                            const error = await safeJsonParse(response);
                            showToast(error?.error || 'Ошибка архивации', 'error');
                          }
                        } catch (error) {
                          console.error('Error archiving chat:', error);
                          showToast('Ошибка архивации чата', 'error');
                        }
                      }
                    }}
                    className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                  >
                    <Archive className="w-4 h-4" />
                    Архивировать
                  </button>
                )}
                {/* Очистить историю - только для председателей и админов групп */}
                {isChairman && (isGroup ? isCurrentUserAdmin : true) && (
                  <button 
                    onClick={async () => {
                      setShowMenu(false);
                      if (confirm('Вы уверены, что хотите очистить историю сообщений? Это действие нельзя отменить.')) {
                        try {
                          const response = await fetch(`/api/chat/${chat.id}/clear`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ mode: 'all' }),
                          });
                          if (response.ok) {
                            showToast('История сообщений очищена', 'success');
                            setTimeout(() => window.location.reload(), 1000);
                          } else {
                            const error = await safeJsonParse(response);
                            showToast(error?.error || 'Ошибка очистки истории', 'error');
                          }
                        } catch (error) {
                          console.error('Error clearing history:', error);
                          showToast('Ошибка очистки истории', 'error');
                        }
                      }
                    }}
                    className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                    Очистить историю
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// ОСНОВНОЙ КОМПОНЕНТ
// ============================================================================

export default function SlackStyleChat({
  isChairman = false,
  baseUrl = "/dashboard/chat",
  containerHeight = "100vh",
}: SlackStyleChatProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { data: session } = useSession();
  const { showToast } = useToast();
  const currentUserId = session?.user?.id || null;

  // State
  const [mounted, setMounted] = useState(false);
  const [showChatView, setShowChatView] = useState(false);
  const [showGroupModal, setShowGroupModal] = useState(false);
  const [groupModalMode, setGroupModalMode] = useState<'create' | 'edit'>('create');
  const [showChannelPostModal, setShowChannelPostModal] = useState(false);
  const [showParticipantsPanel, setShowParticipantsPanel] = useState(false);
  const [activeThread, setActiveThread] = useState<Message | null>(null);
  const [activeChannelThread, setActiveChannelThread] = useState<{ postId: string; messageId: string } | null>(null);
  const [replyingTo, setReplyingTo] = useState<Message | null>(null);
  const [editingMessage, setEditingMessage] = useState<Message | null>(null);
  const [selectedImage, setSelectedImage] = useState<{ url: string; name?: string } | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<{ isOpen: boolean; messageId: string | null }>({ isOpen: false, messageId: null });
  const [showCloseAppealModal, setShowCloseAppealModal] = useState(false);
  const [ticketInfo, setTicketInfo] = useState<{ id: string; publicId: string; status: string; userId: string } | null>(null);
  const [showAddParticipantModal, setShowAddParticipantModal] = useState(false);

  const handleError = useCallback((error: string) => {
    showToast(error, "error");
  }, [showToast]);

  const handleCloseAppeal = useCallback(async (rating: number, comment: string) => {
    if (!ticketInfo) return;
    
    try {
      const response = await fetch(`/api/tickets/${ticketInfo.publicId}/close`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rating, comment }),
      });
      
      if (!response.ok) {
        const error = await safeJsonParse(response);
        throw new Error(error?.error || 'Ошибка закрытия обращения');
      }
      
      showToast('Обращение успешно закрыто', 'success');
      setShowCloseAppealModal(false);
      // Обновляем информацию об обращении
      const data = await safeJsonParse(response);
      if (data?.ticket) {
        setTicketInfo({
          id: data.ticket.id,
          publicId: data.ticket.publicId,
          status: data.ticket.status,
          userId: data.ticket.userId || data.ticket.user?.id || ticketInfo?.userId || '',
        });
      }
    } catch (error) {
      console.error('[SlackStyleChat] Error closing appeal:', error);
      const errorMessage = error instanceof Error ? error.message : 'Ошибка закрытия обращения';
      showToast(errorMessage, 'error');
      // Пробрасываем ошибку, чтобы модальное окно не закрывалось
      throw error;
    }
  }, [ticketInfo, showToast]);

  // Chat hook
  const {
    chats,
    selectedChat,
    messages,
    loading,
    sending,
    typingUsers,
    loadChats,
    selectChat,
    createOrOpenChat,
    sendMessage,
    editMessage,
    deleteMessage,
    toggleReaction,
  } = useChat({
    onError: handleError,
  });

  // Initialization
  useEffect(() => {
    setMounted(true);
    loadChats();
    loadAIChat();
  }, []);

  const loadAIChat = useCallback(async () => {
    try {
      await fetch("/api/chat/ai");
    } catch (error) {
      console.error("Failed to load AI chat:", error);
    }
  }, []);

  // Get ticketId from URL
  const ticketIdFromUrl = searchParams.get("ticketId");
  
  // Get ticket info when ticketId is available
  useEffect(() => {
    // Используем информацию об обращении из selectedChat, если она есть
    if (selectedChat?.ticket) {
      setTicketInfo({
        id: selectedChat.ticket.id,
        publicId: selectedChat.ticket.publicId,
        status: selectedChat.ticket.status,
        userId: selectedChat.ticket.userId || selectedChat.ticket.user?.id || '',
      });
      return;
    }

    // Если информации нет в чате, загружаем отдельно
    const fetchTicketInfo = async () => {
      const ticketIdToUse = ticketIdFromUrl || selectedChat?.ticketId;
      if (!ticketIdToUse) {
        setTicketInfo(null);
        return;
      }
      
      try {
        // Пытаемся получить по ID или publicId
        const response = await fetch(`/api/tickets/${ticketIdToUse}`);
        if (response.ok) {
          const data = await safeJsonParse(response);
          if (data?.ticket) {
            setTicketInfo({
              id: data.ticket.id,
              publicId: data.ticket.publicId,
              status: data.ticket.status,
              userId: data.ticket.userId || data.ticket.user?.id || '',
            });
          }
        } else {
          setTicketInfo(null);
        }
      } catch (error) {
        console.error('[SlackStyleChat] Error fetching ticket info:', error);
        setTicketInfo(null);
      }
    };
    
    if (mounted && (ticketIdFromUrl || selectedChat?.ticketId)) {
      fetchTicketInfo();
    } else {
      setTicketInfo(null);
    }
  }, [mounted, ticketIdFromUrl, selectedChat?.ticketId, selectedChat?.ticket]);

  // Handle URL params
  useEffect(() => {
    if (!mounted || loading) return;

    const userId = searchParams.get("userId");
    const chatId = searchParams.get("chatId");

    if (userId && userId !== currentUserId) {
      createOrOpenChat(userId).then((chat) => {
        if (chat) {
          setShowChatView(true);
          router.replace(baseUrl, { scroll: false });
        }
      });
    } else if (chatId) {
      const chat = chats.find((c) => c.id === chatId);
      if (chat) {
        selectChat(chat);
        setShowChatView(true);
        // Сохраняем ticketId и messageId в URL
        const ticketId = searchParams.get("ticketId");
        const messageId = searchParams.get("messageId");
        const urlParams = new URLSearchParams();
        urlParams.set("chatId", chatId);
        if (ticketId) urlParams.set("ticketId", ticketId);
        if (messageId) urlParams.set("messageId", messageId);
        router.replace(`${baseUrl}?${urlParams.toString()}`, { scroll: false });
        
        // Прокрутка к сообщению будет обработана в отдельном useEffect
      }
    }
  }, [mounted, loading, searchParams, chats.length, router, baseUrl]);

  useEffect(() => {
    if (selectedChat) {
      setShowChatView(true);
    }
  }, [selectedChat]);

  // Обработка прокрутки к сообщению при наличии messageId в URL
  useEffect(() => {
    const messageId = searchParams.get("messageId");
    if (messageId && selectedChat && messages.length > 0) {
      // Ждем рендеринга сообщений (увеличиваем задержку для надежности)
      const scrollTimeout = setTimeout(() => {
        const messageElement = document.querySelector(`[data-message-id="${messageId}"]`);
        if (messageElement) {
          messageElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
          // Подсвечиваем сообщение
          messageElement.classList.add('ring-2', 'ring-blue-500', 'ring-opacity-50', 'rounded-lg', 'transition-all', 'p-1', '-m-1');
          setTimeout(() => {
            messageElement.classList.remove('ring-2', 'ring-blue-500', 'ring-opacity-50', 'p-1', '-m-1');
          }, 3000);
          
          // Убираем messageId из URL после прокрутки
          const urlParams = new URLSearchParams(window.location.search);
          urlParams.delete('messageId');
          const newUrl = urlParams.toString() 
            ? `${window.location.pathname}?${urlParams.toString()}`
            : window.location.pathname;
          router.replace(newUrl, { scroll: false });
        } else {
          // Если сообщение не найдено сразу, пробуем еще раз через 1 секунду
          setTimeout(() => {
            const retryElement = document.querySelector(`[data-message-id="${messageId}"]`);
            if (retryElement) {
              retryElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
              retryElement.classList.add('ring-2', 'ring-blue-500', 'ring-opacity-50', 'rounded-lg', 'transition-all', 'p-1', '-m-1');
              setTimeout(() => {
                retryElement.classList.remove('ring-2', 'ring-blue-500', 'ring-opacity-50', 'p-1', '-m-1');
              }, 3000);
            }
          }, 1000);
        }
      }, 800);
      
      return () => clearTimeout(scrollTimeout);
    }
  }, [selectedChat?.id, messages.length, searchParams, router]);

  // Handlers
  const handleSelectChat = useCallback((chat: Chat) => {
    selectChat(chat);
    setReplyingTo(null);
    setEditingMessage(null);
    setActiveThread(null);
    setActiveChannelThread(null);
  }, [selectChat]);

  const handleOpenAIChat = useCallback(async () => {
    try {
      const response = await fetch("/api/chat/ai");
      if (response.ok) {
        const data = await safeJsonParse(response);
        if (data?.chat) {
          selectChat({ ...data.chat, isAIChat: true });
          setShowChatView(true);
        }
      }
    } catch (error) {
      console.error("Failed to open AI chat:", error);
      showToast("Ошибка открытия чата с ИИ", "error");
    }
  }, [selectChat, showToast]);

  const handleCreateChat = useCallback(async (userId: string) => {
    const chat = await createOrOpenChat(userId);
    if (chat) {
      setShowChatView(true);
    }
  }, [createOrOpenChat]);

  const handleCreateGroup = useCallback(async (data: { name: string; description?: string; participantIds: string[]; iconUrl?: string | null; type?: 'GROUP' | 'CHANNEL' }) => {
    console.log('[SlackStyleChat] Creating group:', data);
    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          participantIds: data.participantIds,
          name: data.name,
          description: data.description,
          iconUrl: data.iconUrl,
          type: data.type || 'GROUP',
        }),
      });

      console.log('[SlackStyleChat] Response status:', response.status);

      if (response.ok) {
        const result = await safeJsonParse(response);
        console.log('[SlackStyleChat] Group created successfully:', result);
        showToast("Группа создана", "success");
        await loadChats();
        if (result.chat) {
          selectChat(result.chat);
        }
      } else {
        const errorText = await response.text();
        let error;
        try {
          error = JSON.parse(errorText);
        } catch {
          error = { error: errorText || "Ошибка создания группы" };
        }
        console.error("Failed to create group:", error);
        showToast(error.error || "Ошибка создания группы", "error");
      }
    } catch (error: any) {
      console.error("Failed to create group:", error);
      showToast(error?.message || "Ошибка создания группы", "error");
    }
  }, [loadChats, selectChat, showToast]);

  const handleUpdateGroup = useCallback(async (data: { name: string; description?: string; participantIds: string[]; iconUrl?: string | null; adminId?: string }) => {
    if (!selectedChat || selectedChat.type !== 'GROUP') return;

    try {
      const response = await fetch(`/api/chat/${selectedChat.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });

      if (response.ok) {
        showToast("Группа обновлена", "success");
        loadChats();
        // Обновляем текущий чат
        const updated = await safeJsonParse(response);
        if (updated?.chat) {
          selectChat(updated.chat);
        }
      } else {
        const error = await safeJsonParse(response) || { error: "Ошибка обновления группы" };
        console.error("Failed to update group:", error);
        showToast(error.error || "Ошибка обновления группы", "error");
      }
    } catch (error) {
      console.error("Failed to update group:", error);
      showToast("Ошибка обновления группы", "error");
    }
  }, [selectedChat, loadChats, selectChat, showToast]);

  const handleSendMessage = useCallback(async (content: string, files?: File[], replyToId?: string, threadRootId?: string, mentionedUserIds?: string[]) => {
    if (editingMessage) {
      const success = await editMessage(editingMessage.id, content);
      if (success) {
        setEditingMessage(null);
      }
    } else {
      // Если есть файлы, отправляем через FormData
      if (files && files.length > 0) {
        if (!selectedChat) return;
        
        // Отправляем все файлы последовательно
        let hasError = false;
        for (const file of files) {
          const formData = new FormData();
          // Для каждого файла используем тот же текст, но только для первого файла
          formData.append("content", files.indexOf(file) === 0 ? content : "");
          formData.append("file", file);
          if (replyToId) formData.append("replyToId", replyToId);
          if (threadRootId) formData.append("threadRootId", threadRootId);
          if (mentionedUserIds && mentionedUserIds.length > 0) {
            formData.append("mentionedUserIds", JSON.stringify(mentionedUserIds));
          }

          try {
            const response = await fetch(`/api/chat/${selectedChat.id}/attachments`, {
              method: "POST",
              body: formData,
            });
            
            if (!response.ok) {
              const errorData = await safeJsonParse(response) || {};
              console.error("File upload error:", errorData);
              hasError = true;
            }
          } catch (error) {
            console.error("File upload error:", error);
            hasError = true;
          }
        }
        
        if (hasError) {
          showToast("Ошибка загрузки некоторых файлов", "error");
        }
        
        setReplyingTo(null);
        loadChats();
      } else {
        const currentThreadRootId = activeThread?.id || undefined;
        // Парсим упоминания из контента
        const mentionRegex = /@\[([^\]]+)\]\(([^)]+)\)/g;
        const mentionedUserIds: string[] = [];
        let match;
        while ((match = mentionRegex.exec(content)) !== null) {
          const userId = match[2];
          if (userId && !mentionedUserIds.includes(userId)) {
            mentionedUserIds.push(userId);
          }
        }
        const success = await sendMessage(content, undefined, replyToId || replyingTo?.id, currentThreadRootId, mentionedUserIds.length > 0 ? mentionedUserIds : undefined);
        if (success) {
          setReplyingTo(null);
        }
      }
    }
  }, [editingMessage, replyingTo, selectedChat, editMessage, sendMessage, loadChats, showToast, activeThread]);

  const handleDeleteConfirm = useCallback(async () => {
    if (deleteConfirm.messageId) {
      await deleteMessage(deleteConfirm.messageId);
    }
    setDeleteConfirm({ isOpen: false, messageId: null });
  }, [deleteConfirm.messageId, deleteMessage]);

  const handleBackToList = useCallback(() => {
    setShowChatView(false);
    setActiveThread(null);
  }, []);

  // Format messages
  const formattedMessages = useMemo(() => {
    return messages.map((m) => ({
      ...m,
      messageType: (m as any).messageType || "text",
      createdAt: new Date(m.createdAt),
      editedAt: m.editedAt ? new Date(m.editedAt) : undefined,
      threadLastReplyAt: (m as any).threadLastReplyAt ? new Date((m as any).threadLastReplyAt) : undefined,
    }));
  }, [messages]);

  if (!mounted) {
    return (
      <div className="flex h-full items-center justify-center bg-white dark:bg-gray-900">
        <div className="text-center">
          <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-blue-500 border-r-transparent" />
          <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">Загрузка...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col bg-gray-100 dark:bg-gray-950" style={{ height: containerHeight }}>
      <div className="flex flex-1 min-h-0 overflow-hidden">
        {/* Sidebar */}
        <div className={`${showChatView ? "hidden md:flex" : "flex"} w-full md:w-80 lg:w-96 flex-col min-w-0 border-r border-gray-200 dark:border-gray-800`}>
          <SlackStyleSidebar
            chats={chats}
            selectedChat={selectedChat}
            loading={loading}
            currentUserId={currentUserId}
            isChairman={isChairman}
            onSelectChat={handleSelectChat}
            onCreateChat={handleCreateChat}
            onCreateGroup={() => setShowGroupModal(true)}
            onCreateChannel={() => {
              setGroupModalMode('create');
              setShowGroupModal(true);
            }}
            onOpenAIChat={handleOpenAIChat}
          />
        </div>

        {/* Chat area */}
        <div className={`${showChatView ? "flex" : "hidden md:flex"} flex-1 flex-col min-w-0 bg-white dark:bg-gray-900`}>
          {selectedChat ? (
            <>
              <ChatHeader
                chat={selectedChat}
                currentUserId={currentUserId}
                onBack={handleBackToList}
                onManageParticipants={() => setShowParticipantsPanel(true)}
                onEditGroup={() => {
                  setGroupModalMode('edit');
                  setShowGroupModal(true);
                }}
                isCurrentUserAdmin={(selectedChat.type === 'GROUP' || selectedChat.type === 'CHANNEL') && selectedChat.participants?.some(
                  p => p.userId === currentUserId && p.role === 'admin'
                )}
                ticketId={ticketIdFromUrl || selectedChat?.ticketId || undefined}
                ticketPublicId={ticketInfo?.publicId || selectedChat?.ticket?.publicId || selectedChat?.ticketPublicId || undefined}
                onCloseAppeal={
                  // Показываем кнопку закрытия только для создателя обращения
                  ticketInfo && 
                  ticketInfo.userId === currentUserId && 
                  ticketInfo.status !== 'CLOSED' && 
                  ticketInfo.status !== 'RESOLVED'
                    ? () => setShowCloseAppealModal(true)
                    : undefined
                }
                isChairman={isChairman}
              />

              <div className="flex-1 flex overflow-hidden relative">
                      <div className={clsx(
                        "flex flex-col min-w-0 transition-all duration-300",
                        "flex-1",
                      )}>
                  <SlackStyleMessages
                    isGroupChat={selectedChat?.type === 'GROUP' || selectedChat?.type === 'CHANNEL'}
                    messages={formattedMessages}
                    currentUserId={currentUserId || ""}
                    typingUsers={new Set(typingUsers?.map((u) => typeof u === "string" ? u : (u as any).userId) || [])}
                    isTicketChat={!!selectedChat.ticketId || !!ticketIdFromUrl}
                    ticketId={ticketIdFromUrl || selectedChat?.ticketId || undefined}
                    chatId={selectedChat?.id}
                    onReply={(msg) => setReplyingTo(msg as any)}
                    onStartThread={(msg) => {
                      // Открываем тред для этого сообщения
                      setActiveThread(msg as any);
                    }}
                    onEdit={(msg) => setEditingMessage(msg as any)}
                    onDelete={(id) => setDeleteConfirm({ isOpen: true, messageId: id })}
                    onReaction={(id, emoji) => toggleReaction(id, emoji)}
                    onOpenThread={(msg) => {
                      // Для каналов открываем тред канала, для обычных чатов - обычный тред
                      if (selectedChat?.type === 'CHANNEL' && msg.post) {
                        setActiveChannelThread({ postId: msg.post.id, messageId: msg.id });
                      } else {
                        setActiveThread(msg as any);
                      }
                    }}
                    onImageClick={(url, name) => setSelectedImage({ url, name })}
                    onPollVote={async (pollId, optionId) => {
                      // Обновляем сообщения после голосования
                      await loadChats();
                    }}
                  />

                  {/* Для каналов: только админ может создавать посты, остальные только в тредах */}
                  {selectedChat.type === 'CHANNEL' && !selectedChat.participants?.some(
                    p => p.userId === currentUserId && p.role === 'admin'
                  ) && !activeThread ? (
                    <div className="px-4 py-3 bg-gray-100 dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700">
                      <p className="text-sm text-gray-600 dark:text-gray-400 text-center">
                        В каналах только председатель может создавать посты. Вы можете комментировать посты в тредах.
                      </p>
                    </div>
                  ) : selectedChat.type === 'CHANNEL' && selectedChat.participants?.some(
                    p => p.userId === currentUserId && p.role === 'admin'
                  ) && isChairman && !activeThread && !activeChannelThread ? (
                    // Для админов канала в режиме председателя показываем кнопку создания поста
                    // В режиме участника (MEMBER) кнопка скрыта
                    <div className="px-4 py-3 border-t border-gray-200 dark:border-gray-700">
                      <button
                        onClick={() => setShowChannelPostModal(true)}
                        className="w-full px-4 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
                      >
                        Создать пост в канале
                      </button>
                    </div>
                  ) : (
                    <ChatInput
                      onSend={handleSendMessage}
                      replyTo={replyingTo ? {
                        id: replyingTo.id,
                        content: replyingTo.content,
                        senderName: replyingTo.sender ? 
                          [replyingTo.sender.firstName, replyingTo.sender.lastName].filter(Boolean).join(" ") : 
                          undefined
                      } : null}
                      threadRootId={activeThread?.id || null}
                      editingMessage={editingMessage?.content || null}
                      onCancelReply={() => setReplyingTo(null)}
                      onCancelEdit={() => setEditingMessage(null)}
                      disabled={sending}
                      placeholder={
                        selectedChat.type === 'CHANNEL' && activeThread
                          ? "Напишите комментарий в треде..."
                          : "Напишите сообщение..."
                      }
                      participants={selectedChat.participants?.map(p => ({
                        id: p.userId,
                        firstName: p.user?.firstName || null,
                        lastName: p.user?.lastName || null,
                        middleName: p.user?.middleName || null,
                        avatarUrl: p.user?.avatarUrl || null,
                      })) || []}
                      currentUserId={currentUserId || ''}
                    />
                  )}
                </div>

              </div>
            </>
          ) : (
            <EmptyChatState isChairman={isChairman} />
          )}
        </div>
      </div>

      {/* Modals */}
      {showCloseAppealModal && ticketInfo && (
        <CloseAppealModal
          isOpen={showCloseAppealModal}
          onClose={() => setShowCloseAppealModal(false)}
          onConfirm={handleCloseAppeal}
          ticketId={ticketInfo.id}
          ticketPublicId={ticketInfo.publicId}
        />
      )}

      <GroupChatModal
        isOpen={showGroupModal}
        onClose={() => {
          setShowGroupModal(false);
          setGroupModalMode('create');
        }}
        onCreate={handleCreateGroup}
        onUpdate={handleUpdateGroup}
        mode={groupModalMode}
        groupId={groupModalMode === 'edit' && selectedChat?.type === 'GROUP' ? selectedChat.id : undefined}
        currentUserId={currentUserId}
        initialData={groupModalMode === 'edit' && selectedChat?.type === 'GROUP' ? {
          name: selectedChat.name || '',
          description: selectedChat.description || undefined,
          iconUrl: selectedChat.iconUrl || null,
          participants: selectedChat.participants?.map(p => ({
            id: p.userId,
            firstName: p.user?.firstName || null,
            lastName: p.user?.lastName || null,
            avatarUrl: p.user?.avatarUrl || null,
            isAdmin: p.role === 'admin',
          })) || [],
          adminId: selectedChat.participants?.find(p => p.role === 'admin')?.userId,
        } : undefined}
      />

      <ImageModal
        isOpen={!!selectedImage}
        imageUrl={selectedImage?.url || ""}
        imageName={selectedImage?.name}
        onClose={() => setSelectedImage(null)}
      />

      <ChannelPostModal
        isOpen={showChannelPostModal}
        onClose={() => setShowChannelPostModal(false)}
        onSubmit={async (data) => {
          if (!selectedChat) return;
          
          try {
            const response = await fetch(`/api/chat/${selectedChat.id}/posts`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(data),
            });

            if (response.ok) {
              showToast("Пост создан", "success");
              await loadChats();
            } else {
              const error = await safeJsonParse(response) || { error: "Ошибка создания поста" };
              showToast(error.error || "Ошибка создания поста", "error");
            }
          } catch (error) {
            console.error("Failed to create post:", error);
            showToast("Ошибка создания поста", "error");
          }
        }}
        chatId={selectedChat?.id || ""}
      />

      <AlertDialog
        isOpen={deleteConfirm.isOpen}
        title="Удалить сообщение?"
        message="Это действие нельзя отменить."
        type="confirm"
        onConfirm={handleDeleteConfirm}
        onCancel={() => setDeleteConfirm({ isOpen: false, messageId: null })}
      />

                      {/* Thread drawer - Overlay для всех устройств */}
                      {activeChannelThread && selectedChat && selectedChat.type === 'CHANNEL' ? (
                        <>
                          {/* Затемнение фона */}
                          <div 
                            className="fixed inset-0 bg-black/50 dark:bg-black/70 z-40 transition-opacity duration-300"
                            onClick={() => setActiveChannelThread(null)}
                          />
                          {/* Drawer */}
                          <div className="fixed right-0 top-0 h-full w-full sm:w-96 lg:w-[28rem] bg-white dark:bg-gray-900 shadow-2xl z-50 transform transition-transform duration-300 ease-out">
                            <ChannelThreadView
                              postId={activeChannelThread.postId}
                              messageId={activeChannelThread.messageId}
                              chatId={selectedChat.id}
                              currentUserId={currentUserId || ""}
                              onClose={() => setActiveChannelThread(null)}
                              onReplyToChannel={async (content) => {
                                await handleSendMessage(content);
                              }}
                            />
                          </div>
                        </>
                      ) : activeThread && selectedChat ? (
                        <>
                          {/* Затемнение фона */}
                          <div 
                            className="fixed inset-0 bg-black/50 dark:bg-black/70 z-40 transition-opacity duration-300"
                            onClick={() => setActiveThread(null)}
                          />
                          {/* Drawer */}
                          <div className="fixed right-0 top-0 h-full w-full sm:w-96 lg:w-[28rem] bg-white dark:bg-gray-900 shadow-2xl z-50 transform transition-transform duration-300 ease-out">
                            <ThreadView
                              threadRootId={activeThread.id}
                              chatId={selectedChat.id}
                              currentUserId={currentUserId || ""}
                              onClose={() => setActiveThread(null)}
                            />
                          </div>
                        </>
                      ) : null}

      {/* Participants Panel */}
      {selectedChat && (
        <ParticipantsPanel
          isOpen={showParticipantsPanel}
          onClose={() => setShowParticipantsPanel(false)}
          chatId={selectedChat.id}
          currentUserId={currentUserId || ""}
          isAdmin={(selectedChat.type === 'GROUP' || selectedChat.type === 'CHANNEL') && selectedChat.participants?.some(
            p => p.userId === currentUserId && p.role === 'admin'
          )}
          onAddParticipant={
            // Показываем кнопку добавления участника только для админов
            (selectedChat.type === 'GROUP' || selectedChat.type === 'CHANNEL') && selectedChat.participants?.some(
              p => p.userId === currentUserId && p.role === 'admin'
            )
              ? () => {
                  setShowParticipantsPanel(false);
                  setShowAddParticipantModal(true);
                }
              : undefined
          }
          onRemoveParticipant={(userId) => {
            // Обновляем список чатов после удаления участника
            loadChats();
          }}
          onChangeRole={(userId, role) => {
            // Обновляем список чатов после изменения роли
            loadChats();
          }}
        />
      )}

      {/* Add Participant Modal */}
      {selectedChat && (
        <AddParticipantModal
          isOpen={showAddParticipantModal}
          onClose={() => setShowAddParticipantModal(false)}
          chatId={selectedChat.id}
          currentParticipantIds={selectedChat.participants?.map(p => p.userId) || []}
          onAdd={async (userIds: string[]) => {
            try {
              const response = await fetch(`/api/chat/${selectedChat.id}/participants`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userIds }),
              });

              if (!response.ok) {
                const data = await response.json();
                throw new Error(data.error || 'Не удалось добавить участников');
              }

              // Обновляем список чатов
              await loadChats();
              
              // Обновляем выбранный чат, чтобы обновить список участников
              // Перезагружаем чат через API для получения обновленного списка участников
              try {
                const chatResponse = await fetch(`/api/chat/${selectedChat.id}`);
                if (chatResponse.ok) {
                  const chatData = await safeJsonParse(chatResponse);
                  if (chatData?.chat) {
                    selectChat(chatData.chat);
                  }
                }
              } catch (err) {
                console.error('Failed to reload chat:', err);
              }
              
              showToast(`Добавлено участников: ${userIds.length}`, 'success');
              
              // Открываем панель участников снова, чтобы показать обновленный список
              setShowParticipantsPanel(true);
            } catch (error) {
              console.error('Failed to add participants:', error);
              showToast(error instanceof Error ? error.message : 'Ошибка при добавлении участников', 'error');
              throw error;
            }
          }}
        />
      )}
    </div>
  );
}
