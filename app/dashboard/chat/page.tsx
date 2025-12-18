"use client";

import { useEffect, useState, useCallback, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import dynamic from "next/dynamic";
import { useToast } from "@/components/ui/Toast";
import { useChat } from "@/hooks/useChat";
import { Chat, Message } from "@/types/chat";
import { getUserName, getFileUrl } from "@/lib/chat-utils";

// Lazy load компоненты для уменьшения initial bundle
const ChatSidebar = dynamic(() => import("@/components/chat/ChatSidebar"), {
  ssr: false,
  loading: () => <SidebarSkeleton />,
});

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

function ChatPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { data: session } = useSession();
  const { showToast } = useToast();
  const currentUserId = session?.user?.id || null;
  
  // Проверяем, является ли пользователь Председателем ППО
  const isPPOHead = session?.user?.role === "PPO_HEAD" || (session?.user as any)?.isPPOHead;
  
  // Мемоизируем функцию onError чтобы избежать бесконечного цикла
  const handleError = useCallback((error: string) => {
    showToast(error, "error");
  }, [showToast]);
  
  const [mounted, setMounted] = useState(false);
  const [showChatView, setShowChatView] = useState(false);
  const [replyingTo, setReplyingTo] = useState<Message | null>(null);
  const [editingMessage, setEditingMessage] = useState<Message | null>(null);
  const [selectedImage, setSelectedImage] = useState<{ url: string; name?: string } | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<{ isOpen: boolean; messageId: string | null }>({
    isOpen: false,
    messageId: null,
  });

  // Используем кастомный хук для логики чата
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

  // Инициализация - loadChats только один раз при монтировании
  useEffect(() => {
    setMounted(true);
    loadChats();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Обработка URL параметров
  useEffect(() => {
    if (!mounted || loading) return;

    const userId = searchParams.get("userId");
    const botChatId = searchParams.get("botChatId");

    if (userId && userId !== currentUserId) {
      createOrOpenChat(userId).then((chat) => {
        if (chat) {
          setShowChatView(true);
          // Очищаем URL
          router.replace("/dashboard/chat", { scroll: false });
        }
      });
    } else if (botChatId) {
      const chat = chats.find(c => c.id === botChatId);
      if (chat) {
        selectChat(chat);
        setShowChatView(true);
        router.replace("/dashboard/chat", { scroll: false });
      }
    }
  }, [mounted, loading, searchParams, currentUserId, chats, createOrOpenChat, selectChat, router]);

  // Показываем мобильный вид чата при выборе
  useEffect(() => {
    if (selectedChat) {
      setShowChatView(true);
    }
  }, [selectedChat]);

  // Обработчики
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
      // Редактирование
      const success = await editMessage(editingMessage.id, content);
      if (success) {
        setEditingMessage(null);
      }
    } else {
      // Новое сообщение
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
    // TODO: Открыть модал для выбора получателя
    showToast("Пересылка сообщений скоро будет доступна", "info");
  }, [showToast]);

  const handleBackToList = useCallback(() => {
    setShowChatView(false);
  }, []);

  // Переход на профиль пользователя
  const handleProfileClick = useCallback((userId: string) => {
    if (userId && userId !== currentUserId) {
      router.push(`/dashboard/social/profile/${userId}`);
    }
  }, [router, currentUserId]);

  // Защита от hydration mismatch
  if (!mounted) {
    return <PageSkeleton />;
  }

  return (
    <div className={`flex flex-col ${isPPOHead ? "h-[calc(100vh-10rem)]" : "h-[calc(100vh-8rem)]"}`}>
      {/* Навигация для Председателя ППО */}
      {isPPOHead && (
        <div className="shrink-0 mb-4 border-b border-gray-200 dark:border-gray-700">
          <nav className="-mb-px flex space-x-8">
            <button
              onClick={() => router.push("/dashboard/chats/ppo-head")}
              className="whitespace-nowrap border-b-2 border-transparent py-3 px-1 text-sm font-medium text-gray-500 hover:border-gray-300 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300 transition-colors"
            >
              ← Чаты организации
            </button>
            <span className="whitespace-nowrap border-b-2 border-blue-500 py-3 px-1 text-sm font-medium text-blue-600 dark:text-blue-400">
              Личные чаты
            </span>
          </nav>
        </div>
      )}
      
      <div className="flex flex-1 min-h-0 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
      {/* Сайдбар со списком чатов */}
      <div className={`${showChatView ? "hidden md:flex" : "flex"} w-full md:w-1/3 border-r border-gray-200 dark:border-gray-700 flex-col`}>
        <ChatSidebar
          chats={chats}
          selectedChat={selectedChat}
          loading={loading}
          currentUserId={currentUserId}
          onSelectChat={handleSelectChat}
          onCreateChat={handleCreateChat}
        />
      </div>

      {/* Область чата */}
      <div className={`${showChatView ? "flex" : "hidden md:flex"} flex-1 flex-col`}>
        {selectedChat ? (
          <>
            {/* Заголовок чата */}
            <ChatHeader
              chat={selectedChat}
              onBack={handleBackToList}
              onProfileClick={handleProfileClick}
            />

            {/* Сообщения */}
            <div className="flex-1 flex flex-col overflow-hidden min-h-0">
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
                onProfileClick={handleProfileClick}
                onSaveScrollPosition={saveScrollPosition}
                getSavedScrollPosition={getScrollPosition}
              />
            </div>

            {/* Поле ввода */}
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
    </div>
  );
}

// Заголовок чата
function ChatHeader({ chat, onBack, onProfileClick }: { chat: Chat; onBack: () => void; onProfileClick?: (userId: string) => void }) {
  const isClickable = chat.type === "PRIVATE" && chat.otherUser?.id;
  
  const handleClick = () => {
    if (isClickable && onProfileClick && chat.otherUser?.id) {
      onProfileClick(chat.otherUser.id);
    }
  };

  return (
    <div className="flex items-center gap-3 p-3 md:p-4 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
      {/* Кнопка назад (мобильная) */}
      <button
        onClick={onBack}
        className="md:hidden p-2 -ml-2 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"
      >
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
      </button>

      {/* Аватар (кликабельный для личных чатов) */}
      <button
        onClick={handleClick}
        disabled={!isClickable}
        className={`flex-shrink-0 ${isClickable ? "cursor-pointer hover:opacity-80 transition-opacity" : "cursor-default"}`}
        title={isClickable ? `Открыть профиль ${getUserName(chat.otherUser)}` : undefined}
      >
        {chat.otherUser.avatarUrl ? (
          <img
            src={getFileUrl(chat.otherUser.avatarUrl)}
            alt={getUserName(chat.otherUser)}
            className="w-10 h-10 rounded-full object-cover"
          />
        ) : (
          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white font-semibold">
            {chat.otherUser.firstName?.[0] || "?"}{chat.otherUser.lastName?.[0] || ""}
          </div>
        )}
      </button>

      {/* Имя (кликабельное для личных чатов) */}
      <div className="flex-1 min-w-0">
        <button
          onClick={handleClick}
          disabled={!isClickable}
          className={`block text-left w-full ${isClickable ? "hover:underline cursor-pointer" : "cursor-default"}`}
        >
          <h3 className="font-semibold text-gray-900 dark:text-white truncate">
            {getUserName(chat.otherUser)}
          </h3>
        </button>
        {chat.otherUser.phone && (
          <p className="text-sm text-gray-500 dark:text-gray-400 truncate">
            {chat.otherUser.phone}
          </p>
        )}
      </div>
    </div>
  );
}

// Пустое состояние
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

// Скелетоны загрузки
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

function SidebarSkeleton() {
  return (
    <div className="h-full bg-white dark:bg-gray-800 p-4">
      <div className="h-8 bg-gray-200 dark:bg-gray-700 rounded w-24 mb-4" />
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

function MessagesSkeleton() {
  return (
    <div className="flex-1 flex items-center justify-center">
      <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-blue-500 border-r-transparent" />
    </div>
  );
}

// Обёртка с Suspense
export default function ChatPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <ChatPageContent />
    </Suspense>
  );
}
