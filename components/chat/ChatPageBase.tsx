"use client";

import { useEffect, useState, useCallback, ReactNode } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import dynamic from "next/dynamic";
import { useToast } from "@/components/ui/Toast";
import { useChat } from "@/hooks/useChat";
import { Chat, Message } from "@/types/chat";
import { getUserName, getFileUrl } from "@/lib/chat-utils";

// Lazy load компоненты
const ChatMessages = dynamic(() => import("@/components/chat/ChatMessages"), {
  ssr: false,
  loading: () => <MessagesSkeleton />,
});

const ChatInput = dynamic(() => import("@/components/chat/ChatInput"), {
  ssr: false,
});

const ImageModal = dynamic(() => import("@/components/chat/ImageModal"), {
  ssr: false,
});

const AlertDialog = dynamic(() => import("@/components/ui/AlertDialog"), {
  ssr: false,
});

// ============================================================================
// ТИПЫ
// ============================================================================

export interface ChatPageBaseProps {
  /**
   * Фильтр чатов - возвращает true для чатов, которые нужно показать
   */
  chatFilter?: (chat: Chat) => boolean;
  
  /**
   * Заголовок для навигации
   */
  headerContent?: ReactNode;
  
  /**
   * Кастомный компонент для сайдбара
   */
  SidebarComponent?: React.ComponentType<{
    chats: Chat[];
    selectedChat: Chat | null;
    loading: boolean;
    currentUserId: string | null;
    onSelectChat: (chat: Chat) => void;
    onCreateChat?: (userId: string) => void;
  }>;
  
  /**
   * Кастомный компонент для заголовка чата
   */
  ChatHeaderComponent?: React.ComponentType<{
    chat: Chat;
    onBack: () => void;
    onProfileClick?: (userId: string) => void;
  }>;
  
  /**
   * Показывать ли кнопку профиля при клике на аватар
   */
  enableProfileClick?: boolean;
  
  /**
   * Базовый URL для переадресации после закрытия чата
   */
  baseUrl?: string;
  
  /**
   * Высота контейнера
   */
  containerHeight?: string;
}

// ============================================================================
// ГЛАВНЫЙ КОМПОНЕНТ
// ============================================================================

export function ChatPageBase({
  chatFilter,
  headerContent,
  SidebarComponent,
  ChatHeaderComponent,
  enableProfileClick = false,
  baseUrl = "/dashboard/chat",
  containerHeight = "calc(100vh-8rem)",
}: ChatPageBaseProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { data: session } = useSession();
  const { showToast } = useToast();
  const currentUserId = session?.user?.id || null;

  // Мемоизируем функцию обработки ошибок
  const handleError = useCallback((error: string) => {
    showToast(error, "error");
  }, [showToast]);

  // Состояние
  const [mounted, setMounted] = useState(false);
  const [showChatView, setShowChatView] = useState(false);
  const [replyingTo, setReplyingTo] = useState<Message | null>(null);
  const [editingMessage, setEditingMessage] = useState<Message | null>(null);
  const [selectedImage, setSelectedImage] = useState<{ url: string; name?: string } | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<{ isOpen: boolean; messageId: string | null }>({
    isOpen: false,
    messageId: null,
  });

  // Хук для работы с чатами
  const {
    chats,
    selectedChat,
    messages,
    loading,
    loadingMessages,
    loadingOlder,
    sending,
    hasMore,
    isBotTyping,
    loadChats,
    loadOlderMessages,
    selectChat,
    createOrOpenChat,
    sendMessage,
    editMessage,
    deleteMessage,
    toggleReaction,
    saveScrollPosition,
    getScrollPosition,
  } = useChat({
    onError: handleError,
  });

  // Фильтруем чаты
  const filteredChats = chatFilter ? chats.filter(chatFilter) : chats;

  // Инициализация
  useEffect(() => {
    setMounted(true);
    loadChats();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Обработка URL параметров
  useEffect(() => {
    if (!mounted || loading) return;

    const userId = searchParams.get("userId");
    const chatId = searchParams.get("chatId");
    const botChatId = searchParams.get("botChatId");

    if (userId && userId !== currentUserId) {
      createOrOpenChat(userId).then((chat) => {
        if (chat) {
          setShowChatView(true);
          router.replace(baseUrl, { scroll: false });
        }
      });
    } else if (chatId || botChatId) {
      const targetChatId = chatId || botChatId;
      
      // Сначала ищем в отфильтрованных чатах
      let chat = filteredChats.find((c) => c.id === targetChatId);
      
      // Если не найден, ищем во всех чатах
      if (!chat) {
        chat = chats.find((c) => c.id === targetChatId);
      }

      if (chat) {
        selectChat(chat);
        setShowChatView(true);
        router.replace(baseUrl, { scroll: false });
      } else {
        // Загружаем чат напрямую
        fetch(`/api/chat/${targetChatId}`)
          .then((res) => (res.ok ? res.json() : null))
          .then((data) => {
            if (data?.chat) {
              const chatToSelect: Chat = {
                id: data.chat.id,
                type: data.chat.type || "PRIVATE",
                name: data.chat.name,
                description: data.chat.description,
                iconUrl: data.chat.iconUrl,
                isPublic: data.chat.isPublic,
                otherUser: data.chat.otherUser || {
                  id: data.chat.id,
                  firstName: data.chat.name || null,
                  lastName: null,
                  middleName: null,
                  avatarUrl: data.chat.iconUrl || null,
                },
                lastMessage: data.chat.lastMessage,
                lastMessageAt: data.chat.lastMessageAt,
                unreadCount: 0,
                createdAt: data.chat.createdAt,
                ticketId: data.chat.ticketId || null,
                ticketPublicId: data.chat.ticketPublicId || null,
                ticketTitle: data.chat.ticketTitle || null,
                participants: data.chat.participants || [],
                participantsCount: data.chat.participantsCount || 0,
                _count: data.chat._count || { participants: 0, messages: 0 },
              };

              selectChat(chatToSelect);
              setShowChatView(true);
              loadChats();
              router.replace(baseUrl, { scroll: false });
            }
          })
          .catch(console.error);
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mounted, loading, searchParams, chats.length]);

  // Показываем мобильный вид при выборе чата
  useEffect(() => {
    if (selectedChat) {
      setShowChatView(true);
    }
  }, [selectedChat]);

  // ============================================================================
  // ОБРАБОТЧИКИ
  // ============================================================================

  const handleSelectChat = useCallback((chat: Chat) => {
    selectChat(chat);
    setReplyingTo(null);
    setEditingMessage(null);
  }, [selectChat]);

  const handleCreateChat = useCallback(async (userId: string) => {
    const chat = await createOrOpenChat(userId);
    if (chat) {
      setShowChatView(true);
    }
  }, [createOrOpenChat]);

  const handleSendMessage = useCallback(async (content: string, file?: File) => {
    if (editingMessage) {
      const success = await editMessage(editingMessage.id, content);
      if (success) {
        setEditingMessage(null);
      }
    } else {
      const success = await sendMessage(content, file, replyingTo?.id);
      if (success) {
        setReplyingTo(null);
      }
    }
  }, [editingMessage, replyingTo, editMessage, sendMessage]);

  const handleReply = useCallback((message: Message) => {
    setReplyingTo(message);
    setEditingMessage(null);
  }, []);

  const handleEdit = useCallback((message: Message) => {
    setEditingMessage(message);
    setReplyingTo(null);
  }, []);

  const handleDeleteRequest = useCallback((messageId: string) => {
    setDeleteConfirm({ isOpen: true, messageId });
  }, []);

  const handleDeleteConfirm = useCallback(async () => {
    if (deleteConfirm.messageId) {
      await deleteMessage(deleteConfirm.messageId);
    }
    setDeleteConfirm({ isOpen: false, messageId: null });
  }, [deleteConfirm.messageId, deleteMessage]);

  const handleForward = useCallback((message: Message) => {
    showToast("Пересылка сообщений скоро будет доступна", "info");
  }, [showToast]);

  const handleBackToList = useCallback(() => {
    setShowChatView(false);
  }, []);

  const handleProfileClick = useCallback((userId: string) => {
    if (enableProfileClick && userId && userId !== currentUserId) {
      router.push(`/dashboard/profile/${userId}`);
    }
  }, [router, currentUserId, enableProfileClick]);

  // Защита от hydration mismatch
  if (!mounted) {
    return <PageSkeleton />;
  }

  // ============================================================================
  // RENDER
  // ============================================================================

  const Sidebar = SidebarComponent || DefaultChatSidebar;
  const Header = ChatHeaderComponent || DefaultChatHeader;

  return (
    <div className="flex flex-col" style={{ height: containerHeight }}>
      {/* Кастомный заголовок */}
      {headerContent && (
        <div className="shrink-0 mb-4">{headerContent}</div>
      )}

      {/* Основной контейнер чата */}
      <div className="flex flex-1 min-h-0 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden w-full max-w-full min-w-0">
        {/* Сайдбар */}
        <div className={`${showChatView ? "hidden md:flex" : "flex"} w-full md:w-1/3 border-r border-gray-200 dark:border-gray-700 flex-col min-w-0`}>
          <Sidebar
            chats={filteredChats}
            selectedChat={selectedChat}
            loading={loading}
            currentUserId={currentUserId}
            onSelectChat={handleSelectChat}
            onCreateChat={handleCreateChat}
          />
        </div>

        {/* Область чата */}
        <div className={`${showChatView ? "flex" : "hidden md:flex"} flex-1 flex-col w-full h-full min-w-0 max-w-full overflow-hidden`}>
          {selectedChat ? (
            <>
              <Header
                chat={selectedChat}
                onBack={handleBackToList}
                onProfileClick={enableProfileClick ? handleProfileClick : undefined}
              />

              <div className="flex-1 flex flex-col overflow-hidden min-h-0 w-full max-w-full">
                <ChatMessages
                  chat={selectedChat}
                  messages={messages}
                  currentUserId={currentUserId}
                  loading={loadingMessages}
                  loadingOlder={loadingOlder}
                  hasMore={hasMore}
                  isBotTyping={isBotTyping}
                  onLoadMore={loadOlderMessages}
                  onReply={handleReply}
                  onEdit={handleEdit}
                  onDelete={handleDeleteRequest}
                  onForward={handleForward}
                  onReaction={toggleReaction}
                  onImageClick={(url, name) => setSelectedImage({ url, name })}
                  onProfileClick={enableProfileClick ? handleProfileClick : undefined}
                  onSaveScrollPosition={saveScrollPosition}
                  getSavedScrollPosition={getScrollPosition}
                />
              </div>

              <ChatInput
                replyingTo={replyingTo}
                editingMessage={editingMessage}
                disabled={sending}
                onSend={handleSendMessage}
                onCancelReply={() => setReplyingTo(null)}
                onCancelEdit={() => setEditingMessage(null)}
              />
            </>
          ) : (
            <EmptyChatState />
          )}
        </div>
      </div>

      {/* Модалы */}
      <ImageModal
        isOpen={!!selectedImage}
        imageUrl={selectedImage?.url || ""}
        imageName={selectedImage?.name}
        onClose={() => setSelectedImage(null)}
      />

      <AlertDialog
        isOpen={deleteConfirm.isOpen}
        title="Удалить сообщение?"
        message="Это действие нельзя отменить."
        type="confirm"
        onConfirm={handleDeleteConfirm}
        onCancel={() => setDeleteConfirm({ isOpen: false, messageId: null })}
      />
    </div>
  );
}

// ============================================================================
// ДЕФОЛТНЫЕ КОМПОНЕНТЫ
// ============================================================================

function DefaultChatSidebar({
  chats,
  selectedChat,
  loading,
  currentUserId,
  onSelectChat,
}: {
  chats: Chat[];
  selectedChat: Chat | null;
  loading: boolean;
  currentUserId: string | null;
  onSelectChat: (chat: Chat) => void;
  onCreateChat?: (userId: string) => void;
}) {
  if (loading) {
    return (
      <div className="p-4">
        <div className="space-y-3">
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
      </div>
    );
  }

  if (chats.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-6 text-center">
        <div className="w-16 h-16 mb-4 rounded-full bg-gray-100 dark:bg-gray-700 flex items-center justify-center">
          <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
          </svg>
        </div>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Нет чатов
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div className="p-4 border-b border-gray-200 dark:border-gray-700">
        <h2 className="font-semibold text-gray-900 dark:text-white flex items-center gap-2">
          Чаты
          <span className="text-xs bg-gray-100 dark:bg-gray-700 px-2 py-0.5 rounded-full text-gray-600 dark:text-gray-400">
            {chats.length}
          </span>
        </h2>
      </div>
      <div className="flex-1 overflow-y-auto">
        {chats.map((chat) => (
          <ChatItem
            key={chat.id}
            chat={chat}
            isSelected={selectedChat?.id === chat.id}
            onClick={() => onSelectChat(chat)}
          />
        ))}
      </div>
    </div>
  );
}

function ChatItem({
  chat,
  isSelected,
  onClick,
}: {
  chat: Chat;
  isSelected: boolean;
  onClick: () => void;
}) {
  const getChatName = () => {
    if (chat.type === "GROUP") return chat.name || "Группа";
    if (chat.ticketId && chat.ticketPublicId) return `Обращение #${chat.ticketPublicId}`;
    return getUserName(chat.otherUser);
  };

  const getAvatar = () => {
    if (chat.type === "GROUP" && chat.iconUrl) {
      return <img src={getFileUrl(chat.iconUrl)} alt="" className="w-12 h-12 rounded-full object-cover" />;
    }
    if (chat.type === "GROUP") {
      return (
        <div className="w-12 h-12 rounded-full bg-gradient-to-br from-green-500 to-teal-600 flex items-center justify-center text-white">
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
        </div>
      );
    }
    if (chat.ticketId) {
      return (
        <div className="w-12 h-12 rounded-full bg-gradient-to-br from-yellow-500 to-orange-500 flex items-center justify-center text-white">
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
          </svg>
        </div>
      );
    }
    if (chat.otherUser?.avatarUrl) {
      return <img src={getFileUrl(chat.otherUser.avatarUrl)} alt="" className="w-12 h-12 rounded-full object-cover" />;
    }
    return (
      <div className="w-12 h-12 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white font-semibold">
        {chat.otherUser?.firstName?.[0] || "?"}{chat.otherUser?.lastName?.[0] || ""}
      </div>
    );
  };

  return (
    <div
      className={`flex items-center gap-3 p-3 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors ${
        isSelected ? "bg-blue-50 dark:bg-blue-900/30" : ""
      }`}
      onClick={onClick}
    >
      {getAvatar()}
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between">
          <span className="font-medium text-gray-900 dark:text-white truncate">{getChatName()}</span>
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

function DefaultChatHeader({
  chat,
  onBack,
  onProfileClick,
}: {
  chat: Chat;
  onBack: () => void;
  onProfileClick?: (userId: string) => void;
}) {
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
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
      </button>

      <button 
        className={`flex-shrink-0 ${isClickable ? "cursor-pointer hover:opacity-80 transition-opacity" : "cursor-default"}`}
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
            {chat.otherUser?.firstName?.[0] || "?"}{chat.otherUser?.lastName?.[0] || ""}
          </div>
        )}
      </button>

      <button 
        className={`flex-1 min-w-0 text-left ${isClickable ? "cursor-pointer hover:opacity-80 transition-opacity" : "cursor-default"}`}
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

function EmptyChatState() {
  return (
    <div className="flex-1 flex items-center justify-center bg-gray-50 dark:bg-gray-900/50">
      <div className="text-center p-6">
        <div className="w-24 h-24 mx-auto mb-4 rounded-full bg-gray-200 dark:bg-gray-700 flex items-center justify-center">
          <svg className="w-12 h-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
          </svg>
        </div>
        <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-1">
          Выберите чат
        </h3>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Выберите существующий чат или начните новый
        </p>
      </div>
    </div>
  );
}

// ============================================================================
// СКЕЛЕТОНЫ
// ============================================================================

function PageSkeleton() {
  return (
    <div className="flex h-[calc(100vh-8rem)] bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden items-center justify-center">
      <div className="text-center">
        <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-blue-500 border-r-transparent" />
        <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">Загрузка...</p>
      </div>
    </div>
  );
}

function MessagesSkeleton() {
  return (
    <div className="flex-1 flex items-center justify-center">
      <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-blue-500 border-r-transparent" />
    </div>
  );
}

export { PageSkeleton, MessagesSkeleton };

