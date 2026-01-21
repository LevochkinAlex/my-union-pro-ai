"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import dynamic from "next/dynamic";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import { formatLastSeen } from "@/lib/format-last-seen";
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
import ChannelPostModal from "./ChannelPostModal";
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
// ЗАГОЛОВОК ЧАТА
// ============================================================================

interface ChatHeaderProps {
  chat: Chat;
  currentUserId: string | null;
  onBack: () => void;
  onManageParticipants?: () => void;
  onEditGroup?: () => void;
  isCurrentUserAdmin?: boolean;
}

function ChatHeader({ chat, currentUserId, onBack, onManageParticipants, onEditGroup, isCurrentUserAdmin }: ChatHeaderProps) {
  const [showMenu, setShowMenu] = useState(false);
  const { displayName, avatarUrl, subtitle, isAI, isGroup } = getChatDisplayInfo(chat, currentUserId);
  
  // Проверяем онлайн статус для личных чатов
  const otherUserId = !isGroup && !isAI && chat.otherUser?.id ? [chat.otherUser.id] : [];
  const { isOnline, getLastSeenAt } = useOnlineStatus(otherUserId);
  const isOtherUserOnline = otherUserId.length > 0 ? isOnline(otherUserId[0]) : false;
  const lastSeenAt = otherUserId.length > 0 ? getLastSeenAt(otherUserId[0]) : null;
  
  // Обновляем subtitle с реальным статусом
  // ИИ помощник всегда онлайн
  const statusSubtitle = isAI 
    ? "Всегда онлайн"
    : !isGroup 
      ? (isOtherUserOnline 
          ? "Онлайн" 
          : formatLastSeen(lastSeenAt, false))
      : subtitle;

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
          <img src={avatarUrl} alt={displayName} className="w-10 h-10 rounded-full object-cover flex-shrink-0" />
        ) : (
          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-gray-400 to-gray-500 flex items-center justify-center text-white font-medium flex-shrink-0">
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
        {isGroup && !isAI && (
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
                      className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700"
                    >
                      <Settings className="w-4 h-4" />
                      Редактировать группу
                    </button>
                    <div className="my-1 border-t border-gray-200 dark:border-gray-700" />
                  </>
                )}
                <button className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700">
                  <Info className="w-4 h-4" />
                  Подробности
                </button>
                <button className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700">
                  <Bell className="w-4 h-4" />
                  Уведомления
                </button>
                <div className="my-1 border-t border-gray-200 dark:border-gray-700" />
                <button className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700">
                  <Archive className="w-4 h-4" />
                  Архивировать
                </button>
                <button className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20">
                  <Trash2 className="w-4 h-4" />
                  Очистить историю
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
  const [groupModalMode, setGroupModalMode] = useState<'create' | 'edit'>('create');
  const [showChannelPostModal, setShowChannelPostModal] = useState(false);
  const [showParticipantsPanel, setShowParticipantsPanel] = useState(false);
  const [activeThread, setActiveThread] = useState<Message | null>(null);
  const [replyingTo, setReplyingTo] = useState<Message | null>(null);
  const [editingMessage, setEditingMessage] = useState<Message | null>(null);
  const [selectedImage, setSelectedImage] = useState<{ url: string; name?: string } | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<{ isOpen: boolean; messageId: string | null }>({ isOpen: false, messageId: null });

  const handleError = useCallback((error: string) => {
    showToast(error, "error");
  }, [showToast]);

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
  }, [mounted, loading, searchParams, chats.length]);

  useEffect(() => {
    if (selectedChat) {
      setShowChatView(true);
    }
  }, [selectedChat]);

  // Handlers
  const handleSelectChat = useCallback((chat: Chat) => {
    selectChat(chat);
    setReplyingTo(null);
    setEditingMessage(null);
    setActiveThread(null);
  }, [selectChat]);

  const handleOpenAIChat = useCallback(async () => {
    try {
      const response = await fetch("/api/chat/ai");
      if (response.ok) {
        const data = await response.json();
        if (data.chat) {
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
        const result = await response.json();
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
        const updated = await response.json();
        if (updated.chat) {
          selectChat(updated.chat);
        }
      } else {
        const error = await response.json();
        console.error("Failed to update group:", error);
        showToast(error.error || "Ошибка обновления группы", "error");
      }
    } catch (error) {
      console.error("Failed to update group:", error);
      showToast("Ошибка обновления группы", "error");
    }
  }, [selectedChat, loadChats, selectChat, showToast]);

  const handleSendMessage = useCallback(async (content: string, files?: File[], replyToId?: string, threadRootId?: string) => {
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

          try {
            const response = await fetch(`/api/chat/${selectedChat.id}/attachments`, {
              method: "POST",
              body: formData,
            });
            
            if (!response.ok) {
              const errorData = await response.json().catch(() => ({}));
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
        const success = await sendMessage(content, undefined, replyToId || replyingTo?.id, currentThreadRootId);
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
              />

              <div className="flex-1 flex overflow-hidden relative">
                <div className="flex-1 flex flex-col min-w-0">
                  <SlackStyleMessages
                    isGroupChat={selectedChat?.type === 'GROUP' || selectedChat?.type === 'CHANNEL'}
                    messages={formattedMessages}
                    currentUserId={currentUserId || ""}
                    typingUsers={new Set(typingUsers?.map((u) => typeof u === "string" ? u : (u as any).userId) || [])}
                    isTicketChat={!!selectedChat.ticketId}
                    chatId={selectedChat?.id}
                    onReply={(msg) => setReplyingTo(msg as any)}
                    onStartThread={(msg) => {
                      // Открываем тред для этого сообщения
                      setActiveThread(msg as any);
                    }}
                    onEdit={(msg) => setEditingMessage(msg as any)}
                    onDelete={(id) => setDeleteConfirm({ isOpen: true, messageId: id })}
                    onReaction={(id, emoji) => toggleReaction(id, emoji)}
                    onOpenThread={(msg) => setActiveThread(msg as any)}
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
                  ) && !activeThread ? (
                    // Для админов канала показываем кнопку создания поста
                    <div className="px-4 py-3 border-t border-gray-200 dark:border-gray-700">
                      <button
                        onClick={() => setShowChannelPostModal(true)}
                        className="w-full px-4 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
                      >
                        📢 Создать пост в канале
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
                    />
                  )}
                </div>

                {/* Thread panel */}
                {activeThread && selectedChat && (
                  <div className="hidden lg:flex w-96 border-l border-gray-200 dark:border-gray-700">
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
              const error = await response.json();
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

      {/* Mobile thread view */}
      {activeThread && selectedChat && (
        <div className="lg:hidden fixed inset-0 z-50 bg-white dark:bg-gray-900">
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
