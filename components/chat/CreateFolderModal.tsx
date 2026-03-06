"use client";

import { useState, useEffect, useMemo } from 'react';
import {
  X,
  FolderPlus,
  Search,
  Hash,
  Users,
  MessageSquare,
  Calendar,
  Megaphone,
  Bot,
  Check,
  Archive,
  Folder,
  FolderOpen,
  Files,
  ClipboardList,
  Briefcase,
  Building2,
  BarChart3,
  NotebookPen,
  Star,
  Flame,
  Lightbulb,
  Target,
} from 'lucide-react';
import { safeJsonParse } from "@/lib/api-client";
import { Chat } from "@/types/chat";
import styles from "./CreateFolderModal.module.css";

interface CreateFolderModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreate: (data: { name: string; chatIds: string[]; icon?: string; color?: string }) => Promise<void>;
  chats: Chat[];
  currentUserId?: string;
}

// Предустановленные иконки для папок
const FOLDER_ICONS = [
  { icon: "folder", label: "Папка" },
  { icon: "folder-open", label: "Открытая папка" },
  { icon: "files", label: "Картотека" },
  { icon: "clipboard", label: "Документы" },
  { icon: "briefcase", label: "Работа" },
  { icon: "building", label: "Офис" },
  { icon: "chart", label: "Отчёты" },
  { icon: "notes", label: "Заметки" },
  { icon: "star", label: "Важное" },
  { icon: "flame", label: "Горящее" },
  { icon: "idea", label: "Идеи" },
  { icon: "target", label: "Цели" },
];

// Цвета для папок
const FOLDER_COLORS = [
  { color: "#3B82F6", label: "Синий" },
  { color: "#10B981", label: "Зелёный" },
  { color: "#F59E0B", label: "Оранжевый" },
  { color: "#EF4444", label: "Красный" },
  { color: "#8B5CF6", label: "Фиолетовый" },
  { color: "#EC4899", label: "Розовый" },
  { color: "#6B7280", label: "Серый" },
];

const COLOR_SWATCH_CLASSES = [
  styles.colorSwatchBlue,
  styles.colorSwatchGreen,
  styles.colorSwatchOrange,
  styles.colorSwatchRed,
  styles.colorSwatchViolet,
  styles.colorSwatchPink,
  styles.colorSwatchGray,
];

export default function CreateFolderModal({
  isOpen,
  onClose,
  onCreate,
  chats,
  currentUserId,
}: CreateFolderModalProps) {
  const [name, setName] = useState('');
  const [selectedIcon, setSelectedIcon] = useState('folder');
  const [selectedColor, setSelectedColor] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedChatIds, setSelectedChatIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

  // Сброс при открытии
  useEffect(() => {
    if (isOpen) {
      setName('');
      setSelectedIcon('folder');
      setSelectedColor(null);
      setSearchTerm('');
      setSelectedChatIds([]);
    }
  }, [isOpen]);

  // Проверка, является ли чат AI-ассистентом
  const isAIChat = (chat: Chat): boolean => {
    // Проверка по названию
    const name = (chat.name || '').toLowerCase();
    if (name.includes('ии-ассистент') || 
        name.includes('ии ассистент') ||
        name.includes('ai помощник') ||
        name.includes('ai-помощник') ||
        name.includes('ai assistant')) {
      return true;
    }
    
    // Проверка по otherUser (для приватных чатов с AI)
    const otherUser = (chat as any).otherUser;
    if (otherUser) {
      const oderId = (otherUser.id || '').toLowerCase();
      if (oderId.includes('ai-assistant') || oderId.includes('ai_assistant') || oderId === 'ai-assistant-bot') {
        return true;
      }
      const fullName = `${otherUser.firstName || ''} ${otherUser.lastName || ''}`.toLowerCase();
      if (fullName.includes('помощник') && (fullName.includes('ai') || fullName.includes('ии'))) {
        return true;
      }
    }
    
    return false;
  };

  // Фильтрация чатов (исключаем архивные и AI)
  const availableChats = useMemo(() => {
    return chats.filter((chat) => {
      // Исключаем архивные
      if ((chat as any).archivedAt) return false;
      // Исключаем AI чат
      if (isAIChat(chat)) return false;
      return true;
    });
  }, [chats]);

  // Поиск по чатам
  const filteredChats = useMemo(() => {
    if (!searchTerm.trim()) return availableChats;
    
    const query = searchTerm.toLowerCase();
    return availableChats.filter((chat) => {
      const chatName = getChatDisplayName(chat);
      return chatName.toLowerCase().includes(query);
    });
  }, [availableChats, searchTerm]);

  // Получение отображаемого имени чата
  function getChatDisplayName(chat: Chat): string {
    if (chat.type === 'PRIVATE') {
      const otherUser = (chat as any).otherUser;
      if (otherUser) {
        return [otherUser.firstName, otherUser.lastName].filter(Boolean).join(' ') || 'Собеседник';
      }
    }
    return chat.name || 'Чат';
  }

  // Получение иконки типа чата
  function getChatIcon(chat: Chat) {
    if (chat.type === 'CHANNEL') return <Megaphone className="w-4 h-4 text-blue-500" />;
    if (chat.type === 'GROUP') {
      if ((chat as any).meetingId) return <Calendar className="w-4 h-4 text-purple-500" />;
      if ((chat as any).ticketId) return <MessageSquare className="w-4 h-4 text-orange-500" />;
      return <Users className="w-4 h-4 text-green-500" />;
    }
    return <MessageSquare className="w-4 h-4 text-gray-500" />;
  }

  // Переключение выбора чата
  const toggleChat = (chatId: string) => {
    setSelectedChatIds((prev) =>
      prev.includes(chatId)
        ? prev.filter((id) => id !== chatId)
        : [...prev, chatId]
    );
  };

  // Отправка формы
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!name.trim()) {
      alert('Введите название папки');
      return;
    }

    if (selectedChatIds.length < 2) {
      alert('Выберите минимум 2 чата для создания папки');
      return;
    }

    setLoading(true);
    try {
      await onCreate({
        name: name.trim(),
        chatIds: selectedChatIds,
        icon: selectedIcon,
        color: selectedColor || undefined,
      });
      handleClose();
    } catch (error) {
      console.error('Failed to create folder:', error);
      alert('Ошибка создания папки');
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setName('');
    setSelectedIcon('folder');
    setSelectedColor(null);
    setSearchTerm('');
    setSelectedChatIds([]);
    onClose();
  };

  if (!isOpen) return null;

  const renderFolderIcon = (icon: string) => {
    switch (icon) {
      case "folder-open":
        return <FolderOpen className="h-5 w-5" />;
      case "files":
        return <Files className="h-5 w-5" />;
      case "clipboard":
        return <ClipboardList className="h-5 w-5" />;
      case "briefcase":
        return <Briefcase className="h-5 w-5" />;
      case "building":
        return <Building2 className="h-5 w-5" />;
      case "chart":
        return <BarChart3 className="h-5 w-5" />;
      case "notes":
        return <NotebookPen className="h-5 w-5" />;
      case "star":
        return <Star className="h-5 w-5" />;
      case "flame":
        return <Flame className="h-5 w-5" />;
      case "idea":
        return <Lightbulb className="h-5 w-5" />;
      case "target":
        return <Target className="h-5 w-5" />;
      default:
        return <Folder className="h-5 w-5" />;
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-900 rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-800">
          <div className="flex items-center gap-3">
            <FolderPlus className="w-5 h-5 text-blue-600" />
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
              Создать папку
            </h2>
          </div>
          <button
            onClick={handleClose}
            className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
            title="Закрыть"
            aria-label="Закрыть"
          >
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        {/* Content */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Folder name */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Название папки *
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Например: Обращения за январь"
              className="w-full px-4 py-2.5 border border-gray-300 dark:border-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-800 dark:text-white text-sm shadow-sm transition-colors"
              required
            />
          </div>

          {/* Icon selector */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Иконка папки
            </label>
            <div className="flex flex-wrap gap-2">
              {FOLDER_ICONS.map(({ icon, label }) => (
                <button
                  key={icon}
                  type="button"
                  onClick={() => setSelectedIcon(icon)}
                  className={`flex h-10 w-10 items-center justify-center rounded-lg transition-all ${
                    selectedIcon === icon
                      ? 'bg-blue-100 dark:bg-blue-900/40 ring-2 ring-blue-500'
                      : 'bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700'
                  }`}
                  title={label}
                  aria-label={`Выбрать иконку: ${label}`}
                >
                  {renderFolderIcon(icon)}
                </button>
              ))}
            </div>
          </div>

          {/* Color selector */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Цвет (необязательно)
            </label>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setSelectedColor(null)}
                className={`w-8 h-8 rounded-full border-2 flex items-center justify-center transition-all ${
                  selectedColor === null
                    ? 'border-blue-500 bg-gray-100 dark:bg-gray-800'
                    : 'border-gray-300 dark:border-gray-600 hover:border-gray-400'
                }`}
                title="Без цвета"
                aria-label="Без цвета"
              >
                {selectedColor === null && <Check className="w-4 h-4 text-blue-500" />}
              </button>
              {FOLDER_COLORS.map(({ color, label }, index) => (
                <button
                  key={color}
                  type="button"
                  onClick={() => setSelectedColor(color)}
                  className={`w-8 h-8 rounded-full border-2 flex items-center justify-center transition-all ${COLOR_SWATCH_CLASSES[index]} ${
                    selectedColor === color
                      ? 'border-gray-800 dark:border-white'
                      : 'border-transparent hover:border-gray-400'
                  }`}
                  title={label}
                  aria-label={`Выбрать цвет: ${label}`}
                >
                  {selectedColor === color && (
                    <Check className="w-4 h-4 text-white" />
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* Selected chats preview */}
          {selectedChatIds.length > 0 && (
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Выбрано чатов: {selectedChatIds.length}
                {selectedChatIds.length < 2 && (
                  <span className="text-red-500 ml-2">(минимум 2)</span>
                )}
              </label>
              <div className="flex flex-wrap gap-2 p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
                {selectedChatIds.map((chatId) => {
                  const chat = chats.find((c) => c.id === chatId);
                  if (!chat) return null;
                  return (
                    <div
                      key={chatId}
                      className="flex items-center gap-2 px-3 py-1.5 bg-white dark:bg-gray-700 rounded-full border border-gray-200 dark:border-gray-600"
                    >
                      {getChatIcon(chat)}
                      <span className="text-sm text-gray-700 dark:text-gray-300 truncate max-w-[150px]">
                        {getChatDisplayName(chat)}
                      </span>
                      <button
                        type="button"
                        onClick={() => toggleChat(chatId)}
                        className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                        title="Удалить из выбора"
                        aria-label="Удалить чат из выбора"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Chat search */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Выберите чаты для папки *
            </label>
            <div className="relative mb-3">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Поиск по названию чата..."
                className="w-full pl-10 pr-4 py-2.5 border border-gray-300 dark:border-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-800 dark:text-white text-sm shadow-sm transition-colors"
              />
            </div>

            {/* Chat list */}
            <div className="border border-gray-200 dark:border-gray-700 rounded-lg max-h-64 overflow-y-auto">
              {filteredChats.length === 0 ? (
                <div className="p-4 text-center text-gray-500">
                  {searchTerm ? 'Чаты не найдены' : 'Нет доступных чатов'}
                </div>
              ) : (
                <div className="divide-y divide-gray-200 dark:divide-gray-700">
                  {filteredChats.map((chat) => {
                    const isSelected = selectedChatIds.includes(chat.id);
                    const displayName = getChatDisplayName(chat);
                    
                    return (
                      <button
                        key={chat.id}
                        type="button"
                        onClick={() => toggleChat(chat.id)}
                        title={isSelected ? `Убрать "${displayName}" из папки` : `Добавить "${displayName}" в папку`}
                        aria-label={isSelected ? `Убрать ${displayName} из папки` : `Добавить ${displayName} в папку`}
                        className={`w-full p-3 flex items-center gap-3 text-left transition-colors ${
                          isSelected
                            ? 'bg-blue-50 dark:bg-blue-900/20'
                            : 'hover:bg-gray-50 dark:hover:bg-gray-800'
                        }`}
                      >
                        {/* Checkbox */}
                        <div
                          className={`w-5 h-5 rounded border flex items-center justify-center flex-shrink-0 transition-colors ${
                            isSelected
                              ? 'bg-blue-600 border-blue-600'
                              : 'border-gray-300 dark:border-gray-600'
                          }`}
                        >
                          {isSelected && <Check className="w-3.5 h-3.5 text-white" />}
                        </div>

                        {/* Chat icon */}
                        <div className="flex-shrink-0">
                          {getChatIcon(chat)}
                        </div>

                        {/* Chat info */}
                        <div className="flex-1 min-w-0">
                          <div className="font-medium text-gray-900 dark:text-white truncate">
                            {displayName}
                          </div>
                          {chat.description && (
                            <div className="text-xs text-gray-500 truncate">
                              {chat.description}
                            </div>
                          )}
                        </div>

                        {/* Chat type badge */}
                        <span className={`text-xs px-2 py-0.5 rounded-full flex-shrink-0 ${
                          chat.type === 'CHANNEL'
                            ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300'
                            : chat.type === 'GROUP'
                            ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300'
                            : 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300'
                        }`}>
                          {chat.type === 'CHANNEL' ? 'Канал' : chat.type === 'GROUP' ? 'Группа' : 'Личный'}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </form>

        {/* Footer */}
        <div className="flex items-center justify-between gap-3 p-6 border-t border-gray-200 dark:border-gray-800">
          <div className="text-sm text-gray-500">
            {selectedChatIds.length < 2 
              ? `Выберите ещё ${2 - selectedChatIds.length} чат(а)`
              : `Выбрано: ${selectedChatIds.length} чатов`
            }
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={handleClose}
              className="px-4 py-2 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
            >
              Отмена
            </button>
            <button
              onClick={handleSubmit}
              disabled={loading || !name.trim() || selectedChatIds.length < 2}
              className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed font-semibold transition-colors"
            >
              {loading ? 'Создание...' : 'Создать папку'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
