"use client";

import { useState, useEffect, useRef } from 'react';
import { X, Search, UserPlus, Check } from 'lucide-react';
import { safeJsonParse } from "@/lib/api-client";
import { normalizeUserAvatar } from "@/lib/api-helpers";

interface User {
  id: string;
  firstName?: string | null;
  lastName?: string | null;
  middleName?: string | null;
  avatarUrl?: string | null;
  email?: string;
}

interface AddParticipantModalProps {
  isOpen: boolean;
  onClose: () => void;
  chatId: string;
  currentParticipantIds: string[];
  onAdd: (userIds: string[]) => Promise<void>;
}

export default function AddParticipantModal({
  isOpen,
  onClose,
  chatId,
  currentParticipantIds,
  onAdd,
}: AddParticipantModalProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [availableUsers, setAvailableUsers] = useState<User[]>([]);
  const [selectedUsers, setSelectedUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(false);
  const [searching, setSearching] = useState(false);
  const [adding, setAdding] = useState(false);
  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (isOpen) {
      loadAvailableUsers();
      setSearchTerm('');
      setSelectedUsers([]);
    }
  }, [isOpen]);

  const loadAvailableUsers = async () => {
    try {
      setSearching(true);
      const response = await fetch('/api/users/search?status=approved&limit=100&context=chat');
      if (response.ok) {
        const data = await safeJsonParse(response);
        // Исключаем уже добавленных участников
        const users = (data?.users || []).filter((u: User) => !currentParticipantIds.includes(u.id));
        setAvailableUsers(users.map((u: User) => normalizeUserAvatar(u)));
      }
    } catch (error) {
      console.error('Failed to load users:', error);
    } finally {
      setSearching(false);
    }
  };

  const handleSearch = async (term: string) => {
    setSearchTerm(term);
    
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }

    if (term.trim().length < 2) {
      loadAvailableUsers();
      return;
    }

    searchTimeoutRef.current = setTimeout(async () => {
      try {
        setSearching(true);
        const response = await fetch(`/api/users/search?q=${encodeURIComponent(term)}&status=approved&limit=50&context=chat`);
        if (response.ok) {
          const data = await safeJsonParse(response);
          // Исключаем уже добавленных участников
          const users = (data?.users || []).filter((u: User) => !currentParticipantIds.includes(u.id));
          setAvailableUsers(users.map((u: User) => normalizeUserAvatar(u)));
        }
      } catch (error) {
        console.error('Search failed:', error);
      } finally {
        setSearching(false);
      }
    }, 300);
  };

  const toggleUser = (user: User) => {
    if (selectedUsers.find(u => u.id === user.id)) {
      setSelectedUsers(selectedUsers.filter(u => u.id !== user.id));
    } else {
      setSelectedUsers([...selectedUsers, user]);
    }
  };

  const handleAdd = async () => {
    if (selectedUsers.length === 0) {
      return;
    }

    setAdding(true);
    try {
      await onAdd(selectedUsers.map(u => u.id));
      onClose();
    } catch (error) {
      console.error('Failed to add participants:', error);
    } finally {
      setAdding(false);
    }
  };

  if (!isOpen) return null;

  const displayName = (user: User) => {
    const parts = [user.firstName, user.lastName, user.middleName].filter(Boolean);
    return parts.length > 0 ? parts.join(' ') : user.email || 'Пользователь';
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 dark:bg-black/70">
      <div className="bg-white dark:bg-gray-900 rounded-xl shadow-2xl w-full max-w-md mx-4 max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
            Добавить участников
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="p-1 hover:bg-gray-100 dark:hover:bg-gray-800 rounded transition-colors"
            aria-label="Закрыть"
          >
            <X className="w-5 h-5 text-gray-600 dark:text-gray-400" />
          </button>
        </div>

        {/* Search */}
        <div className="p-4 border-b border-gray-200 dark:border-gray-700">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => handleSearch(e.target.value)}
              placeholder="Поиск пользователей..."
              className="w-full pl-10 pr-4 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors text-sm shadow-sm"
            />
          </div>
        </div>

        {/* Selected users */}
        {selectedUsers.length > 0 && (
          <div className="px-4 py-2 border-b border-gray-200 dark:border-gray-700">
            <div className="flex flex-wrap gap-2">
              {selectedUsers.map(user => (
                <div
                  key={user.id}
                  className="flex items-center gap-2 px-3 py-1 bg-blue-100 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400 rounded-full text-sm"
                >
                  <span>{displayName(user)}</span>
                  <button
                    type="button"
                    onClick={() => toggleUser(user)}
                    className="hover:bg-blue-200 dark:hover:bg-blue-900/40 rounded-full p-0.5"
                    aria-label={`Убрать ${displayName(user)} из выбранных`}
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Users list */}
        <div className="flex-1 overflow-y-auto p-4">
          {searching ? (
            <div className="flex items-center justify-center py-8">
              <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : availableUsers.length === 0 ? (
            <div className="text-center py-8 text-gray-500 dark:text-gray-400">
              {searchTerm ? 'Пользователи не найдены' : 'Начните поиск пользователей'}
            </div>
          ) : (
            <div className="space-y-2">
              {availableUsers.map(user => {
                const isSelected = selectedUsers.find(u => u.id === user.id);
                return (
                  <button
                    key={user.id}
                    onClick={() => toggleUser(user)}
                    className={`w-full flex items-center gap-3 p-3 rounded-lg transition-colors ${
                      isSelected
                        ? 'bg-blue-50 dark:bg-blue-900/20 border-2 border-blue-500'
                        : 'hover:bg-gray-50 dark:hover:bg-gray-800 border-2 border-transparent'
                    }`}
                  >
                    <img
                      src={user.avatarUrl || '/default-avatar.png'}
                      alt={displayName(user)}
                      className="w-10 h-10 rounded-full"
                    />
                    <div className="flex-1 text-left">
                      <p className="font-medium text-gray-900 dark:text-white">
                        {displayName(user)}
                      </p>
                      {user.email && (
                        <p className="text-sm text-gray-500 dark:text-gray-400">
                          {user.email}
                        </p>
                      )}
                    </div>
                    {isSelected && (
                      <Check className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-gray-200 dark:border-gray-700 flex items-center justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
          >
            Отмена
          </button>
          <button
            onClick={handleAdd}
            disabled={selectedUsers.length === 0 || adding}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {adding ? (
              <>
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                <span>Добавление...</span>
              </>
            ) : (
              <>
                <UserPlus className="w-4 h-4" />
                <span>Добавить ({selectedUsers.length})</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
