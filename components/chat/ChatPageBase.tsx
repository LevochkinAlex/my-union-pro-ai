"use client";

import { useEffect, useState, useCallback, ReactNode } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import dynamic from "next/dynamic";
import { useToast } from "@/components/ui/Toast";
import { useChat } from "@/hooks/useChat";
import { safeJsonParse } from "@/lib/api-client";
import { Chat, Message } from "@/types/chat";

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

// Импортируем компоненты (не lazy для быстрой загрузки)
import DefaultChatSidebar from "./DefaultChatSidebar";
import DefaultChatHeader from "./DefaultChatHeader";
import EmptyChatState from "./EmptyChatState";
import ForwardModal from "./ForwardModal";

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
  const handleError = useCallback(
    (error: string) => {
      showToast(error, "error");
    },
    [showToast]
  );

  // Состояние
  const [mounted, setMounted] = useState(false);
  const [showChatView, setShowChatView] = useState(false);
  const [replyingTo, setReplyingTo] = useState<Message | null>(null);
  const [editingMessage, setEditingMessage] = useState<Message | null>(null);
  const [selectedImage, setSelectedImage] = useState<{
    url: string;
    name?: string;
  } | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<{
    isOpen: boolean;
    messageId: string | null;
  }>({
    isOpen: false,
    messageId: null,
  });
  const [forwardingMessage, setForwardingMessage] = useState<Message | null>(null);

  // Хук для работы с чатами
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
    forwardMessage,
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
          .then(async (res) => (res.ok ? await safeJsonParse(res) : null))
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

  const handleSelectChat = useCallback(
    (chat: Chat) => {
      selectChat(chat);
      setReplyingTo(null);
      setEditingMessage(null);
    },
    [selectChat]
  );

  const handleCreateChat = useCallback(
    async (userId: string) => {
      const chat = await createOrOpenChat(userId);
      if (chat) {
        setShowChatView(true);
      }
    },
    [createOrOpenChat]
  );

  const handleSendMessage = useCallback(
    async (content: string, file?: File) => {
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
    },
    [editingMessage, replyingTo, editMessage, sendMessage]
  );

  const handleDeleteRequest = useCallback((messageId: string) => {
    setDeleteConfirm({ isOpen: true, messageId });
  }, []);

  const handleDeleteConfirm = useCallback(async () => {
    if (deleteConfirm.messageId) {
      await deleteMessage(deleteConfirm.messageId);
    }
    setDeleteConfirm({ isOpen: false, messageId: null });
  }, [deleteConfirm.messageId, deleteMessage]);

  const handleForwardToChat = useCallback(
    async (targetChat: Chat) => {
      if (!forwardingMessage) {
        console.error("[ChatPageBase] No message to forward");
        return;
      }

      console.log("[ChatPageBase] Forwarding message:", {
        messageId: forwardingMessage.id,
        targetChat: {
          id: targetChat.id,
          type: targetChat.type,
          otherUserId: targetChat.otherUser?.id,
        },
      });

      // Пересылка работает только в PRIVATE чаты
      if (targetChat.type !== "PRIVATE" || !targetChat.otherUser?.id) {
        console.warn("[ChatPageBase] Cannot forward to non-private chat:", targetChat.type);
        showToast("Можно переслать только в личный чат", "error");
        return;
      }

      const success = await forwardMessage(forwardingMessage.id, targetChat.otherUser.id);

      if (success) {
        console.log("[ChatPageBase] ✅ Message forwarded successfully");
        showToast("Сообщение переслано", "success");
        setForwardingMessage(null);
      } else {
        console.error("[ChatPageBase] ❌ Failed to forward message");
        showToast("Ошибка пересылки", "error");
      }
    },
    [forwardingMessage, forwardMessage, showToast]
  );

  const handleBackToList = useCallback(() => {
    setShowChatView(false);
  }, []);

  const handleProfileClick = useCallback(
    (userId: string) => {
      if (enableProfileClick && userId && userId !== currentUserId) {
        router.push(`/dashboard/profile/${userId}`);
      }
    },
    [router, currentUserId, enableProfileClick]
  );

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
      {headerContent && <div className="shrink-0 mb-4">{headerContent}</div>}

      {/* Основной контейнер чата */}
      <div className="flex flex-1 min-h-0 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden w-full max-w-full min-w-0">
        {/* Сайдбар */}
        <div
          className={`${
            showChatView ? "hidden md:flex" : "flex"
          } w-full md:w-1/3 border-r border-gray-200 dark:border-gray-700 flex-col min-w-0`}
        >
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
        <div
          className={`${
            showChatView ? "flex" : "hidden md:flex"
          } flex-1 flex-col w-full h-full min-w-0 max-w-full overflow-hidden`}
        >
          {selectedChat ? (
            <>
              <Header
                chat={selectedChat}
                onBack={handleBackToList}
                onProfileClick={enableProfileClick ? handleProfileClick : undefined}
              />

              <div className="flex-1 flex flex-col overflow-hidden min-h-0 w-full max-w-full">
                <ChatMessages
                  messages={messages.map((m) => ({
                    ...m,
                    messageType: (m as any).messageType || "text",
                    createdAt: new Date(m.createdAt),
                  }))}
                  currentUserId={currentUserId || ""}
                  typingUsers={
                    new Set(
                      typingUsers?.map((u) =>
                        typeof u === "string" ? u : (u as any).userId
                      ) || []
                    )
                  }
                />
              </div>

              <ChatInput
                onSend={(content) => handleSendMessage(content)}
                replyTo={
                  replyingTo ? { id: replyingTo.id, content: replyingTo.content } : null
                }
                onCancelReply={() => setReplyingTo(null)}
                disabled={sending}
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

      {/* Модал пересылки */}
      {forwardingMessage && (
        <ForwardModal
          message={forwardingMessage}
          chats={chats.filter((c) => c.id !== selectedChat?.id && c.type === "PRIVATE")}
          onSelect={handleForwardToChat}
          onClose={() => setForwardingMessage(null)}
        />
      )}
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
