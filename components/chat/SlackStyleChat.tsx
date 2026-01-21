"use client";

import { useEffect, useState, useCallback, useMemo, useRef } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import dynamic from "next/dynamic";
import { useToast } from "@/components/ui/Toast";
import { useChat } from "@/hooks/useChat";
import { Chat, Message } from "@/types/chat";
import SlackStyleSidebar from "./SlackStyleSidebar";
import SlackStyleMessages from "./SlackStyleMessages";
import ChatInput from "./ChatInput";
import EmptyChatState from "./EmptyChatState";
import GroupChatModal from "./GroupChatModal";
import ThreadView from "./ThreadView";
import ImageModal from "./ImageModal";
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
  BellOff,
  Archive,
  Trash2,
  X,
} from "lucide-react";

// Lazy load AlertDialog
const AlertDialog = dynamic(() => import("@/components/ui/AlertDialog"), {
  ssr: false,
});

// ============================================================================
// ТИПЫ
// ============================================================================

export interface SlackStyleChatProps {
  /** Является ли пользователь председателем */
  isChairman?: boolean;
  /** Базовый URL для навигации */
  baseUrl?: string;
  /** Высота контейнера */
  containerHeight?: string;
}

// ============================================================================
// ХЕЛПЕРЫ
// ============================================================================

function getChatDisplayInfo(chat: Chat, currentUserId: string | null) {
  const isAI = chat.name === "ИИ-Ассистент";
  const isGroup = chat.type === "GROUP";
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
    subtitle = `${chat.participantsCount || chat._count?.participants || 0} участников`;
    if (isTicketChat && chat.ticketPublicId) {
      subtitle = `Обращение #${chat.ticketPublicId} · ${subtitle}`;
    }
  } else if (chat.otherUser) {
    displayName = [chat.otherUser.lastName, chat.otherUser.firstName]
      .filter(Boolean)
      .join(" ") || "Пользователь";
    avatarUrl = chat.otherUser.avatarUrl || null;
    subtitle = chat.otherUser.jobTitle || chat.otherUser.profession || "Онлайн";
  }

  return { displayName, avatarUrl, subtitle, isAI, isGroup, isTicketChat };
}

// ============================================================================
// КОМПОНЕНТ ЗАГОЛОВКА ЧАТА
// ============================================================================

interface ChatHeaderProps {
  chat: Chat;
  currentUserId: string | null;
  onBack: () => void;
  onManageParticipants?: () => void;
  onOpenSettings?: () => void;
}

function ChatHeader({
  chat,
  currentUserId,
  onBack,
  onManageParticipants,
  onOpenSettings,
}: ChatHeaderProps) {
  const [showMenu, setShowMenu] = useState(false);
  const { displayName, avatarUrl, subtitle, isAI, isGroup, isTicketChat } = getChatDisplayInfo(
    chat,
    currentUserId
  );

  return (
    <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
      {/* Left side */}
      <div className="flex items-center gap-3 min-w-0">
        <button
          onClick={onBack}
          className="md:hidden p-2 -ml-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"
        >
          <ArrowLeft className="w-5 h-5 text-gray-600 dark:text-gray-300" />
        </button>

        {/* Avatar */}
        {isAI ? (
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-500 to-blue-500 flex items-center justify-center flex-shrink-0">
            <Bot className="w-5 h-5 text-white" />
          </div>
        ) : isGroup ? (
          avatarUrl ? (
            <img
              src={avatarUrl}
              alt={displayName}
              className="w-10 h-10 rounded-xl object-cover flex-shrink-0"
            />
          ) : (
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-green-400 to-blue-500 flex items-center justify-center flex-shrink-0">
              <Hash className="w-5 h-5 text-white" />
            </div>
          )
        ) : avatarUrl ? (
          <img
            src={avatarUrl}
            alt={displayName}
            className="w-10 h-10 rounded-full object-cover flex-shrink-0"
          />
        ) : (
          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-gray-400 to-gray-500 flex items-center justify-center text-white font-medium flex-shrink-0">
            {displayName[0]?.toUpperCase() || "?"}
          </div>
        )}

        {/* Info */}
        <div className="min-w-0">
          <h2 className="font-semibold text-gray-900 dark:text-white truncate">
            {displayName}
          </h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 truncate">
            {subtitle}
          </p>
        </div>
      </div>

      {/* Right side */}
      <div className="flex items-center gap-2">
        {isGroup && !isAI && (
          <>
            <button
              onClick={onManageParticipants}
              className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"
              title="Участники"
            >
              <Users className="w-5 h-5 text-gray-600 dark:text-gray-300" />
            </button>
            <button
              onClick={onOpenSettings}
              className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"
              title="Настройки"
            >
              <Settings className="w-5 h-5 text-gray-600 dark:text-gray-300" />
            </button>
          </>
        )}

        {/* Menu */}
        <div className="relative">
          <button
            onClick={() => setShowMenu(!showMenu)}
            className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"
          >
            <MoreVertical className="w-5 h-5 text-gray-600 dark:text-gray-300" />
          </button>

          {showMenu && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setShowMenu(false)} />
              <div className="absolute right-0 top-full mt-1 w-48 bg-white dark:bg-gray-800 rounded-lg shadow-xl border border-gray-200 dark:border-gray-700 py-1 z-50">
                <button className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700">
                  <Info className="w-4 h-4" />
                  Подробности
                </button>
                <button className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700">
                  <Bell className="w-4 h-4" />
                  Уведомления
                </button>
                <div className="border-t border-gray-200 dark:border-gray-700 my-1" />
                <button className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700">
                  <Archive className="w-4 h-4" />
                  Архивировать
                </button>
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
  const [showParticipantsPanel, setShowParticipantsPanel] = useState(false);
  const [activeThread, setActiveThread] = useState<Message | null>(null);
  const [replyingTo, setReplyingTo] = useState<Message | null>(null);
  const [editingMessage, setEditingMessage] = useState<Message | null>(null);
  const [selectedImage, setSelectedImage] = useState<{ url: string; name?: string } | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<{
    isOpen: boolean;
    messageId: string | null;
  }>({ isOpen: false, messageId: null });

  // Error handler (memoized)
  const handleError = useCallback(
    (error: string) => {
      showToast(error, "error");
    },
    [showToast]
  );

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Load AI chat
  const loadAIChat = useCallback(async () => {
    try {
      const response = await fetch("/api/chat/ai");
      if (response.ok) {
        const data = await response.json();
        // AI chat will be added to the list automatically when loadChats completes
      }
    } catch (error) {
      console.error("Failed to load AI chat:", error);
    }
  }, []);

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
        router.replace(baseUrl, { scroll: false });
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mounted, loading, searchParams, chats.length]);

  // Show chat view when chat is selected
  useEffect(() => {
    if (selectedChat) {
      setShowChatView(true);
    }
  }, [selectedChat]);

  // Handlers
  const handleSelectChat = useCallback(
    (chat: Chat) => {
      selectChat(chat);
      setReplyingTo(null);
      setEditingMessage(null);
      setActiveThread(null);
    },
    [selectChat]
  );

  const handleOpenAIChat = useCallback(async () => {
    try {
      const response = await fetch("/api/chat/ai");
      if (response.ok) {
        const data = await response.json();
        if (data.chat) {
          // Добавляем флаг isAIChat для идентификации
          const aiChat = { ...data.chat, isAIChat: true };
          selectChat(aiChat);
          setShowChatView(true);
        }
      }
    } catch (error) {
      console.error("Failed to open AI chat:", error);
      showToast("Ошибка открытия чата с ИИ", "error");
    }
  }, [selectChat, showToast]);

  const handleCreateGroup = useCallback(
    async (data: { name: string; description?: string; participantIds: string[] }) => {
      try {
        const response = await fetch("/api/ppo-head/chats/groups", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(data),
        });

        if (response.ok) {
          const result = await response.json();
          showToast("Группа создана", "success");
          loadChats();
          if (result.chat) {
            selectChat(result.chat);
          }
        } else {
          const error = await response.json();
          showToast(error.error || "Ошибка создания группы", "error");
        }
      } catch (error) {
        console.error("Failed to create group:", error);
        showToast("Ошибка создания группы", "error");
      }
    },
    [loadChats, selectChat, showToast]
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

  // Convert messages for SlackStyleMessages
  const formattedMessages = useMemo(() => {
    return messages.map((m) => ({
      ...m,
      messageType: (m as any).messageType || "text",
      createdAt: new Date(m.createdAt),
      editedAt: m.editedAt ? new Date(m.editedAt) : undefined,
      threadLastReplyAt: (m as any).threadLastReplyAt
        ? new Date((m as any).threadLastReplyAt)
        : undefined,
    }));
  }, [messages]);

  // Don't render until mounted
  if (!mounted) {
    return (
      <div className="flex h-full items-center justify-center bg-white dark:bg-gray-800">
        <div className="text-center">
          <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-blue-500 border-r-transparent" />
          <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">Загрузка...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col" style={{ height: containerHeight }}>
      <div className="flex flex-1 min-h-0 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
        {/* Sidebar */}
        <div
          className={`${
            showChatView ? "hidden md:flex" : "flex"
          } w-full md:w-80 lg:w-96 border-r border-gray-200 dark:border-gray-700 flex-col min-w-0`}
        >
          <SlackStyleSidebar
            chats={chats}
            selectedChat={selectedChat}
            loading={loading}
            currentUserId={currentUserId}
            isChairman={isChairman}
            onSelectChat={handleSelectChat}
            onCreateGroup={() => setShowGroupModal(true)}
            onOpenAIChat={handleOpenAIChat}
          />
        </div>

        {/* Chat area */}
        <div
          className={`${
            showChatView ? "flex" : "hidden md:flex"
          } flex-1 flex-col min-w-0 relative`}
        >
          {selectedChat ? (
            <>
              <ChatHeader
                chat={selectedChat}
                currentUserId={currentUserId}
                onBack={handleBackToList}
                onManageParticipants={() => setShowParticipantsPanel(true)}
              />

              <div className="flex-1 flex overflow-hidden">
                {/* Messages */}
                <div className="flex-1 flex flex-col min-w-0">
                  <SlackStyleMessages
                    messages={formattedMessages}
                    currentUserId={currentUserId || ""}
                    typingUsers={
                      new Set(
                        typingUsers?.map((u) =>
                          typeof u === "string" ? u : (u as any).userId
                        ) || []
                      )
                    }
                    isTicketChat={!!selectedChat.ticketId}
                    onReply={(msg) => setReplyingTo(msg as any)}
                    onEdit={(msg) => setEditingMessage(msg as any)}
                    onDelete={(id) => setDeleteConfirm({ isOpen: true, messageId: id })}
                    onReaction={(id, emoji) => toggleReaction(id, emoji)}
                    onOpenThread={(msg) => setActiveThread(msg as any)}
                    onImageClick={(url, name) => setSelectedImage({ url, name })}
                  />

                  <ChatInput
                    onSend={(content) => handleSendMessage(content)}
                    replyTo={
                      replyingTo
                        ? { id: replyingTo.id, content: replyingTo.content }
                        : null
                    }
                    editingMessage={editingMessage ? editingMessage.content : null}
                    onCancelReply={() => setReplyingTo(null)}
                    onCancelEdit={() => setEditingMessage(null)}
                    disabled={sending}
                  />
                </div>

                {/* Thread panel */}
                {activeThread && selectedChat && (
                  <div className="hidden lg:block w-96 border-l border-gray-200 dark:border-gray-700">
                    <ThreadView
                      threadRootId={activeThread.id}
                      chatId={selectedChat.id}
                      currentUserId={currentUserId || ""}
                      onClose={() => setActiveThread(null)}
                    />
                  </div>
                )}
              </div>
            </>
          ) : (
            <EmptyChatState />
          )}
        </div>
      </div>

      {/* Modals */}
      <GroupChatModal
        isOpen={showGroupModal}
        onClose={() => setShowGroupModal(false)}
        onCreate={handleCreateGroup}
        mode="create"
      />

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

      {/* Mobile thread view */}
      {activeThread && selectedChat && (
        <div className="lg:hidden fixed inset-0 z-50">
          <ThreadView
            threadRootId={activeThread.id}
            chatId={selectedChat.id}
            currentUserId={currentUserId || ""}
            onClose={() => setActiveThread(null)}
          />
        </div>
      )}
    </div>
  );
}
