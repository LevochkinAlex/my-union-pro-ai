"use client";

import { useState, useEffect } from "react";
import { X, UserPlus, Crown, UserMinus } from "lucide-react";
import { useSession } from "next-auth/react";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import { formatLastSeen } from "@/lib/format-last-seen";
import { normalizeUserAvatar } from "@/lib/api-helpers";
import clsx from "clsx";

interface Participant {
  id: string;
  userId: string;
  role?: string;
  user: {
    id: string;
    firstName: string | null;
    lastName: string | null;
    middleName: string | null;
    avatarUrl: string | null;
    email?: string;
  };
}

interface ParticipantsPanelProps {
  isOpen: boolean;
  onClose: () => void;
  chatId: string;
  currentUserId: string;
  isAdmin: boolean;
  onAddParticipant?: () => void;
  onRemoveParticipant?: (userId: string) => void;
  onChangeRole?: (userId: string, role: 'admin' | 'member') => void;
}

export default function ParticipantsPanel({
  isOpen,
  onClose,
  chatId,
  currentUserId,
  isAdmin,
  onAddParticipant,
  onRemoveParticipant,
  onChangeRole,
}: ParticipantsPanelProps) {
  const { data: session } = useSession();
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [loading, setLoading] = useState(true);

  // Получаем ID всех участников для проверки онлайн статуса
  const participantIds = participants.map(p => p.userId);
  const { isOnline, getLastSeenAt } = useOnlineStatus(participantIds);

  useEffect(() => {
    if (isOpen && chatId) {
      loadParticipants();
    }
  }, [isOpen, chatId]);

  const loadParticipants = async () => {
    try {
      setLoading(true);
      const response = await fetch(`/api/chat/${chatId}/participants`);
      if (!response.ok) {
        throw new Error("Не удалось загрузить участников");
      }
      const data = await response.json();
      setParticipants(data.participants || []);
    } catch (error) {
      console.error("Failed to load participants:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleRemoveParticipant = async (userId: string) => {
    if (!onRemoveParticipant) return;
    
    try {
      const response = await fetch(`/api/chat/${chatId}/participants/${userId}`, {
        method: "DELETE",
      });
      
      if (response.ok) {
        setParticipants(prev => prev.filter(p => p.userId !== userId));
        onRemoveParticipant(userId);
      } else {
        const data = await response.json();
        alert(data.error || "Не удалось удалить участника");
      }
    } catch (error) {
      console.error("Failed to remove participant:", error);
      alert("Ошибка при удалении участника");
    }
  };

  const handleChangeRole = async (userId: string, newRole: 'admin' | 'member') => {
    if (!onChangeRole) return;
    
    try {
      const response = await fetch(`/api/chat/${chatId}/participants/${userId}/role`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: newRole }),
      });
      
      if (response.ok) {
        setParticipants(prev => prev.map(p => 
          p.userId === userId ? { ...p, role: newRole } : p
        ));
        onChangeRole(userId, newRole);
      } else {
        const data = await response.json();
        alert(data.error || "Не удалось изменить роль");
      }
    } catch (error) {
      console.error("Failed to change role:", error);
      alert("Ошибка при изменении роли");
    }
  };

  const getUserDisplayName = (user: Participant['user']): string => {
    const parts = [user.lastName, user.firstName, user.middleName].filter(Boolean);
    return parts.length > 0 ? parts.join(" ") : user.email || "Пользователь";
  };

  if (!isOpen) return null;

  return (
    <>
      {/* Затемнение фона - для всех устройств */}
      <div 
        className="fixed inset-0 bg-black/50 dark:bg-black/70 z-40 transition-opacity duration-300"
        onClick={onClose}
      />
      
      {/* Drawer */}
      <div className="fixed right-0 top-0 bottom-0 w-full sm:w-96 lg:w-[28rem] bg-white dark:bg-gray-900 shadow-2xl z-50 flex flex-col transform transition-transform duration-300 ease-out">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
            Участники ({participants.length})
          </h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg"
          >
            <X className="w-5 h-5 text-gray-600 dark:text-gray-300" />
          </button>
        </div>

        {/* Add participant button */}
        {isAdmin && onAddParticipant && (
          <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700">
            <button
              onClick={onAddParticipant}
              className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              <UserPlus className="w-4 h-4" />
              <span>Добавить участника</span>
            </button>
          </div>
        )}

        {/* Participants list */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : participants.length === 0 ? (
            <div className="text-center py-8 text-gray-500 dark:text-gray-400">
              Нет участников
            </div>
          ) : (
            <div className="p-2 space-y-1">
              {participants.map((participant) => {
                const normalized = normalizeUserAvatar(participant.user);
                const displayName = getUserDisplayName(participant.user);
                const isUserOnline = isOnline(participant.userId);
                const lastSeenAt = getLastSeenAt(participant.userId);
                const isCurrentUser = participant.userId === currentUserId;
                const isParticipantAdmin = participant.role === 'admin';

                return (
                  <div
                    key={participant.id}
                    className="flex items-center gap-3 p-3 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors group"
                  >
                    {/* Avatar */}
                    <div className="relative flex-shrink-0">
                      <img
                        src={normalized.avatarUrl || "/default-avatar.png"}
                        alt={displayName}
                        className="w-10 h-10 rounded-full object-cover"
                      />
                      {isUserOnline && (
                        <div className="absolute bottom-0 right-0 w-3 h-3 bg-green-500 border-2 border-white dark:border-gray-900 rounded-full" />
                      )}
                    </div>

                    {/* User info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="font-medium text-gray-900 dark:text-white truncate">
                          {displayName}
                        </p>
                        {isParticipantAdmin && (
                          <Crown className="w-4 h-4 text-yellow-500 flex-shrink-0" />
                        )}
                        {isCurrentUser && (
                          <span className="text-xs text-gray-500 dark:text-gray-400">
                            (Вы)
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-gray-500 dark:text-gray-400">
                        {isUserOnline 
                          ? "Онлайн" 
                          : formatLastSeen(lastSeenAt, false)}
                      </p>
                    </div>

                    {/* Actions */}
                    {isAdmin && !isCurrentUser && (
                      <div className="flex items-center gap-2">
                        {onChangeRole && (
                          <div className="relative">
                            <button
                              onClick={() => handleChangeRole(
                                participant.userId, 
                                isParticipantAdmin ? 'member' : 'admin'
                              )}
                              className={clsx(
                                "p-2 rounded-lg transition-colors flex items-center justify-center relative group/role",
                                isParticipantAdmin
                                  ? "bg-yellow-100 dark:bg-yellow-900/20 text-yellow-700 dark:text-yellow-400 hover:bg-yellow-200 dark:hover:bg-yellow-900/30"
                                  : "bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700"
                              )}
                            >
                              <Crown className={clsx(
                                "w-4 h-4",
                                isParticipantAdmin && "text-yellow-500"
                              )} />
                              {/* Tooltip - сверху, смещен вправо, только при hover на эту кнопку */}
                              <div className="absolute right-0 bottom-full mb-2 px-2 py-1 text-xs font-medium text-white bg-gray-900 dark:bg-gray-700 rounded whitespace-nowrap invisible group-hover/role:visible pointer-events-none transition-all duration-200 z-[100]">
                                {isParticipantAdmin ? "Убрать админа" : "Сделать админом"}
                                <div className="absolute right-3 top-full w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-gray-900 dark:border-t-gray-700"></div>
                              </div>
                            </button>
                          </div>
                        )}
                        {onRemoveParticipant && (
                          <div className="relative">
                            <button
                              onClick={() => {
                                if (confirm(`Удалить ${displayName} из чата?`)) {
                                  handleRemoveParticipant(participant.userId);
                                }
                              }}
                              className="p-2 rounded-lg bg-red-100 dark:bg-red-900/20 text-red-600 dark:text-red-400 hover:bg-red-200 dark:hover:bg-red-900/30 transition-colors flex items-center justify-center relative group/remove"
                            >
                              <UserMinus className="w-4 h-4" />
                              {/* Tooltip - сверху, смещен вправо, только при hover на эту кнопку */}
                              <div className="absolute right-0 bottom-full mb-2 px-2 py-1 text-xs font-medium text-white bg-gray-900 dark:bg-gray-700 rounded whitespace-nowrap invisible group-hover/remove:visible pointer-events-none transition-all duration-200 z-[100]">
                                Удалить
                                <div className="absolute right-3 top-full w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-gray-900 dark:border-t-gray-700"></div>
                              </div>
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
