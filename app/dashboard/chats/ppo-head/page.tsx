"use client";

import { useEffect, useState, useCallback, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import dynamic from "next/dynamic";
import { useToast } from "@/components/ui/Toast";
import { useChat } from "@/hooks/useChat";
import { Chat, Message } from "@/types/chat";
import { getUserName, getFileUrl, getInitials } from "@/lib/chat-utils";
import { alertSuccess, alertError, confirm } from "@/lib/alert";
import GroupIconUpload from "@/components/chat/GroupIconUpload";

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

interface Member {
  id: string;
  firstName: string | null;
  lastName: string | null;
  middleName: string | null;
  avatarUrl: string | null;
}

function PPOHeadChatsContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { data: session } = useSession();
  const { showToast } = useToast();
  const currentUserId = session?.user?.id || null;
  
  // Проверяем режим просмотра - эта страница только для председателей
  const isPPOHead = session?.user?.viewMode === "PPO_HEAD" || 
    (session?.user?.role === "PPO_HEAD" && !session?.user?.isPPOHead);

  // Редирект для обычных членов на страницу личных чатов
  useEffect(() => {
    if (session && !isPPOHead) {
      router.replace("/dashboard/chat");
    }
  }, [session, isPPOHead, router]);

  const handleError = useCallback((error: string) => {
    showToast(error, "error");
  }, [showToast]);

  const [mounted, setMounted] = useState(false);
  const [activeTab, setActiveTab] = useState<"organization" | "personal">("organization");
  const [showChatView, setShowChatView] = useState(false);
  const [replyingTo, setReplyingTo] = useState<Message | null>(null);
  const [editingMessage, setEditingMessage] = useState<Message | null>(null);
  const [selectedImage, setSelectedImage] = useState<{ url: string; name?: string } | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<{ isOpen: boolean; messageId: string | null }>({
    isOpen: false,
    messageId: null,
  });

  // Модалки для создания/управления группами
  const [showCreateGroupModal, setShowCreateGroupModal] = useState(false);
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [showEditGroupModal, setShowEditGroupModal] = useState(false);
  const [editingChat, setEditingChat] = useState<Chat | null>(null);
  const [inviteChat, setInviteChat] = useState<Chat | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [groupName, setGroupName] = useState("");
  const [groupDescription, setGroupDescription] = useState("");
  const [groupIcon, setGroupIcon] = useState<string | null>(null);
  const [isPublic, setIsPublic] = useState(true);
  const [selectedMembers, setSelectedMembers] = useState<string[]>([]);
  const [creating, setCreating] = useState(false);
  const [groupParticipants, setGroupParticipants] = useState<any[]>([]);

  // Состояние для пересылки сообщений
  const [forwardingMessage, setForwardingMessage] = useState<Message | null>(null);

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
    forwardMessage,
    saveScrollPosition,
    getScrollPosition,
  } = useChat({
    onError: handleError,
  });

  // Фильтруем чаты по типу
  // Организационные: с ticketId или группы
  const organizationChats = chats.filter((chat) => 
    chat.ticketId || chat.type === "GROUP"
  );
  // Личные: PRIVATE чаты без ticketId
  const personalChats = chats.filter((chat) => 
    chat.type === "PRIVATE" && !chat.ticketId
  );
  
  // Текущий список чатов в зависимости от таба
  const currentChats = activeTab === "organization" ? organizationChats : personalChats;

  useEffect(() => {
    setMounted(true);
    loadChats();
    loadMembers();
  }, []);

  // Обработка URL параметров
  useEffect(() => {
    if (!mounted || loading) return;

    const chatId = searchParams.get("chatId");
    const tab = searchParams.get("tab");
    
    // Устанавливаем таб из URL если есть
    if (tab === "personal") {
      setActiveTab("personal");
    }
    
    if (chatId) {
      // Ищем чат по ID в любом из списков
      const chat = chats.find(c => c.id === chatId);
      if (chat) {
        // Определяем таб по типу чата
        if (chat.ticketId || chat.type === "GROUP") {
          setActiveTab("organization");
        } else {
          setActiveTab("personal");
        }
        selectChat(chat);
        setShowChatView(true);
        router.replace("/dashboard/chats/ppo-head", { scroll: false });
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mounted, loading, searchParams, chats.length]);

  useEffect(() => {
    if (selectedChat) {
      setShowChatView(true);
    }
  }, [selectedChat]);

  const loadMembers = async () => {
    try {
      const response = await fetch("/api/ppo-head/members?status=approved");
      if (response.ok) {
        const data = await response.json();
        setMembers(data.members || []);
      }
    } catch (error) {
      console.error("Ошибка загрузки членов:", error);
    }
  };

  const handleSelectChat = useCallback((chat: Chat) => {
    selectChat(chat);
    setReplyingTo(null);
    setEditingMessage(null);
  }, [selectChat]);

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
    setForwardingMessage(message);
  }, []);

  const handleForwardToChat = useCallback(async (targetChat: Chat) => {
    if (!forwardingMessage) return;
    
    // Пересылка работает только в PRIVATE чаты
    if (targetChat.type !== "PRIVATE" || !targetChat.otherUser?.id) {
      showToast("Можно переслать только в личный чат", "error");
      return;
    }
    
    const success = await forwardMessage(forwardingMessage.id, targetChat.otherUser.id);
    
    if (success) {
      showToast("Сообщение переслано", "success");
      setForwardingMessage(null);
    } else {
      showToast("Ошибка пересылки", "error");
    }
  }, [forwardingMessage, forwardMessage, showToast]);

  const handleBackToList = useCallback(() => {
    setShowChatView(false);
  }, []);

  // Переход на профиль пользователя
  const handleProfileClick = useCallback((userId: string) => {
    if (userId && userId !== currentUserId) {
      router.push(`/dashboard/profile/${userId}`);
    }
  }, [router, currentUserId]);

  // Создание группы
  const handleCreateGroup = async () => {
    if (!groupName.trim()) {
      alertError("Укажите название группы");
      return;
    }
    if (selectedMembers.length === 0) {
      alertError("Выберите хотя бы одного участника");
      return;
    }

    try {
      setCreating(true);
      const response = await fetch("/api/ppo-head/chats/groups", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: groupName.trim(),
          description: groupDescription.trim() || null,
          iconUrl: groupIcon,
          isPublic,
          participantIds: selectedMembers,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Ошибка при создании группы");
      }

      alertSuccess("Группа успешно создана!");
      setShowCreateGroupModal(false);
      setGroupName("");
      setGroupDescription("");
      setGroupIcon(null);
      setSelectedMembers([]);
      setIsPublic(true);
      loadChats();
    } catch (error) {
      alertError(error instanceof Error ? error.message : "Не удалось создать группу");
    } finally {
      setCreating(false);
    }
  };

  // Удаление группы
  const handleDeleteGroup = async (chatId: string) => {
    const confirmed = await confirm(
      "Вы уверены, что хотите удалить эту группу? Все сообщения будут удалены.",
      "Подтвердите удаление"
    );
    if (!confirmed) return;

    try {
      const response = await fetch(`/api/ppo-head/chats/${chatId}`, {
        method: "DELETE",
      });
      if (!response.ok) {
        throw new Error("Ошибка удаления");
      }
      alertSuccess("Группа удалена");
      loadChats();
    } catch (error) {
      alertError("Не удалось удалить группу");
    }
  };

  // Приглашение в группу
  const handleInviteToGroup = async () => {
    if (!inviteChat || selectedMembers.length === 0) return;

    try {
      const response = await fetch(`/api/ppo-head/chats/${inviteChat.id}/invite`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ participantIds: selectedMembers }),
      });
      if (!response.ok) throw new Error("Ошибка");
      alertSuccess("Участники приглашены!");
      setShowInviteModal(false);
      setSelectedMembers([]);
      setInviteChat(null);
      loadChats();
    } catch {
      alertError("Не удалось пригласить участников");
    }
  };

  // Открыть редактирование группы
  const handleEditGroup = async (chat: Chat) => {
    setEditingChat(chat);
    setGroupName(chat.name || "");
    setGroupDescription(chat.description || "");
    setGroupIcon(chat.iconUrl || null);
    setShowEditGroupModal(true);

    // Загружаем участников
    try {
      const response = await fetch(`/api/ppo-head/chats/${chat.id}`);
      if (response.ok) {
        const data = await response.json();
        setGroupParticipants(data.chat?.participants || []);
      }
    } catch (error) {
      console.error("Ошибка загрузки участников:", error);
    }
  };

  // Сохранить изменения группы
  const handleSaveGroup = async () => {
    if (!editingChat) return;

    try {
      setCreating(true);
      const response = await fetch(`/api/ppo-head/chats/${editingChat.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: groupName.trim(),
          description: groupDescription.trim() || null,
          iconUrl: groupIcon,
        }),
      });

      if (!response.ok) {
        throw new Error("Ошибка сохранения");
      }

      alertSuccess("Группа обновлена!");
      setShowEditGroupModal(false);
      setEditingChat(null);
      loadChats();
    } catch (error) {
      alertError("Не удалось сохранить изменения");
    } finally {
      setCreating(false);
    }
  };

  // Удалить участника из группы
  const handleRemoveParticipant = async (participantId: string) => {
    if (!editingChat) return;
    
    const confirmed = await confirm("Удалить участника из группы?", "Подтвердите");
    if (!confirmed) return;

    try {
      const response = await fetch(`/api/ppo-head/chats/${editingChat.id}/participants/${participantId}`, {
        method: "DELETE",
      });
      if (!response.ok) throw new Error("Ошибка");
      
      setGroupParticipants(prev => prev.filter(p => p.user?.id !== participantId));
      alertSuccess("Участник удалён");
    } catch {
      alertError("Не удалось удалить участника");
    }
  };

  // Назначить/снять админа
  const handleToggleAdmin = async (participantId: string, currentRole: string) => {
    if (!editingChat) return;

    const newRole = currentRole === "ADMIN" ? "member" : "admin";
    
    try {
      const response = await fetch(`/api/ppo-head/chats/${editingChat.id}/participants/${participantId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: newRole }),
      });
      if (!response.ok) throw new Error("Ошибка");
      
      setGroupParticipants(prev => prev.map(p => 
        p.user?.id === participantId 
          ? { ...p, role: newRole === "admin" ? "ADMIN" : "MEMBER" }
          : p
      ));
      alertSuccess(newRole === "admin" ? "Назначен админом" : "Роль снята");
    } catch {
      alertError("Не удалось изменить роль");
    }
  };

  const toggleMemberSelection = (memberId: string) => {
    setSelectedMembers((prev) =>
      prev.includes(memberId)
        ? prev.filter((id) => id !== memberId)
        : [...prev, memberId]
    );
  };

  if (!mounted) {
    return <PageSkeleton />;
  }

  return (
    <div className="flex flex-col h-[calc(100vh-10rem)]">
      {/* Заголовок с табами */}
      <div className="shrink-0 mb-4">
        <div className="flex items-center justify-between gap-4 mb-4">
          <h1 className="text-xl font-bold text-gray-900 dark:text-white">
            Чаты
          </h1>
          {activeTab === "organization" && (
            <button
              onClick={() => setShowCreateGroupModal(true)}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700 flex items-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              <span className="hidden sm:inline">Создать группу</span>
            </button>
          )}
        </div>
        
        {/* Табы */}
        <div className="flex border-b border-gray-200 dark:border-gray-700">
          <button
            onClick={() => setActiveTab("organization")}
            className={`flex-1 py-3 px-4 text-sm font-medium border-b-2 transition-colors ${
              activeTab === "organization"
                ? "border-blue-600 text-blue-600 dark:text-blue-400"
                : "border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
            }`}
          >
            <span className="flex items-center justify-center gap-2">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
              </svg>
              Чаты организации
              {organizationChats.length > 0 && (
                <span className="bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 px-2 py-0.5 rounded-full text-xs">
                  {organizationChats.length}
                </span>
              )}
            </span>
          </button>
          <button
            onClick={() => setActiveTab("personal")}
            className={`flex-1 py-3 px-4 text-sm font-medium border-b-2 transition-colors ${
              activeTab === "personal"
                ? "border-blue-600 text-blue-600 dark:text-blue-400"
                : "border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
            }`}
          >
            <span className="flex items-center justify-center gap-2">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
              </svg>
              Личные чаты
              {personalChats.length > 0 && (
                <span className="bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 px-2 py-0.5 rounded-full text-xs">
                  {personalChats.length}
                </span>
              )}
            </span>
          </button>
        </div>
      </div>

      {/* Основной интерфейс чата */}
      <div className="flex flex-1 min-h-0 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
        {/* Сайдбар со списком чатов */}
        <div className={`${showChatView ? "hidden md:flex" : "flex"} w-full md:w-1/3 border-r border-gray-200 dark:border-gray-700 flex-col`}>
          {activeTab === "organization" ? (
            <OrgChatSidebar
              chats={organizationChats}
              selectedChat={selectedChat}
              loading={loading}
              currentUserId={currentUserId}
              onSelectChat={handleSelectChat}
              onInvite={(chat) => {
                setInviteChat(chat);
                setShowInviteModal(true);
              }}
              onEdit={handleEditGroup}
              onDelete={handleDeleteGroup}
            />
          ) : (
            <PersonalChatSidebar
              chats={personalChats}
              selectedChat={selectedChat}
              loading={loading}
              currentUserId={currentUserId}
              onSelectChat={handleSelectChat}
            />
          )}
        </div>

        {/* Область чата */}
        <div className={`${showChatView ? "flex" : "hidden md:flex"} flex-1 flex-col`}>
          {selectedChat ? (
            <>
              <OrgChatHeader
                chat={selectedChat}
                onBack={handleBackToList}
                onInvite={() => {
                  setInviteChat(selectedChat);
                  setShowInviteModal(true);
                }}
                onEdit={() => handleEditGroup(selectedChat)}
                onDelete={() => handleDeleteGroup(selectedChat.id)}
                onProfileClick={handleProfileClick}
              />

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
            <EmptyOrgChatState />
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

      {/* Модал пересылки сообщения */}
      {forwardingMessage && (
        <ForwardModal
          message={forwardingMessage}
          chats={chats.filter(c => c.id !== selectedChat?.id && c.type === "PRIVATE")}
          onSelect={handleForwardToChat}
          onClose={() => setForwardingMessage(null)}
        />
      )}

      {/* Модалка создания группы */}
      {showCreateGroupModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-lg dark:border-gray-700 dark:bg-gray-800 w-full max-w-md max-h-[90vh] overflow-y-auto">
            <h2 className="text-xl font-semibold mb-4 text-gray-900 dark:text-white">Создать группу</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Название группы *
                </label>
                <input
                  type="text"
                  value={groupName}
                  onChange={(e) => setGroupName(e.target.value)}
                  className="w-full rounded-md border border-gray-300 px-3 py-2 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
                  placeholder="Например: Профком 2025"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Описание
                </label>
                <textarea
                  value={groupDescription}
                  onChange={(e) => setGroupDescription(e.target.value)}
                  className="w-full rounded-md border border-gray-300 px-3 py-2 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
                  rows={3}
                  placeholder="Описание группы..."
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Иконка группы
                </label>
                <GroupIconUpload value={groupIcon} onChange={setGroupIcon} />
              </div>
              <div className="flex items-center">
                <input
                  type="checkbox"
                  id="isPublic"
                  checked={isPublic}
                  onChange={(e) => setIsPublic(e.target.checked)}
                  className="h-4 w-4 rounded border-gray-300 text-blue-600"
                />
                <label htmlFor="isPublic" className="ml-2 text-sm font-medium text-gray-700 dark:text-gray-300">
                  Публичная группа
                </label>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Участники *
                </label>
                <div className="max-h-48 overflow-y-auto rounded-md border border-gray-300 p-2 dark:border-gray-600">
                  {members.length === 0 ? (
                    <p className="text-sm text-gray-500 p-2">Нет членов профсоюза</p>
                  ) : (
                    members.map((member) => {
                      const fullName = [member.lastName, member.firstName, member.middleName].filter(Boolean).join(" ");
                      return (
                        <label key={member.id} className="flex items-center gap-2 p-2 hover:bg-gray-50 dark:hover:bg-gray-700 rounded cursor-pointer">
                          <input
                            type="checkbox"
                            checked={selectedMembers.includes(member.id)}
                            onChange={() => toggleMemberSelection(member.id)}
                            className="rounded"
                          />
                          <span className="text-sm text-gray-900 dark:text-white">{fullName}</span>
                        </label>
                      );
                    })
                  )}
                </div>
              </div>
              <div className="flex gap-2 pt-2">
                <button
                  onClick={handleCreateGroup}
                  disabled={creating || !groupName.trim() || selectedMembers.length === 0}
                  className="flex-1 rounded-lg bg-blue-600 px-4 py-2 text-white hover:bg-blue-700 disabled:opacity-50"
                >
                  {creating ? "Создание..." : "Создать"}
                </button>
                <button
                  onClick={() => {
                    setShowCreateGroupModal(false);
                    setGroupName("");
                    setGroupDescription("");
                    setGroupIcon(null);
                    setSelectedMembers([]);
                  }}
                  className="flex-1 rounded-lg border border-gray-300 px-4 py-2 hover:bg-gray-50 dark:border-gray-600 dark:hover:bg-gray-700 text-gray-900 dark:text-white"
                >
                  Отмена
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Модалка редактирования группы */}
      {showEditGroupModal && editingChat && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-lg dark:border-gray-700 dark:bg-gray-800 w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <h2 className="text-xl font-semibold mb-4 text-gray-900 dark:text-white">
              Редактировать группу
            </h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Название группы
                </label>
                <input
                  type="text"
                  value={groupName}
                  onChange={(e) => setGroupName(e.target.value)}
                  className="w-full rounded-md border border-gray-300 px-3 py-2 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Описание
                </label>
                <textarea
                  value={groupDescription}
                  onChange={(e) => setGroupDescription(e.target.value)}
                  className="w-full rounded-md border border-gray-300 px-3 py-2 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
                  rows={2}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Иконка группы
                </label>
                <GroupIconUpload value={groupIcon} onChange={setGroupIcon} />
              </div>

              {/* Участники */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Участники ({groupParticipants.length})
                </label>
                <div className="max-h-48 overflow-y-auto rounded-md border border-gray-300 dark:border-gray-600 divide-y divide-gray-200 dark:divide-gray-700">
                  {groupParticipants.map((participant) => {
                    const user = participant.user;
                    const fullName = [user?.lastName, user?.firstName, user?.middleName].filter(Boolean).join(" ") || "Неизвестный";
                    const isCreator = editingChat.createdById === user?.id;
                    const isAdmin = participant.role === "admin" || participant.role === "ADMIN";
                    
                    return (
                      <div key={participant.id || user?.id} className="flex items-center justify-between p-2 hover:bg-gray-50 dark:hover:bg-gray-700">
                        <div className="flex items-center gap-2">
                          {user?.avatarUrl ? (
                            <img src={getFileUrl(user.avatarUrl)} alt="" className="w-8 h-8 rounded-full object-cover" />
                          ) : (
                            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white text-xs font-semibold">
                              {getInitials(user)}
                            </div>
                          )}
                          <div>
                            <p className="text-sm text-gray-900 dark:text-white">{fullName}</p>
                            <div className="flex gap-1">
                              {isCreator && (
                                <span className="text-xs bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400 px-1.5 py-0.5 rounded">
                                  Создатель
                                </span>
                              )}
                              {isAdmin && !isCreator && (
                                <span className="text-xs bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400 px-1.5 py-0.5 rounded">
                                  Админ
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                        {!isCreator && (
                          <div className="flex gap-1">
                            <button
                              onClick={() => handleToggleAdmin(user?.id, participant.role)}
                              className={`p-1.5 rounded text-xs ${
                                isAdmin 
                                  ? "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400" 
                                  : "bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400"
                              } hover:opacity-80`}
                              title={isAdmin ? "Снять админа" : "Назначить админом"}
                            >
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                              </svg>
                            </button>
                            <button
                              onClick={() => handleRemoveParticipant(user?.id)}
                              className="p-1.5 rounded text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20"
                              title="Удалить из группы"
                            >
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                              </svg>
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  onClick={handleSaveGroup}
                  disabled={creating || !groupName.trim()}
                  className="flex-1 rounded-lg bg-blue-600 px-4 py-2 text-white hover:bg-blue-700 disabled:opacity-50"
                >
                  {creating ? "Сохранение..." : "Сохранить"}
                </button>
                <button
                  onClick={() => {
                    setShowEditGroupModal(false);
                    setEditingChat(null);
                    setGroupParticipants([]);
                  }}
                  className="flex-1 rounded-lg border border-gray-300 px-4 py-2 hover:bg-gray-50 dark:border-gray-600 dark:hover:bg-gray-700 text-gray-900 dark:text-white"
                >
                  Отмена
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Модалка приглашения */}
      {showInviteModal && inviteChat && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-lg dark:border-gray-700 dark:bg-gray-800 w-full max-w-md max-h-[90vh] overflow-y-auto">
            <h2 className="text-xl font-semibold mb-4 text-gray-900 dark:text-white">
              Пригласить в "{inviteChat.ticketId && inviteChat.ticketPublicId 
                ? `Обращение #${inviteChat.ticketPublicId}` 
                : (inviteChat.name || "группу")}"
            </h2>
            <div className="max-h-60 overflow-y-auto rounded-md border border-gray-300 p-2 dark:border-gray-600 mb-4">
              {members.map((member) => {
                const fullName = [member.lastName, member.firstName, member.middleName].filter(Boolean).join(" ");
                const isAlready = inviteChat.participants?.some((p: any) => p.user?.id === member.id || p.userId === member.id);
                return (
                  <label key={member.id} className={`flex items-center gap-2 p-2 hover:bg-gray-50 dark:hover:bg-gray-700 rounded cursor-pointer ${isAlready ? "opacity-50" : ""}`}>
                    <input
                      type="checkbox"
                      checked={selectedMembers.includes(member.id)}
                      onChange={() => toggleMemberSelection(member.id)}
                      disabled={isAlready}
                      className="rounded"
                    />
                    <span className="text-sm text-gray-900 dark:text-white">
                      {fullName} {isAlready && "(уже в группе)"}
                    </span>
                  </label>
                );
              })}
            </div>
            <div className="flex gap-2">
              <button
                onClick={handleInviteToGroup}
                disabled={selectedMembers.length === 0}
                className="flex-1 rounded-lg bg-blue-600 px-4 py-2 text-white hover:bg-blue-700 disabled:opacity-50"
              >
                Пригласить
              </button>
              <button
                onClick={() => {
                  setShowInviteModal(false);
                  setSelectedMembers([]);
                  setInviteChat(null);
                }}
                className="flex-1 rounded-lg border border-gray-300 px-4 py-2 hover:bg-gray-50 dark:border-gray-600 dark:hover:bg-gray-700 text-gray-900 dark:text-white"
              >
                Отмена
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Сайдбар для организационных чатов
function OrgChatSidebar({
  chats,
  selectedChat,
  loading,
  currentUserId,
  onSelectChat,
  onInvite,
  onEdit,
  onDelete,
}: {
  chats: Chat[];
  selectedChat: Chat | null;
  loading: boolean;
  currentUserId: string | null;
  onSelectChat: (chat: Chat) => void;
  onInvite: (chat: Chat) => void;
  onEdit?: (chat: Chat) => void;
  onDelete: (chatId: string) => void;
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
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
        </div>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Чаты организации появятся при создании обращений или групп
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
          <OrgChatItem
            key={chat.id}
            chat={chat}
            isSelected={selectedChat?.id === chat.id}
            currentUserId={currentUserId}
            onClick={() => onSelectChat(chat)}
            onInvite={() => onInvite(chat)}
            onEdit={() => onEdit?.(chat)}
            onDelete={() => onDelete(chat.id)}
          />
        ))}
      </div>
    </div>
  );
}

// Сайдбар для личных чатов
function PersonalChatSidebar({
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
          Нет личных чатов
        </p>
        <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
          Начните переписку с коллегами из профсети
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div className="p-4 border-b border-gray-200 dark:border-gray-700">
        <h2 className="font-semibold text-gray-900 dark:text-white flex items-center gap-2">
          Личные чаты
          <span className="text-xs bg-gray-100 dark:bg-gray-700 px-2 py-0.5 rounded-full text-gray-600 dark:text-gray-400">
            {chats.length}
          </span>
        </h2>
      </div>
      <div className="flex-1 overflow-y-auto">
        {chats.map((chat) => (
          <PersonalChatItem
            key={chat.id}
            chat={chat}
            isSelected={selectedChat?.id === chat.id}
            currentUserId={currentUserId}
            onClick={() => onSelectChat(chat)}
          />
        ))}
      </div>
    </div>
  );
}

// Элемент личного чата в сайдбаре
function PersonalChatItem({
  chat,
  isSelected,
  currentUserId,
  onClick,
}: {
  chat: Chat;
  isSelected: boolean;
  currentUserId: string | null;
  onClick: () => void;
}) {
  const name = getUserName(chat.otherUser);
  const avatar = chat.otherUser?.avatarUrl;

  return (
    <div
      className={`flex items-center gap-3 p-3 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors ${
        isSelected ? "bg-blue-50 dark:bg-blue-900/30" : ""
      }`}
      onClick={onClick}
    >
      {avatar ? (
        <img src={getFileUrl(avatar)} alt="" className="w-12 h-12 rounded-full object-cover" />
      ) : (
        <div className="w-12 h-12 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white font-semibold">
          {getInitials(chat.otherUser)}
        </div>
      )}
      <div className="flex-1 min-w-0">
        <p className="font-medium text-gray-900 dark:text-white truncate">{name}</p>
        {chat.lastMessage && (
          <p className="text-sm text-gray-500 dark:text-gray-400 truncate">{chat.lastMessage}</p>
        )}
      </div>
      {chat.unreadCount && chat.unreadCount > 0 && (
        <span className="shrink-0 bg-blue-600 text-white text-xs font-medium px-2 py-0.5 rounded-full">
          {chat.unreadCount}
        </span>
      )}
    </div>
  );
}

// Элемент чата в сайдбаре
function OrgChatItem({
  chat,
  isSelected,
  currentUserId,
  onClick,
  onInvite,
  onEdit,
  onDelete,
}: {
  chat: Chat;
  isSelected: boolean;
  currentUserId: string | null;
  onClick: () => void;
  onInvite: () => void;
  onEdit?: () => void;
  onDelete: () => void;
}) {
  const [showMenu, setShowMenu] = useState(false);

  const getChatName = () => {
    if (chat.type === "GROUP") return chat.name || "Группа";
    if (chat.ticketId && chat.ticketPublicId) return `Обращение #${chat.ticketPublicId}`;
    return getUserName(chat.otherUser);
  };

  const getChatDescription = () => {
    if (chat.type === "GROUP") {
      const count = chat.participantsCount || chat._count?.participants || 0;
      return `${count} участник${count === 1 ? "" : count < 5 ? "а" : "ов"}`;
    }
    if (chat.ticketTitle) return chat.ticketTitle;
    return chat.lastMessage || "Нет сообщений";
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
        {getInitials(chat.otherUser)}
      </div>
    );
  };

  return (
    <div
      className={`relative flex items-center gap-3 p-3 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors ${
        isSelected ? "bg-blue-50 dark:bg-blue-900/30" : ""
      }`}
      onClick={onClick}
    >
      {getAvatar()}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-medium text-gray-900 dark:text-white truncate">{getChatName()}</span>
          {chat.ticketId && (
            <span className="shrink-0 text-xs bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400 px-1.5 py-0.5 rounded">
              Обращение
            </span>
          )}
          {chat.type === "GROUP" && (
            <span className="shrink-0 text-xs bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400 px-1.5 py-0.5 rounded">
              Группа
            </span>
          )}
        </div>
        <p className="text-sm text-gray-500 dark:text-gray-400 truncate">{getChatDescription()}</p>
      </div>
      
      {/* Меню для групп */}
      {chat.type === "GROUP" && (
        <div className="relative">
          <button
            onClick={(e) => {
              e.stopPropagation();
              setShowMenu(!showMenu);
            }}
            className="p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-600"
          >
            <svg className="w-5 h-5 text-gray-500" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 8c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm0 2c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm0 6c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z" />
            </svg>
          </button>
          {showMenu && (
            <div className="absolute right-0 top-8 w-44 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg z-10">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setShowMenu(false);
                  onEdit?.();
                }}
                className="w-full px-4 py-2 text-left text-sm hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-200 flex items-center gap-2"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                </svg>
                Редактировать
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setShowMenu(false);
                  onInvite();
                }}
                className="w-full px-4 py-2 text-left text-sm hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-200 flex items-center gap-2"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
                </svg>
                Пригласить
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setShowMenu(false);
                  onDelete();
                }}
                className="w-full px-4 py-2 text-left text-sm hover:bg-gray-50 dark:hover:bg-gray-700 text-red-600 flex items-center gap-2"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
                Удалить группу
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// Заголовок чата
function OrgChatHeader({
  chat,
  onBack,
  onInvite,
  onEdit,
  onDelete,
  onProfileClick,
}: {
  chat: Chat;
  onBack: () => void;
  onInvite: () => void;
  onEdit?: () => void;
  onDelete: () => void;
  onProfileClick?: (userId: string) => void;
}) {
  const [showMenu, setShowMenu] = useState(false);

  const getChatName = () => {
    if (chat.type === "GROUP") return chat.name || "Группа";
    if (chat.ticketId && chat.ticketPublicId) return `Обращение #${chat.ticketPublicId}`;
    return getUserName(chat.otherUser);
  };

  const getSubtitle = () => {
    if (chat.type === "GROUP") {
      const count = chat.participantsCount || chat._count?.participants || 0;
      return `${count} участник${count === 1 ? "" : count < 5 ? "а" : "ов"}`;
    }
    if (chat.ticketTitle) return chat.ticketTitle;
    return chat.otherUser?.phone || "";
  };

  const handleAvatarClick = () => {
    // Для обычных чатов (не группы и не обращения) кликаем на профиль
    if (onProfileClick && chat.otherUser?.id && chat.type !== "GROUP" && !chat.ticketId) {
      onProfileClick(chat.otherUser.id);
    }
  };

  const isClickable = !!onProfileClick && !!chat.otherUser?.id && chat.type !== "GROUP" && !chat.ticketId;

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
        onClick={handleAvatarClick}
        disabled={!isClickable}
        className={isClickable ? "cursor-pointer hover:opacity-80 transition-opacity" : "cursor-default"}
      >
        {chat.type === "GROUP" ? (
          chat.iconUrl ? (
            <img src={getFileUrl(chat.iconUrl)} alt="" className="w-10 h-10 rounded-full object-cover" />
          ) : (
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-green-500 to-teal-600 flex items-center justify-center text-white">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </div>
          )
        ) : chat.ticketId ? (
          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-yellow-500 to-orange-500 flex items-center justify-center text-white">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
            </svg>
          </div>
        ) : chat.otherUser?.avatarUrl ? (
          <img src={getFileUrl(chat.otherUser.avatarUrl)} alt="" className="w-10 h-10 rounded-full object-cover" />
        ) : (
          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white font-semibold">
            {getInitials(chat.otherUser)}
          </div>
        )}
      </button>

      <div className="flex-1 min-w-0">
        <button
          onClick={handleAvatarClick}
          disabled={!isClickable}
          className={`text-left ${isClickable ? "cursor-pointer hover:underline" : "cursor-default"}`}
        >
          <h3 className="font-semibold text-gray-900 dark:text-white truncate">{getChatName()}</h3>
        </button>
        <p className="text-sm text-gray-500 dark:text-gray-400 truncate">{getSubtitle()}</p>
      </div>

      {chat.type === "GROUP" && (
        <div className="relative">
          <button
            onClick={() => setShowMenu(!showMenu)}
            className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700"
          >
            <svg className="w-5 h-5 text-gray-500" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 8c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm0 2c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm0 6c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z" />
            </svg>
          </button>
          {showMenu && (
            <div className="absolute right-0 top-12 w-44 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg z-10">
              <button
                onClick={() => {
                  setShowMenu(false);
                  onEdit?.();
                }}
                className="w-full px-4 py-2 text-left text-sm hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-200 flex items-center gap-2"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                </svg>
                Редактировать
              </button>
              <button
                onClick={() => {
                  setShowMenu(false);
                  onInvite();
                }}
                className="w-full px-4 py-2 text-left text-sm hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-200 flex items-center gap-2"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
                </svg>
                Пригласить
              </button>
              <button
                onClick={() => {
                  setShowMenu(false);
                  onDelete();
                }}
                className="w-full px-4 py-2 text-left text-sm hover:bg-gray-50 dark:hover:bg-gray-700 text-red-600 flex items-center gap-2"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
                Удалить группу
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// Пустое состояние
function EmptyOrgChatState() {
  return (
    <div className="flex-1 flex items-center justify-center bg-gray-50 dark:bg-gray-900/50">
      <div className="text-center p-6">
        <div className="w-24 h-24 mx-auto mb-4 rounded-full bg-gray-200 dark:bg-gray-700 flex items-center justify-center">
          <svg className="w-12 h-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
        </div>
        <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-1">
          Выберите чат
        </h3>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Чаты обращений и группы организации
        </p>
      </div>
    </div>
  );
}

// Скелетоны
function PageSkeleton() {
  return (
    <div className="flex h-[calc(100vh-10rem)] bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden items-center justify-center">
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

// Модал для пересылки сообщений
function ForwardModal({
  message,
  chats,
  onSelect,
  onClose,
}: {
  message: Message;
  chats: Chat[];
  onSelect: (chat: Chat) => void;
  onClose: () => void;
}) {
  const [search, setSearch] = useState("");
  
  const filteredChats = chats.filter(chat => {
    if (!search) return true;
    const name = getUserName(chat.otherUser).toLowerCase();
    return name.includes(search.toLowerCase());
  });

  return (
    <div 
      className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div 
        className="bg-white dark:bg-gray-800 rounded-xl w-full max-w-md max-h-[70vh] flex flex-col shadow-xl"
        onClick={e => e.stopPropagation()}
      >
        {/* Заголовок */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
            Переслать сообщение
          </h3>
          <button
            onClick={onClose}
            className="p-2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        
        {/* Превью сообщения */}
        <div className="px-4 py-3 bg-gray-50 dark:bg-gray-900/50 border-b border-gray-200 dark:border-gray-700">
          <p className="text-sm text-gray-600 dark:text-gray-400 line-clamp-2">
            {message.content || "📎 Вложение"}
          </p>
        </div>
        
        {/* Поиск */}
        <div className="p-3 border-b border-gray-200 dark:border-gray-700">
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Поиск чата..."
            className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        
        {/* Список чатов */}
        <div className="flex-1 overflow-y-auto">
          {filteredChats.length === 0 ? (
            <div className="p-8 text-center text-gray-500 dark:text-gray-400">
              {search ? "Чаты не найдены" : "Нет доступных чатов"}
            </div>
          ) : (
            filteredChats.map(chat => (
              <button
                key={chat.id}
                onClick={() => onSelect(chat)}
                className="w-full flex items-center gap-3 p-3 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
              >
                {chat.otherUser?.avatarUrl ? (
                  <img
                    src={getFileUrl(chat.otherUser.avatarUrl)}
                    alt={getUserName(chat.otherUser)}
                    className="w-10 h-10 rounded-full object-cover"
                  />
                ) : (
                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white font-semibold text-sm">
                    {getInitials(chat.otherUser)}
                  </div>
                )}
                <div className="flex-1 min-w-0 text-left">
                  <p className="font-medium text-gray-900 dark:text-white truncate">
                    {getUserName(chat.otherUser)}
                  </p>
                  {chat.lastMessage && (
                    <p className="text-sm text-gray-500 dark:text-gray-400 truncate">
                      {chat.lastMessage}
                    </p>
                  )}
                </div>
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

// Экспорт с Suspense
export default function PPOHeadChatsPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <PPOHeadChatsContent />
    </Suspense>
  );
}
