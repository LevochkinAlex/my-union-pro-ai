"use client";

import { useState, useEffect } from 'react';
import { X, Search, UserPlus, Users, Settings, Crown } from 'lucide-react';
import GroupIconUpload from './GroupIconUpload';

interface User {
  id: string;
  firstName?: string;
  lastName?: string;
  avatarUrl?: string;
  email?: string;
  position?: string;
}

interface GroupChatModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreate: (data: { name: string; description?: string; participantIds: string[]; iconUrl?: string | null; type?: 'GROUP' | 'CHANNEL' }) => Promise<void>;
  onUpdate?: (data: { name: string; description?: string; participantIds: string[]; iconUrl?: string | null; adminId?: string }) => Promise<void>;
  mode: 'create' | 'edit';
  groupId?: string;
  currentUserId?: string | null;
  initialData?: {
    name: string;
    description?: string;
    iconUrl?: string | null;
    participants: Array<User & { isAdmin?: boolean }>;
    adminId?: string;
  };
}

export default function GroupChatModal({
  isOpen,
  onClose,
  onCreate,
  onUpdate,
  mode,
  groupId,
  currentUserId,
  initialData,
}: GroupChatModalProps) {
  const [name, setName] = useState(initialData?.name || '');
  const [description, setDescription] = useState(initialData?.description || '');
  const [iconUrl, setIconUrl] = useState<string | null>(initialData?.iconUrl || null);
  const [adminId, setAdminId] = useState<string | undefined>(initialData?.adminId);
  const [chatType, setChatType] = useState<'GROUP' | 'CHANNEL'>('GROUP');
  const [searchTerm, setSearchTerm] = useState('');
  const [availableUsers, setAvailableUsers] = useState<User[]>([]);
  const [selectedUsers, setSelectedUsers] = useState<Array<User & { isAdmin?: boolean }>>(initialData?.participants || []);
  const [loading, setLoading] = useState(false);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    if (isOpen) {
      if (mode === 'create') {
        loadAvailableUsers();
      } else if (initialData) {
        setName(initialData.name || '');
        setDescription(initialData.description || '');
        setIconUrl(initialData.iconUrl || null);
        setAdminId(initialData.adminId);
        setSelectedUsers(initialData.participants || []);
      }
    }
  }, [isOpen, mode, initialData]);

  const loadAvailableUsers = async () => {
    try {
      setSearching(true);
      const response = await fetch('/api/users/search?status=approved&limit=100');
      if (response.ok) {
        const data = await response.json();
        setAvailableUsers(data.users || []);
      }
    } catch (error) {
      console.error('Failed to load users:', error);
    } finally {
      setSearching(false);
    }
  };

  const handleSearch = async (term: string) => {
    setSearchTerm(term);
    if (term.trim().length < 2) {
      loadAvailableUsers();
      return;
    }

    try {
      setSearching(true);
      const response = await fetch(`/api/users/search?q=${encodeURIComponent(term)}&status=approved&limit=50`);
      if (response.ok) {
        const data = await response.json();
        setAvailableUsers(data.users || []);
      }
    } catch (error) {
      console.error('Search failed:', error);
    } finally {
      setSearching(false);
    }
  };

  const toggleUser = (user: User) => {
    if (selectedUsers.find(u => u.id === user.id)) {
      setSelectedUsers(selectedUsers.filter(u => u.id !== user.id));
    } else {
      setSelectedUsers([...selectedUsers, user]);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || selectedUsers.length === 0) {
      alert('Заполните название и выберите участников');
      return;
    }

    setLoading(true);
    try {
      const data = {
        name: name.trim(),
        description: description.trim() || undefined,
        participantIds: selectedUsers.map(u => u.id),
        iconUrl: iconUrl || undefined,
        ...(mode === 'create' ? { type: chatType } : {}),
        ...(mode === 'edit' && adminId ? { adminId } : {}),
      };

      if (mode === 'edit' && onUpdate) {
        await onUpdate(data);
        handleClose();
      } else {
        await onCreate(data);
        handleClose();
      }
    } catch (error) {
      console.error(`Failed to ${mode === 'edit' ? 'update' : 'create'} group:`, error);
      alert(`Ошибка ${mode === 'edit' ? 'обновления' : 'создания'} группы`);
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setName('');
    setDescription('');
    setIconUrl(null);
    setAdminId(undefined);
    setChatType('GROUP');
    setSelectedUsers([]);
    setSearchTerm('');
    onClose();
  };

  const isCurrentUserAdmin = mode === 'edit' && currentUserId && adminId === currentUserId;

  const getUserName = (user: User) => {
    if (user.firstName || user.lastName) {
      return [user.firstName, user.lastName].filter(Boolean).join(' ') || 'Пользователь';
    }
    return user.email || 'Пользователь';
  };

  const filteredUsers = availableUsers.filter(user => 
    !selectedUsers.find(selected => selected.id === user.id)
  );

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white dark:bg-gray-900 rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-800">
          <div className="flex items-center gap-3">
            {mode === 'create' ? (
              <>
                <UserPlus className="w-5 h-5 text-blue-600" />
                <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
                  {mode === 'create' && chatType === 'CHANNEL' ? 'Создать канал' : 'Создать групповой чат'}
                </h2>
              </>
            ) : (
              <>
                <Settings className="w-5 h-5 text-blue-600" />
                <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
                  Настройки группы
                </h2>
              </>
            )}
          </div>
          <button
            onClick={handleClose}
            className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded"
          >
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        {/* Content */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Group icon */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Аватарка группы
            </label>
            <GroupIconUpload value={iconUrl} onChange={setIconUrl} />
          </div>

          {/* Group name */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Название группы *
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Например: Команда разработки"
              className="w-full px-4 py-2 border border-gray-300 dark:border-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-800 dark:text-white"
              required
            />
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Описание (необязательно)
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="О чем эта группа?"
              rows={3}
              className="w-full px-4 py-2 border border-gray-300 dark:border-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-800 dark:text-white resize-none"
            />
          </div>

          {/* Chat type (only for create mode) */}
          {mode === 'create' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Тип чата
              </label>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setChatType('GROUP')}
                  className={`
                    p-4 border-2 rounded-lg text-left transition-all
                    ${chatType === 'GROUP'
                      ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                      : 'border-gray-300 dark:border-gray-700 hover:border-gray-400 dark:hover:border-gray-600'
                    }
                  `}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <Users className="w-5 h-5 text-blue-600" />
                    <span className="font-semibold text-gray-900 dark:text-white">Группа</span>
                  </div>
                  <p className="text-xs text-gray-600 dark:text-gray-400">
                    Все участники могут отправлять сообщения и создавать треды
                  </p>
                </button>
                <button
                  type="button"
                  onClick={() => setChatType('CHANNEL')}
                  className={`
                    p-4 border-2 rounded-lg text-left transition-all
                    ${chatType === 'CHANNEL'
                      ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                      : 'border-gray-300 dark:border-gray-700 hover:border-gray-400 dark:hover:border-gray-600'
                    }
                  `}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <Crown className="w-5 h-5 text-blue-600" />
                    <span className="font-semibold text-gray-900 dark:text-white">Канал</span>
                  </div>
                  <p className="text-xs text-gray-600 dark:text-gray-400">
                    Только председатель создает посты, участники комментируют в тредах
                  </p>
                </button>
              </div>
            </div>
          )}

          {/* Selected users */}
          {selectedUsers.length > 0 && (
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Выбранные участники ({selectedUsers.length})
                {mode === 'edit' && isCurrentUserAdmin && (
                  <span className="text-xs text-gray-500 ml-2">(Кликните на корону чтобы назначить админа)</span>
                )}
              </label>
              <div className="flex flex-wrap gap-2 p-3 bg-gray-50 dark:bg-gray-800 rounded-lg min-h-[60px]">
                {selectedUsers.map((user) => {
                  const isAdmin = mode === 'edit' && adminId === user.id;
                  return (
                    <div
                      key={user.id}
                      className={`flex items-center gap-2 px-3 py-1 rounded-full border ${
                        isAdmin
                          ? 'bg-yellow-50 dark:bg-yellow-900/20 border-yellow-300 dark:border-yellow-700'
                          : 'bg-white dark:bg-gray-700 border-gray-200 dark:border-gray-600'
                      }`}
                    >
                      {user.avatarUrl ? (
                        <img
                          src={user.avatarUrl}
                          alt={getUserName(user)}
                          className="w-5 h-5 rounded-full"
                        />
                      ) : (
                        <div className="w-5 h-5 rounded-full bg-gray-300 dark:bg-gray-600 flex items-center justify-center text-xs">
                          {getUserName(user)[0]?.toUpperCase()}
                        </div>
                      )}
                      <span className="text-sm text-gray-700 dark:text-gray-300">
                        {getUserName(user)}
                      </span>
                      {isAdmin && (
                        <Crown className="w-4 h-4 text-yellow-600 dark:text-yellow-400" />
                      )}
                      {mode === 'edit' && isCurrentUserAdmin && !isAdmin && (
                        <button
                          type="button"
                          onClick={() => setAdminId(user.id)}
                          className="p-0.5 hover:bg-yellow-100 dark:hover:bg-yellow-900/30 rounded"
                          title="Назначить админом"
                        >
                          <Crown className="w-3.5 h-3.5 text-gray-400 hover:text-yellow-600" />
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => {
                          if (mode === 'edit' && isAdmin && isCurrentUserAdmin) {
                            if (confirm('Вы не можете удалить текущего админа. Сначала назначьте другого админа.')) {
                              return;
                            }
                          }
                          toggleUser(user);
                        }}
                        className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* User search */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Добавить участников *
            </label>
            <div className="relative mb-3">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => handleSearch(e.target.value)}
                placeholder="Поиск по имени или email..."
                className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-800 dark:text-white"
              />
            </div>

            {/* User list */}
            <div className="border border-gray-200 dark:border-gray-700 rounded-lg max-h-64 overflow-y-auto">
              {searching ? (
                <div className="p-4 text-center text-gray-500">Поиск...</div>
              ) : filteredUsers.length === 0 ? (
                <div className="p-4 text-center text-gray-500">
                  {searchTerm ? 'Пользователи не найдены' : 'Начните поиск'}
                </div>
              ) : (
                <div className="divide-y divide-gray-200 dark:divide-gray-700">
                  {filteredUsers.map((user) => (
                    <button
                      key={user.id}
                      type="button"
                      onClick={() => toggleUser(user)}
                      className="w-full p-3 hover:bg-gray-50 dark:hover:bg-gray-800 flex items-center gap-3 text-left"
                    >
                      {user.avatarUrl ? (
                        <img
                          src={user.avatarUrl}
                          alt={getUserName(user)}
                          className="w-10 h-10 rounded-full"
                        />
                      ) : (
                        <div className="w-10 h-10 rounded-full bg-gray-300 dark:bg-gray-700 flex items-center justify-center">
                          {getUserName(user)[0]?.toUpperCase()}
                        </div>
                      )}
                      <div className="flex-1">
                        <div className="font-medium text-gray-900 dark:text-white">
                          {getUserName(user)}
                        </div>
                        {user.position && (
                          <div className="text-sm text-gray-500">{user.position}</div>
                        )}
                        {user.email && (
                          <div className="text-xs text-gray-400">{user.email}</div>
                        )}
                      </div>
                      {selectedUsers.find(u => u.id === user.id) && (
                        <div className="w-5 h-5 rounded-full bg-blue-600 flex items-center justify-center">
                          <span className="text-white text-xs">✓</span>
                        </div>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </form>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 p-6 border-t border-gray-200 dark:border-gray-800">
          <button
            type="button"
            onClick={handleClose}
            className="px-4 py-2 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg"
          >
            Отмена
          </button>
          <button
            type="submit"
            disabled={loading || !name.trim() || selectedUsers.length === 0}
            className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed font-semibold"
          >
            {loading 
              ? (mode === 'edit' ? 'Сохранение...' : 'Создание...') 
              : (mode === 'create' ? 'Создать группу' : 'Сохранить изменения')
            }
          </button>
        </div>
      </div>
    </div>
  );
}
