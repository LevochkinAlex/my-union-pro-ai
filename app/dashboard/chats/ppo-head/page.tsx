"use client";

import { useEffect, useState, useCallback, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import dynamic from "next/dynamic";
import { useToast } from "@/components/ui/Toast";
import { useChat } from "@/hooks/useChat";
import { Chat, Message } from "@/types/chat";
import { getUserName, getFileUrl } from "@/lib/chat-utils";
import { alertSuccess, alertError, confirm } from "@/lib/alert";
import ImageUploadWithCrop from "@/components/admin/ImageUploadWithCrop";

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

  // Модалки для создания/управления группами
  const [showCreateGroupModal, setShowCreateGroupModal] = useState(false);
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [inviteChat, setInviteChat] = useState<Chat | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [groupName, setGroupName] = useState("");
  const [groupDescription, setGroupDescription] = useState("");
  const [groupIcon, setGroupIcon] = useState<string | null>(null);
  const [isPublic, setIsPublic] = useState(true);
  const [selectedMembers, setSelectedMembers] = useState<string[]>([]);
  const [creating, setCreating] = useState(false);

  // Состояние для пересылки сообщений
  const [forwardModal, setForwardModal] = useState<{
    isOpen: boolean;
    message: Message | null;
  }>({ isOpen: false, message: null });
  const [forwardSearch, setForwardSearch] = useState("");
  const [forwarding, setForwarding] = useState(false);

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

  // Фильтруем только организационные чаты (с ticketId или группы)
  const organizationChats = chats.filter((chat) => 
    chat.ticketId || chat.type === "GROUP"
  );

  useEffect(() => {
    setMounted(true);
    loadChats();
    loadMembers();
  }, []);

  // Обработка URL параметров
  useEffect(() => {
    if (!mounted || loading) return;

    const chatId = searchParams.get("chatId");
    if (chatId) {
      const chat = organizationChats.find(c => c.id === chatId);
      if (chat) {
        selectChat(chat);
        setShowChatView(true);
        router.replace("/dashboard/chats/ppo-head", { scroll: false });
      }
    }
  }, [mounted, loading, searchParams, organizationChats, selectChat, router]);

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
    setForwardModal({ isOpen: true, message });
    setForwardSearch("");
  }, []);

  const handleForwardToUser = useCallback(async (targetUserId: string) => {
    if (!forwardModal.message) return;
    
    setForwarding(true);
    try {
      const success = await forwardMessage(forwardModal.message.id, targetUserId);
      if (success) {
        showToast("Сообщение переслано", "success");
        setForwardModal({ isOpen: false, message: null });
      } else {
        showToast("Не удалось переслать сообщение", "error");
      }
    } catch (error) {
      showToast("Ошибка при пересылке", "error");
    } finally {
      setForwarding(false);
    }
  }, [forwardModal.message, forwardMessage, showToast]);

  const handleBackToList = useCallback(() => {
    setShowChatView(false);
  }, []);

  // Переход на профиль пользователя
  const handleProfileClick = useCallback((userId: string) => {
    if (userId && userId !== currentUserId) {
      router.push(`/dashboard/social/profile/${userId}`);
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
      {/* Навигация и кнопка создания группы */}
      <div className="shrink-0 mb-4 flex items-center justify-between">
        <div className="border-b border-gray-200 dark:border-gray-700 flex-1">
          <nav className="-mb-px flex space-x-8">
            <span className="whitespace-nowrap border-b-2 border-blue-500 py-3 px-1 text-sm font-medium text-blue-600 dark:text-blue-400">
              Чаты организации
              {organizationChats.length > 0 && (
                <span className="ml-2 rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-800 dark:bg-blue-900/30 dark:text-blue-400">
                  {organizationChats.length}
                </span>
              )}
            </span>
            <button
              onClick={() => router.push("/dashboard/chat")}
              className="whitespace-nowrap border-b-2 border-transparent py-3 px-1 text-sm font-medium text-gray-500 hover:border-gray-300 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300 transition-colors"
            >
              Личные чаты →
            </button>
          </nav>
        </div>
        <button
          onClick={() => setShowCreateGroupModal(true)}
          className="ml-4 rounded-lg bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700 flex items-center gap-2"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Создать группу
        </button>
      </div>

      {/* Основной интерфейс чата */}
      <div className="flex flex-1 min-h-0 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
        {/* Сайдбар со списком чатов */}
        <div className={`${showChatView ? "hidden md:flex" : "flex"} w-full md:w-1/3 border-r border-gray-200 dark:border-gray-700 flex-col`}>
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
            onDelete={handleDeleteGroup}
          />
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
                onDelete={() => handleDeleteGroup(selectedChat.id)}
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
      {forwardModal.isOpen && (
        <ForwardModal
          chats={chats}
          currentUserId={currentUserId}
          searchQuery={forwardSearch}
          onSearchChange={setForwardSearch}
          onSelect={handleForwardToUser}
          onClose={() => setForwardModal({ isOpen: false, message: null })}
          loading={forwarding}
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
                <ImageUploadWithCrop value={groupIcon} onChange={setGroupIcon} label="" />
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

      {/* Модалка приглашения */}
      {showInviteModal && inviteChat && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-lg dark:border-gray-700 dark:bg-gray-800 w-full max-w-md max-h-[90vh] overflow-y-auto">
            <h2 className="text-xl font-semibold mb-4 text-gray-900 dark:text-white">
              Пригласить в "{inviteChat.name || "группу"}"
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
  onDelete,
}: {
  chats: Chat[];
  selectedChat: Chat | null;
  loading: boolean;
  currentUserId: string | null;
  onSelectChat: (chat: Chat) => void;
  onInvite: (chat: Chat) => void;
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
            onDelete={() => onDelete(chat.id)}
          />
        ))}
      </div>
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
  onDelete,
}: {
  chat: Chat;
  isSelected: boolean;
  currentUserId: string | null;
  onClick: () => void;
  onInvite: () => void;
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
        {chat.otherUser?.firstName?.[0] || "?"}{chat.otherUser?.lastName?.[0] || ""}
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
            <div className="absolute right-0 top-8 w-40 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg z-10">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setShowMenu(false);
                  onInvite();
                }}
                className="w-full px-4 py-2 text-left text-sm hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-200"
              >
                Пригласить
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setShowMenu(false);
                  onDelete();
                }}
                className="w-full px-4 py-2 text-left text-sm hover:bg-gray-50 dark:hover:bg-gray-700 text-red-600"
              >
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
  onDelete,
}: {
  chat: Chat;
  onBack: () => void;
  onInvite: () => void;
  onDelete: () => void;
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
          {chat.otherUser?.firstName?.[0] || "?"}{chat.otherUser?.lastName?.[0] || ""}
        </div>
      )}

      <div className="flex-1 min-w-0">
        <h3 className="font-semibold text-gray-900 dark:text-white truncate">{getChatName()}</h3>
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
  chats,
  currentUserId,
  searchQuery,
  onSearchChange,
  onSelect,
  onClose,
  loading,
}: {
  chats: Chat[];
  currentUserId: string | null;
  searchQuery: string;
  onSearchChange: (query: string) => void;
  onSelect: (userId: string) => void;
  onClose: () => void;
  loading: boolean;
}) {
  // Фильтруем только личные чаты и исключаем текущего пользователя
  const privateChats = chats.filter(
    (chat) => chat.type === "PRIVATE" && chat.otherUser?.id && chat.otherUser.id !== currentUserId
  );

  const filteredChats = privateChats.filter((chat) => {
    if (!searchQuery) return true;
    const name = getUserName(chat.otherUser).toLowerCase();
    return name.includes(searchQuery.toLowerCase());
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />
      
      {/* Modal */}
      <div className="relative bg-white dark:bg-gray-800 rounded-xl shadow-xl w-full max-w-md mx-4 max-h-[70vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
            Переслать сообщение
          </h3>
          <button
            onClick={onClose}
            className="p-1 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Search */}
        <div className="p-3 border-b border-gray-200 dark:border-gray-700">
          <div className="relative">
            <input
              type="text"
              placeholder="Поиск..."
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-gray-100 dark:bg-gray-700 border-0 rounded-lg text-sm text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 focus:ring-2 focus:ring-blue-500 outline-none"
            />
            <svg
              className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </div>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto p-2">
          {filteredChats.length === 0 ? (
            <div className="text-center py-8 text-gray-500 dark:text-gray-400">
              {searchQuery ? "Ничего не найдено" : "Нет доступных чатов"}
            </div>
          ) : (
            <div className="space-y-1">
              {filteredChats.map((chat) => (
                <button
                  key={chat.id}
                  onClick={() => onSelect(chat.otherUser.id)}
                  disabled={loading}
                  className="w-full flex items-center gap-3 p-3 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors disabled:opacity-50"
                >
                  {/* Avatar */}
                  {chat.otherUser.avatarUrl ? (
                    <img
                      src={getFileUrl(chat.otherUser.avatarUrl)}
                      alt={getUserName(chat.otherUser)}
                      className="w-10 h-10 rounded-full object-cover"
                    />
                  ) : (
                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white text-sm font-semibold">
                      {chat.otherUser.firstName?.[0] || "?"}{chat.otherUser.lastName?.[0] || ""}
                    </div>
                  )}

                  {/* Name */}
                  <div className="flex-1 text-left">
                    <div className="font-medium text-gray-900 dark:text-white">
                      {getUserName(chat.otherUser)}
                    </div>
                    {chat.lastMessage && (
                      <div className="text-xs text-gray-500 dark:text-gray-400 truncate">
                        {chat.lastMessage}
                      </div>
                    )}
                  </div>

                  {/* Arrow */}
                  <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Loading indicator */}
        {loading && (
          <div className="absolute inset-0 bg-white/50 dark:bg-gray-800/50 flex items-center justify-center rounded-xl">
            <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
          </div>
        )}
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
