"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { alertSuccess, alertError, confirm } from "@/lib/alert";
import ImageUploadWithCrop from "@/components/admin/ImageUploadWithCrop";
import { getUserName } from "@/lib/chat-utils";

interface Chat {
  id: string;
  type: "PRIVATE" | "GROUP";
  name: string | null;
  description: string | null;
  iconUrl: string | null;
  isPublic: boolean;
  lastMessage: string | null;
  lastMessageAt: string | null;
  ticketId?: string | null;
  participant1: {
    id: string;
    firstName: string | null;
    lastName: string | null;
    avatarUrl: string | null;
  } | null;
  participant2: {
    id: string;
    firstName: string | null;
    lastName: string | null;
    avatarUrl: string | null;
  } | null;
  participants: Array<{
    id: string;
    user: {
      id: string;
      firstName: string | null;
      lastName: string | null;
      avatarUrl: string | null;
    };
    role: string;
  }>;
  _count: {
    participants: number;
    messages: number;
  };
}

interface Member {
  id: string;
  firstName: string | null;
  lastName: string | null;
  middleName: string | null;
  avatarUrl: string | null;
}

type ChatTab = "organization" | "personal";

export default function PPOHeadChatsPage() {
  const { data: session } = useSession();
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<ChatTab>("organization");
  const [organizationChats, setOrganizationChats] = useState<Chat[]>([]);
  const [personalChats, setPersonalChats] = useState<Chat[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showCreateGroupModal, setShowCreateGroupModal] = useState(false);
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [selectedChat, setSelectedChat] = useState<Chat | null>(null);
  const [groupName, setGroupName] = useState("");
  const [groupDescription, setGroupDescription] = useState("");
  const [groupIcon, setGroupIcon] = useState<string | null>(null);
  const [isPublic, setIsPublic] = useState(true);
  const [selectedMembers, setSelectedMembers] = useState<string[]>([]);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setIsLoading(true);
      await Promise.all([loadChats(), loadMembers()]);
    } finally {
      setIsLoading(false);
    }
  };

  const loadChats = async () => {
    try {
      // Загружаем все чаты
      const response = await fetch("/api/ppo-head/chats");
      if (response.ok) {
        const data = await response.json();
        const allChats = data.chats || [];
        
        // Разделяем на организационные (с ticketId или группы) и личные
        const orgChats: Chat[] = [];
        const persChats: Chat[] = [];
        
        allChats.forEach((chat: Chat) => {
          if (chat.ticketId || chat.type === "GROUP") {
            orgChats.push(chat);
          } else {
            persChats.push(chat);
          }
        });
        
        setOrganizationChats(orgChats);
        setPersonalChats(persChats);
      }
    } catch (error) {
      console.error("Ошибка загрузки чатов:", error);
    }
  };

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
      await loadChats();
    } catch (error) {
      console.error("Ошибка создания группы:", error);
      alertError(error instanceof Error ? error.message : "Не удалось создать группу");
    } finally {
      setCreating(false);
    }
  };

  const handleInviteToGroup = async () => {
    if (!selectedChat || selectedChat.type !== "GROUP") {
      return;
    }

    if (selectedMembers.length === 0) {
      alertError("Выберите участников для приглашения");
      return;
    }

    try {
      const response = await fetch(`/api/ppo-head/chats/${selectedChat.id}/invite`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          participantIds: selectedMembers,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Ошибка при приглашении участников");
      }

      alertSuccess("Участники успешно приглашены!");
      setShowInviteModal(false);
      setSelectedMembers([]);
      setSelectedChat(null);
      await loadChats();
    } catch (error) {
      console.error("Ошибка приглашения:", error);
      alertError(error instanceof Error ? error.message : "Не удалось пригласить участников");
    }
  };

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
        const error = await response.json();
        throw new Error(error.error || "Ошибка при удалении группы");
      }

      alertSuccess("Группа удалена");
      await loadChats();
    } catch (error) {
      console.error("Ошибка удаления группы:", error);
      alertError(error instanceof Error ? error.message : "Не удалось удалить группу");
    }
  };

  const toggleMemberSelection = (memberId: string) => {
    setSelectedMembers((prev) =>
      prev.includes(memberId)
        ? prev.filter((id) => id !== memberId)
        : [...prev, memberId]
    );
  };

  const getChatName = (chat: Chat) => {
    if (chat.type === "GROUP") {
      return chat.name || "Группа";
    }
    // Для личных чатов определяем собеседника
    if (session?.user?.id === chat.participant1?.id) {
      return getUserName(chat.participant2) || "Пользователь";
    }
    return getUserName(chat.participant1) || "Пользователь";
  };

  const getChatAvatar = (chat: Chat) => {
    if (chat.type === "GROUP" && chat.iconUrl) {
      return chat.iconUrl;
    }
    if (chat.type === "PRIVATE") {
      const otherUser = session?.user?.id === chat.participant1?.id ? chat.participant2 : chat.participant1;
      return otherUser?.avatarUrl || null;
    }
    return null;
  };

  const currentChats = activeTab === "organization" ? organizationChats : personalChats;

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-center">
          <div className="mb-4 inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-blue-500 border-r-transparent"></div>
          <p className="text-gray-600 dark:text-gray-400">Загрузка чатов...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
            Чаты
          </h1>
          <p className="mt-2 text-gray-600 dark:text-gray-400">
            Управление чатами и группами
          </p>
        </div>
        <button
          onClick={() => setShowCreateGroupModal(true)}
          className="rounded-lg bg-blue-600 px-4 py-2 text-white hover:bg-blue-700"
        >
          + Создать группу
        </button>
      </div>

      {/* Табы */}
      <div className="border-b border-gray-200 dark:border-gray-700">
        <nav className="-mb-px flex space-x-8">
          <button
            onClick={() => setActiveTab("organization")}
            className={`whitespace-nowrap border-b-2 py-4 px-1 text-sm font-medium transition-colors ${
              activeTab === "organization"
                ? "border-blue-500 text-blue-600 dark:text-blue-400"
                : "border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300"
            }`}
          >
            Чаты организации
            {organizationChats.length > 0 && (
              <span className="ml-2 rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-800 dark:bg-blue-900/30 dark:text-blue-400">
                {organizationChats.length}
              </span>
            )}
          </button>
          <button
            onClick={() => setActiveTab("personal")}
            className={`whitespace-nowrap border-b-2 py-4 px-1 text-sm font-medium transition-colors ${
              activeTab === "personal"
                ? "border-blue-500 text-blue-600 dark:text-blue-400"
                : "border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300"
            }`}
          >
            Личные
            {personalChats.length > 0 && (
              <span className="ml-2 rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-800 dark:bg-gray-700 dark:text-gray-300">
                {personalChats.length}
              </span>
            )}
          </button>
        </nav>
      </div>

      {/* Содержимое таба */}
      {activeTab === "organization" && (
        <div className="rounded-lg border border-dashed border-blue-300 bg-blue-50/50 p-4 dark:border-blue-800 dark:bg-blue-900/20">
          <div className="flex items-center gap-2 text-sm text-blue-600 dark:text-blue-400">
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span>
              Чаты обращений будут появляться здесь автоматически. Переписка ведётся от имени организации.
            </span>
          </div>
        </div>
      )}

      <div className="grid gap-4">
        {currentChats.length === 0 ? (
          <div className="rounded-lg border-2 border-dashed border-gray-300 bg-white p-12 text-center dark:border-gray-700 dark:bg-gray-800">
            <p className="text-gray-600 dark:text-gray-400">
              {activeTab === "organization" 
                ? "Чатов организации пока нет. Они появятся при создании обращений."
                : "Личных чатов пока нет. Начните переписку с членом профсоюза."}
            </p>
          </div>
        ) : (
          currentChats.map((chat) => (
            <div
              key={chat.id}
              className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-800"
            >
              <div className="flex items-start justify-between">
                <div
                  className="flex-1 cursor-pointer"
                  onClick={() => router.push(`/dashboard/chat?chatId=${chat.id}`)}
                >
                  <div className="flex items-center gap-3">
                    {getChatAvatar(chat) ? (
                      <img
                        src={getChatAvatar(chat)!}
                        alt={getChatName(chat)}
                        className="h-12 w-12 rounded-full object-cover"
                      />
                    ) : (
                      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br from-blue-500 to-blue-600 text-white">
                        {chat.type === "GROUP" ? (
                          <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                          </svg>
                        ) : chat.ticketId ? (
                          <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
                          </svg>
                        ) : (
                          <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                          </svg>
                        )}
                      </div>
                    )}
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                          {getChatName(chat)}
                        </h3>
                        {chat.ticketId && (
                          <span className="inline-flex items-center rounded-full bg-yellow-100 px-2 py-0.5 text-xs font-medium text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400">
                            Обращение
                          </span>
                        )}
                        {chat.type === "GROUP" && (
                          <>
                            {chat.isPublic ? (
                              <span className="inline-flex items-center rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-800 dark:bg-green-900/30 dark:text-green-400">
                                Публичная
                              </span>
                            ) : (
                              <span className="inline-flex items-center rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-800 dark:bg-gray-900/30 dark:text-gray-400">
                                Закрытая
                              </span>
                            )}
                          </>
                        )}
                      </div>
                      {chat.description && (
                        <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
                          {chat.description}
                        </p>
                      )}
                      {chat.type === "GROUP" && (
                        <p className="mt-1 text-xs text-gray-500">
                          {chat._count.participants} участников
                        </p>
                      )}
                      {chat.lastMessage && (
                        <p className="mt-1 text-sm text-gray-500 line-clamp-1">
                          {chat.lastMessage}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
                <div className="flex gap-2 ml-4">
                  {chat.type === "GROUP" && (
                    <>
                      <button
                        onClick={() => {
                          setSelectedChat(chat);
                          setShowInviteModal(true);
                        }}
                        className="rounded-lg bg-green-600 px-3 py-1.5 text-sm text-white hover:bg-green-700"
                        title="Пригласить участников"
                      >
                        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                        </svg>
                      </button>
                      <button
                        onClick={() => handleDeleteGroup(chat.id)}
                        className="rounded-lg bg-red-600 px-3 py-1.5 text-sm text-white hover:bg-red-700"
                        title="Удалить группу"
                      >
                        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    </>
                  )}
                  <button
                    onClick={() => router.push(`/dashboard/chat?chatId=${chat.id}`)}
                    className="rounded-lg bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700"
                  >
                    Открыть
                  </button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Модалка создания группы */}
      {showCreateGroupModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-lg dark:border-gray-700 dark:bg-gray-800 w-full max-w-md max-h-[90vh] overflow-y-auto">
            <h2 className="text-xl font-semibold mb-4">Создать группу</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Название группы *
                </label>
                <input
                  type="text"
                  value={groupName}
                  onChange={(e) => setGroupName(e.target.value)}
                  className="w-full rounded-md border border-gray-300 px-3 py-2 dark:border-gray-600 dark:bg-gray-700"
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
                  className="w-full rounded-md border border-gray-300 px-3 py-2 dark:border-gray-600 dark:bg-gray-700"
                  rows={3}
                  placeholder="Описание группы..."
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Иконка группы
                </label>
                <ImageUploadWithCrop
                  value={groupIcon}
                  onChange={setGroupIcon}
                  label=""
                />
              </div>
              <div className="flex items-center">
                <input
                  type="checkbox"
                  id="isPublic"
                  checked={isPublic}
                  onChange={(e) => setIsPublic(e.target.checked)}
                  className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-2 focus:ring-blue-500 dark:border-gray-600"
                />
                <label htmlFor="isPublic" className="ml-2 text-sm font-medium text-gray-700 dark:text-gray-300">
                  Публичная группа (любой может присоединиться)
                </label>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Участники * (выберите минимум одного)
                </label>
                <div className="max-h-60 overflow-y-auto rounded-md border border-gray-300 p-3 dark:border-gray-600">
                  {members.length === 0 ? (
                    <p className="text-sm text-gray-500">Нет активных членов профсоюза</p>
                  ) : (
                    <div className="space-y-2">
                      {members.map((member) => {
                        const fullName = [member.lastName, member.firstName, member.middleName]
                          .filter(Boolean)
                          .join(" ");
                        return (
                          <label
                            key={member.id}
                            className="flex items-center gap-2 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700 p-2 rounded"
                          >
                            <input
                              type="checkbox"
                              checked={selectedMembers.includes(member.id)}
                              onChange={() => toggleMemberSelection(member.id)}
                              className="rounded"
                            />
                            <span className="text-sm">{fullName}</span>
                          </label>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
              <div className="flex gap-2">
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
                    setIsPublic(true);
                  }}
                  className="flex-1 rounded-lg border border-gray-300 px-4 py-2 hover:bg-gray-50 dark:border-gray-600 dark:hover:bg-gray-700"
                >
                  Отмена
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Модалка приглашения в группу */}
      {showInviteModal && selectedChat && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-lg dark:border-gray-700 dark:bg-gray-800 w-full max-w-md max-h-[90vh] overflow-y-auto">
            <h2 className="text-xl font-semibold mb-4">
              Пригласить в группу "{selectedChat.name}"
            </h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Выберите участников
                </label>
                <div className="max-h-60 overflow-y-auto rounded-md border border-gray-300 p-3 dark:border-gray-600">
                  {members.length === 0 ? (
                    <p className="text-sm text-gray-500">Нет активных членов профсоюза</p>
                  ) : (
                    <div className="space-y-2">
                      {members.map((member) => {
                        const fullName = [member.lastName, member.firstName, member.middleName]
                          .filter(Boolean)
                          .join(" ");
                        const isAlreadyParticipant = selectedChat.participants.some(
                          (p) => p.user.id === member.id
                        );
                        return (
                          <label
                            key={member.id}
                            className={`flex items-center gap-2 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700 p-2 rounded ${
                              isAlreadyParticipant ? "opacity-50" : ""
                            }`}
                          >
                            <input
                              type="checkbox"
                              checked={selectedMembers.includes(member.id)}
                              onChange={() => toggleMemberSelection(member.id)}
                              disabled={isAlreadyParticipant}
                              className="rounded"
                            />
                            <span className="text-sm">
                              {fullName}
                              {isAlreadyParticipant && " (уже в группе)"}
                            </span>
                          </label>
                        );
                      })}
                    </div>
                  )}
                </div>
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
                    setSelectedChat(null);
                  }}
                  className="flex-1 rounded-lg border border-gray-300 px-4 py-2 hover:bg-gray-50 dark:border-gray-600 dark:hover:bg-gray-700"
                >
                  Отмена
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
