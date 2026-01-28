"use client";

import { useEffect, useRef, useState, useCallback, useMemo, memo } from "react";
import { normalizeUserAvatar } from "@/lib/api-helpers";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import AIChatWelcome from "./AIChatWelcome";
import AppealMessageCard from "./AppealMessageCard";
import {
  MoreHorizontal,
  Reply,
  Edit2,
  Trash2,
  Forward,
  MessageSquare,
  ChevronDown,
  Copy,
  Check,
  CheckCheck,
  AlertCircle,
  UserPlus,
  Settings,
  FileText,
  Download,
  ExternalLink,
  Smile,
  Image as ImageIcon,
  Heart,
  MessageCircle,
  Eye,
} from "lucide-react";
import ChannelComments from "./ChannelComments";
import EmojiPicker from "./EmojiPicker";
import clsx from "clsx";

// ============================================================================
// ТИПЫ
// ============================================================================

export interface MessageSender {
  id: string;
  firstName?: string | null;
  lastName?: string | null;
  middleName?: string | null;
  avatarUrl?: string | null;
  jobTitle?: string | null;
  profession?: string | null;
}

export interface MessageReply {
  id: string;
  content: string;
  sender: MessageSender;
}

export interface MessageAttachment {
  id: string;
  type: string;
  url?: string;
  name?: string;
  fileName?: string;
  filePath?: string;
  size?: number;
  fileSize?: number;
  mimeType?: string | null;
  thumbnailUrl?: string;
  width?: number;
  height?: number;
  originalName?: string;
  blurPlaceholder?: string; // Base64 blur placeholder для ленивой загрузки
  isOld?: boolean; // Флаг для старых сообщений (для блюра)
}

export interface MessageReactions {
  [emoji: string]: {
    count?: number;
    userIds: string[];
    users?: Array<{
      id: string;
      avatarUrl: string | null;
      name: string;
    }>;
  };
}

export interface Message {
  id: string;
  senderId: string;
  sender: MessageSender;
  content: string;
  messageType: string;
  createdAt: Date;
  editedAt?: Date | null;
  deletedAt?: string | null;
  replyTo?: MessageReply | null;
  replyToId?: string | null;
  reactions?: MessageReactions | null;
  attachments?: MessageAttachment[];
  threadRepliesCount?: number;
  threadLastReplyAt?: Date | null;
  isActivity?: boolean;
  activityType?: string;
  activityData?: any;
  isRead?: boolean; // Прочитано ли сообщение другими участниками (для своих сообщений)
  post?: {
    id: string;
    title: string;
    content: string;
    coverImage: string | null;
    polls: Array<{
      id: string;
      question: string;
      options: Array<{
        id: string;
        text: string;
        voteCount?: number;
        percentage?: number;
      }>;
      totalVotes: number;
      userVote: string | null;
      isClosed: boolean;
    }>;
    _count: {
      likes: number;
      comments: number;
    };
    isLiked?: boolean;
  } | null;
}

export interface SlackStyleMessagesProps {
  messages: Message[];
  currentUserId: string;
  typingUsers: Set<string>;
  isTicketChat?: boolean;
  isGroupChat?: boolean; // Для определения типа чата (групповой или приватный)
  isAIChat?: boolean; // Для определения ИИ чата
  ticketId?: string; // ID обращения для отображения кнопки закрытия
  onReply?: (message: Message) => void;
  onStartThread?: (message: Message) => void;
  onEdit?: (message: Message) => void;
  onDelete?: (messageId: string) => void;
  onReaction?: (messageId: string, emoji: string) => void;
  onOpenThread?: (message: Message) => void;
  onForward?: (message: Message) => void;
  onImageClick?: (url: string, name?: string) => void;
  onPollVote?: (pollId: string, optionId: string) => void;
  onQuestionClick?: (question: string) => void; // Для обработки клика на вопрос из приветствия
  chatId?: string;
}

// ============================================================================
// УТИЛИТЫ
// ============================================================================

function getSenderName(sender: MessageSender): string {
  if (sender.firstName || sender.lastName) {
    return [sender.firstName, sender.lastName].filter(Boolean).join(" ");
  }
  return "Пользователь";
}

function getSenderInitials(sender: MessageSender): string {
  const name = getSenderName(sender);
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

function formatMessageTime(date: Date): string {
  return date.toLocaleTimeString("ru-RU", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatMessageDate(date: Date): string {
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  if (date.toDateString() === today.toDateString()) {
    return "Сегодня";
  }
  if (date.toDateString() === yesterday.toDateString()) {
    return "Вчера";
  }
  return date.toLocaleDateString("ru-RU", {
    day: "numeric",
    month: "long",
    year: date.getFullYear() !== today.getFullYear() ? "numeric" : undefined,
  });
}

function shouldShowDateSeparator(current: Message, previous?: Message): boolean {
  if (!previous) return true;
  const currentDate = new Date(current.createdAt).toDateString();
  const previousDate = new Date(previous.createdAt).toDateString();
  return currentDate !== previousDate;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return Math.round(bytes / 1024) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

/**
 * Hook для безопасного преобразования URL в CDN URL после гидратации
 * Предотвращает hydration mismatch между сервером и клиентом
 */
function useCDNUrl(url: string | null | undefined): string {
  // На сервере и при первой гидратации используем оригинальный URL
  const [cdnUrl, setCdnUrl] = useState<string>(url || '');

  useEffect(() => {
    if (!url) {
      setCdnUrl('');
      return;
    }

    // Если это уже полный URL, используем как есть
    if (url.startsWith('http://') || url.startsWith('https://') || url.startsWith('data:')) {
      setCdnUrl(url);
      return;
    }

    // Преобразуем в CDN URL только на клиенте после гидратации
    try {
      const { getFileUrlWithCDN } = require('@/lib/cdn');
      const cdnUrl = getFileUrlWithCDN(url, true);
      setCdnUrl(cdnUrl);
    } catch (error) {
      // В случае ошибки используем оригинальный URL
      console.warn('[useCDNUrl] Failed to get CDN URL, using original:', error);
      setCdnUrl(url);
    }
  }, [url]);

  return cdnUrl;
}

function getAttachmentUrl(att: MessageAttachment): string {
  const url = att.url || att.filePath || '';
  if (!url) return '';
  
  // Если это уже полный URL (CDN или внешний), возвращаем как есть
  if (url.startsWith('http://') || url.startsWith('https://') || url.startsWith('data:')) {
    return url;
  }
  
  // ВАЖНО: Для избежания hydration mismatch всегда возвращаем оригинальный URL
  // CDN трансформация будет применена на клиенте через useCDNUrl hook
  // Это гарантирует, что сервер и клиент рендерят одинаковые значения
  return url;
}

function getAttachmentName(att: MessageAttachment): string {
  return att.name || att.fileName || att.originalName || 'Файл';
}

function getAttachmentSize(att: MessageAttachment): number {
  return att.size || att.fileSize || 0;
}

// ============================================================================
// КОНТЕКСТНОЕ МЕНЮ
// ============================================================================

interface ContextMenuProps {
  x: number;
  y: number;
  message: Message;
  isOwn: boolean;
  isGroupChat?: boolean;
  onClose: () => void;
  onReply?: () => void;
  onStartThread?: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
  onForward?: () => void;
  onCopy?: () => void;
  onReaction?: (emoji: string) => void;
}

function ContextMenu({
  x,
  y,
  message,
  isOwn,
  isGroupChat = false,
  onClose,
  onReply,
  onStartThread,
  onEdit,
  onDelete,
  onForward,
  onCopy,
  onReaction,
}: ContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [onClose]);

  // Корректировка позиции меню чтобы не выходило за границы экрана
  const adjustedX = Math.min(x, window.innerWidth - 220);
  const adjustedY = Math.min(y, window.innerHeight - 350);

  const quickReactions = ["👍", "❤️", "😂", "😮", "😢", "🎉", "👏", "🔥"];

  return (
    <div
      ref={menuRef}
      className="fixed z-[100] bg-white dark:bg-gray-800 rounded-xl shadow-2xl border border-gray-200 dark:border-gray-700 py-2 min-w-[200px] animate-in fade-in zoom-in-95 duration-100"
      style={{ left: adjustedX, top: adjustedY }}
    >
      {/* Quick reactions */}
      <div className="px-2 pb-2 border-b border-gray-100 dark:border-gray-700">
        <div className="flex items-center gap-1">
          {quickReactions.map((emoji) => (
            <button
              key={emoji}
              onClick={() => {
                onReaction?.(emoji);
                onClose();
              }}
              className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg text-lg transition-transform hover:scale-110"
            >
              {emoji}
            </button>
          ))}
          <div className="relative">
            <button
              onClick={() => setShowEmojiPicker(!showEmojiPicker)}
              className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"
            >
              <Smile className="w-5 h-5 text-gray-500" />
            </button>
            {showEmojiPicker && (
              <div className="absolute left-0 bottom-full mb-2">
                <EmojiPicker
                  onEmojiSelect={(emoji) => {
                    onReaction?.(emoji);
                    onClose();
                  }}
                  showButton={false}
                  isOpen={true}
                  onOpenChange={(open) => !open && setShowEmojiPicker(false)}
                />
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Menu items */}
      <div className="py-1">
        {/* Скрываем "Ответить" для постов в каналах - там можно только комментировать в тредах */}
        {!(message.messageType === 'channel_post' && message.post) && onReply && (
          <button
            onClick={() => { onReply?.(); onClose(); }}
            className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700"
          >
            <Reply className="w-4 h-4" />
            Ответить
          </button>
        )}
        
        {isGroupChat && onStartThread && (
          <button
            onClick={() => { onStartThread?.(); onClose(); }}
            className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700"
          >
            <MessageSquare className="w-4 h-4" />
            Ответить в треде
          </button>
        )}
        
        {onForward && (
          <button
            onClick={() => { onForward?.(); onClose(); }}
            className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700"
          >
            <Forward className="w-4 h-4" />
            Переслать
          </button>
        )}
        
        <button
          onClick={() => { onCopy?.(); onClose(); }}
          className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700"
        >
          <Copy className="w-4 h-4" />
          Копировать текст
        </button>

        {isOwn && onEdit && (
          <>
            <div className="my-1 border-t border-gray-100 dark:border-gray-700" />
            <button
              onClick={() => { onEdit?.(); onClose(); }}
              className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700"
            >
              <Edit2 className="w-4 h-4" />
              Редактировать
            </button>
          </>
        )}

        {isOwn && onDelete && (
          <>
            <div className="my-1 border-t border-gray-100 dark:border-gray-700" />
            <button
              onClick={() => { onDelete?.(); onClose(); }}
              className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20"
            >
              <Trash2 className="w-4 h-4" />
              Удалить
            </button>
          </>
        )}
      </div>
    </div>
  );
}

// ============================================================================
// КОМПОНЕНТ РЕАКЦИЙ
// ============================================================================

interface MessageReactionsDisplayProps {
  reactions: MessageReactions;
  currentUserId: string;
  onToggle: (emoji: string) => void;
  isGroupChat?: boolean; // Для приватных чатов показываем по одной реакции на пользователя
}

function MessageReactionsDisplay({
  reactions,
  currentUserId,
  onToggle,
  isGroupChat = false,
}: MessageReactionsDisplayProps) {
  // Нормализуем reactions: может прийти как объект или массив
  let normalizedReactions: MessageReactions = {};
  
  if (!reactions) {
    return null;
  }
  
  // Явно проверяем, что это НЕ групповой чат для приватных чатов
  const isPrivateChat = !isGroupChat;
  
  // Если reactions - массив, преобразуем в объект
  if (Array.isArray(reactions)) {
    normalizedReactions = reactions.reduce((acc: MessageReactions, item: any) => {
      // Если элемент имеет структуру { emoji, count, users } или { emoji, userIds }
      const emoji = item.emoji || item[0];
      if (emoji && typeof emoji === 'string') {
        acc[emoji] = {
          count: item.count || item.userIds?.length || 0,
          userIds: item.userIds || item.users || [],
          users: item.users || [],
        };
      }
      return acc;
    }, {});
  } else if (typeof reactions === 'object') {
    normalizedReactions = reactions;
  } else {
    return null;
  }
  
  // Преобразуем reactions в массив, фильтруя валидные эмодзи
  const entries = Object.entries(normalizedReactions)
    .filter(([emoji, data]) => {
      // Проверяем, что emoji - это строка и не пустая, и не число
      if (!emoji || typeof emoji !== 'string' || emoji.trim().length === 0) {
        return false;
      }
      // Пропускаем если emoji выглядит как индекс массива (число)
      if (!isNaN(Number(emoji)) && emoji.trim().length <= 3 && !emoji.includes('️')) {
        return false;
      }
      // Проверяем, что есть пользователи или счетчик
      const count = data?.count ?? data?.userIds?.length ?? 0;
      return count > 0;
    })
    .map(([emoji, data]) => {
      // Убеждаемся, что emoji - это строка (не число или индекс)
      const emojiStr = String(emoji).trim();
      return [emojiStr, data] as [string, typeof data];
    });
  
  if (entries.length === 0) return null;

  // Для приватных чатов показываем по одной реакции на пользователя (без счетчика)
  // ВАЖНО: isGroupChat должен быть false для PRIVATE чатов
  if (isPrivateChat) {
    return (
      <>
        {entries.flatMap(([emoji, data]) => {
          const userIds = data.userIds || [];
          // Создаем отдельный бабл для каждого пользователя
          return userIds.map((userId) => {
            const isLiked = userId === currentUserId;
            return (
              <button
                key={`${emoji}-${userId}`}
                onClick={() => onToggle(emoji)}
                className={`
                  inline-flex items-center justify-center w-6 h-6 rounded-full text-xs transition-all shadow-sm
                  ${isLiked
                    ? "bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 ring-1 ring-blue-300 dark:ring-blue-700"
                    : "bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 ring-1 ring-gray-200 dark:ring-gray-600"
                  }
                `}
                title={data.users?.find(u => u.id === userId)?.name || 'Пользователь'}
              >
                <span className="text-sm leading-none" role="img" aria-label={`emoji ${emoji}`}>{emoji}</span>
              </button>
            );
          });
        })}
      </>
    );
  }

  // Для групповых чатов показываем с счетчиком
  return (
    <>
      {entries.map(([emoji, data]) => {
        const count = data.count ?? data.userIds?.length ?? 0;
        const isLiked = data.userIds?.includes(currentUserId);

        return (
          <button
            key={emoji}
            onClick={() => onToggle(emoji)}
            className={`
              inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-medium transition-all shadow-sm
              ${isLiked
                ? "bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 ring-1 ring-blue-300 dark:ring-blue-700"
                : "bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 ring-1 ring-gray-200 dark:ring-gray-600"
              }
            `}
            title={data.users?.map((u) => u.name).join(", ") || `${count} реакций`}
          >
            <span className="text-xs leading-none" role="img" aria-label={`emoji ${emoji}`}>{emoji}</span>
            <span className="font-semibold leading-none">{count}</span>
          </button>
        );
      })}
    </>
  );
}

// ============================================================================
// КОМПОНЕНТ ЛЕНИВОЙ ЗАГРУЗКИ ИЗОБРАЖЕНИЙ
// ============================================================================

interface LazyImageProps {
  src: string;
  thumbnail?: string;
  alt: string;
  blurPlaceholder?: string | null;
  isOld?: boolean;
  onClick?: () => void;
  className?: string;
}

function LazyImage({ 
  src, 
  thumbnail, 
  alt, 
  blurPlaceholder, 
  isOld = false,
  onClick,
  className = "" 
}: LazyImageProps) {
  const [isLoaded, setIsLoaded] = useState(false);
  const [imageError, setImageError] = useState(false);
  const [shouldLoad, setShouldLoad] = useState(!isOld); // Для старых сообщений не загружаем сразу

  // Используем useCDNUrl hook для безопасного преобразования URL после гидратации
  // Это предотвращает hydration mismatch между сервером и клиентом
  const cdnSrc = useCDNUrl(src);
  const cdnThumbnail = useCDNUrl(thumbnail);

  // Для старых сообщений используем Intersection Observer
  const containerRef = useRef<HTMLButtonElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);

  useEffect(() => {
    if (!isOld || shouldLoad) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setShouldLoad(true);
            observer.disconnect();
          }
        });
      },
      { rootMargin: "100px" } // Начинаем загрузку за 100px до появления
    );

    if (containerRef.current) {
      observer.observe(containerRef.current);
    }

    return () => observer.disconnect();
  }, [isOld, shouldLoad]);

  // КРИТИЧЕСКОЕ ИСПРАВЛЕНИЕ: Убеждаемся что displaySrc не пустой
  const displaySrc = shouldLoad ? (cdnThumbnail || cdnSrc) : (blurPlaceholder || undefined);
  const showBlur = isOld && (!shouldLoad || !isLoaded);
  
  // Логируем для диагностики
  if (!displaySrc && shouldLoad) {
    console.warn('[LazyImage] No displaySrc available:', {
      src,
      cdnSrc,
      cdnThumbnail,
      thumbnail,
      shouldLoad,
      isOld,
    });
  }

  // КРИТИЧЕСКОЕ ИСПРАВЛЕНИЕ: Убеждаемся что src не пустой
  if (!src || src.trim() === '') {
    return (
      <div className={`relative overflow-hidden rounded-xl ${className} bg-gray-100 dark:bg-gray-800 flex items-center justify-center`}>
        <ImageIcon className="w-8 h-8 text-gray-400" />
      </div>
    );
  }

  return (
    <button
      ref={containerRef}
      onClick={onClick}
      className={`relative group overflow-hidden rounded-xl ${className} ${!onClick ? 'cursor-default' : 'cursor-pointer'}`}
      type="button"
    >
      {displaySrc && (
        <img
          ref={imgRef}
          src={displaySrc}
          alt={alt}
          className={`w-full h-full object-cover rounded-xl transition-all duration-300 ${
            showBlur ? 'blur-md scale-105' : 'group-hover:scale-105'
          } ${isLoaded ? 'opacity-100' : 'opacity-0'}`}
          loading={isOld ? "lazy" : "lazy"}
          onLoad={() => {
            setIsLoaded(true);
            // Если это thumbnail, загружаем полное изображение в фоне
            if (cdnThumbnail && shouldLoad && displaySrc === cdnThumbnail) {
              const fullImg = new Image();
              fullImg.src = cdnSrc;
              fullImg.onload = () => {
                // Переключаемся на полное изображение после загрузки
                if (imgRef.current) {
                  imgRef.current.src = cdnSrc;
                }
              };
            } else if (!cdnThumbnail && shouldLoad) {
              // Если нет thumbnail, просто помечаем как загруженное
              setIsLoaded(true);
            }
          }}
          onError={(e) => {
            console.error('[LazyImage] Failed to load image:', {
              src: displaySrc,
              cdnSrc,
              cdnThumbnail,
              originalSrc: src,
            });
            setImageError(true);
          }}
        />
      )}
      
      {/* Blur overlay для старых сообщений */}
      {showBlur && (
        <div className="absolute inset-0 flex items-center justify-center bg-gray-200/80 dark:bg-gray-700/80 backdrop-blur-sm rounded-xl">
          <div className="flex flex-col items-center gap-2">
            <div className="w-12 h-12 rounded-full bg-white dark:bg-gray-800 flex items-center justify-center shadow-lg">
              <ImageIcon className="w-6 h-6 text-gray-600 dark:text-gray-400" />
            </div>
            <button
              onClick={(e) => {
                e.stopPropagation();
                setShouldLoad(true);
              }}
              className="px-3 py-1.5 text-xs font-medium text-white bg-blue-500 hover:bg-blue-600 rounded-lg transition-colors shadow-sm"
            >
              Загрузить
            </button>
          </div>
        </div>
      )}

      {/* Hover overlay */}
      <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors rounded-xl pointer-events-none" />
      
      {imageError && (
        <div className="absolute inset-0 flex items-center justify-center bg-gray-100 dark:bg-gray-800 rounded-xl">
          <ImageIcon className="w-8 h-8 text-gray-400" />
        </div>
      )}
      
      {/* Показываем плейсхолдер пока изображение не загружено */}
      {!displaySrc && !imageError && (
        <div className="absolute inset-0 flex items-center justify-center bg-gray-100 dark:bg-gray-800 rounded-xl">
          <ImageIcon className="w-8 h-8 text-gray-400" />
        </div>
      )}
    </button>
  );
}

// ============================================================================
// КОМПОНЕНТ ПРЕВЬЮ ССЫЛОК
// ============================================================================

interface LinkPreviewsProps {
  content: string;
  isOwn: boolean;
}

function LinkPreviews({ content, isOwn }: LinkPreviewsProps) {
  const [previews, setPreviews] = useState<Array<{ url: string; preview: any }>>([]);

  useEffect(() => {
    // Извлекаем URL из текста
    const urlRegex = /(https?:\/\/[^\s]+)/g;
    const urls = content.match(urlRegex) || [];
    
    if (urls.length === 0) {
      setPreviews([]);
      return;
    }

    // Получаем превью для каждого URL
    const fetchPreviews = async () => {
      const { fetchLinkPreview } = await import('@/lib/link-preview');
      const previewPromises = urls.map(async (url) => {
        const preview = await fetchLinkPreview(url);
        return preview ? { url, preview } : null;
      });
      
      const results = await Promise.all(previewPromises);
      setPreviews(results.filter((p): p is { url: string; preview: any } => p !== null));
    };

    fetchPreviews();
  }, [content]);

  if (previews.length === 0) return null;

  return (
    <div className="space-y-2 mt-2">
      {previews.map(({ url, preview }, idx) => (
        <LinkPreviewCard
          key={idx}
          url={url}
          preview={preview}
          isOwn={isOwn}
        />
      ))}
    </div>
  );
}

interface LinkPreviewCardProps {
  url: string;
  preview: any;
  isOwn: boolean;
}

function LinkPreviewCard({ url, preview, isOwn }: LinkPreviewCardProps) {
  const isVideo = preview.type === 'video' || preview.videoUrl;

  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className={`
        block rounded-xl overflow-hidden border transition-all
        ${isOwn 
          ? 'border-white/30 bg-white/10 hover:bg-white/20' 
          : 'border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 hover:bg-gray-100 dark:hover:bg-gray-800'
        }
      `}
    >
      {preview.image && !isVideo && (
        <div className="relative w-full h-48 bg-gray-200 dark:bg-gray-700">
          <img
            src={preview.image}
            alt={preview.title || ''}
            className="w-full h-full object-cover"
            loading="lazy"
          />
        </div>
      )}
      
      <div className="p-3">
        {preview.siteName && (
          <div className={clsx(
            "text-xs font-medium mb-1",
            isOwn ? 'text-white/70' : 'text-gray-500 dark:text-gray-400'
          )}>
            {preview.siteName}
          </div>
        )}
        
        {preview.title && (
          <h4 className={clsx(
            "text-sm font-semibold mb-1 line-clamp-2",
            isOwn ? 'text-white' : 'text-gray-900 dark:text-white'
          )}>
            {preview.title}
          </h4>
        )}
        
        {preview.description && (
          <p className={clsx(
            "text-xs line-clamp-2",
            isOwn ? 'text-white/80' : 'text-gray-600 dark:text-gray-300'
          )}>
            {preview.description}
          </p>
        )}

        {isVideo && preview.videoUrl && (
          <div className="mt-2 flex items-center gap-2">
            <div className={clsx(
              "w-10 h-10 rounded-full flex items-center justify-center",
              isOwn ? 'bg-white/20' : 'bg-gray-200 dark:bg-gray-700'
            )}>
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                <path d="M8 5v14l11-7z" />
              </svg>
            </div>
            <span className={clsx(
              "text-xs",
              isOwn ? 'text-white/70' : 'text-gray-500 dark:text-gray-400'
            )}>
              Видео
            </span>
          </div>
        )}
      </div>
    </a>
  );
}

// ============================================================================
// КОМПОНЕНТ ВЛОЖЕНИЙ
// ============================================================================

interface AttachmentsDisplayProps {
  attachments: MessageAttachment[];
  isOwn: boolean;
  onImageClick?: (url: string, name?: string) => void;
}

function AttachmentsDisplay({ attachments, isOwn, onImageClick }: AttachmentsDisplayProps) {
  const images = attachments.filter(a => a.type === 'image' || a.mimeType?.startsWith('image/'));
  const files = attachments.filter(a => a.type !== 'image' && !a.mimeType?.startsWith('image/'));

  return (
    <div className="space-y-2">
      {/* Images grid */}
      {images.length > 0 && (
        <div className={`grid gap-1 ${images.length === 1 ? 'grid-cols-1' : images.length === 2 ? 'grid-cols-2' : 'grid-cols-2'}`}>
          {images.map((img, idx) => {
            const url = getAttachmentUrl(img);
            const name = getAttachmentName(img);
            const isOld = img.isOld || false;
            const blurPlaceholder = img.blurPlaceholder || null;
            
            // КРИТИЧЕСКОЕ ИСПРАВЛЕНИЕ: Логируем URL для диагностики
            if (!url || url.trim() === '') {
              console.warn('[AttachmentsDisplay] Empty image URL:', {
                attachment: img,
                idx,
              });
            }
            
            return (
              <LazyImage
                key={img.id || idx}
                src={url}
                thumbnail={img.thumbnailUrl ? getAttachmentUrl({ ...img, url: img.thumbnailUrl }) : undefined}
                alt={name}
                blurPlaceholder={blurPlaceholder}
                isOld={isOld}
                onClick={() => onImageClick?.(url, name)}
                className="w-full max-w-[300px] max-h-[300px] object-cover rounded-xl"
              />
            );
          })}
        </div>
      )}

      {/* Files */}
      {files.map((file, idx) => {
        const baseUrl = getAttachmentUrl(file);
        const name = getAttachmentName(file);
        const size = getAttachmentSize(file);
        
        return (
          <FileLink
            key={file.id || idx}
            url={baseUrl}
            name={name}
            size={size}
            isOwn={isOwn}
          />
        );
      })}
    </div>
  );
}

// Компонент для файловых ссылок с безопасной CDN трансформацией
function FileLink({ url, name, size, isOwn }: { url: string; name: string; size: number; isOwn: boolean }) {
  const cdnUrl = useCDNUrl(url);
  
  return (
    <a
      href={cdnUrl}
      target="_blank"
      rel="noopener noreferrer"
      className={`
        flex items-center gap-3 p-3 rounded-xl transition-colors
        ${isOwn 
          ? 'bg-white/20 hover:bg-white/30' 
          : 'bg-gray-100 dark:bg-gray-700/60 hover:bg-gray-200 dark:hover:bg-gray-600'
        }
      `}
    >
      <div className={`p-2 rounded-lg ${isOwn ? 'bg-white/20' : 'bg-gray-200 dark:bg-gray-600'}`}>
        <FileText className={`w-5 h-5 ${isOwn ? 'text-white' : 'text-gray-600 dark:text-gray-300'}`} />
      </div>
      <div className="flex-1 min-w-0">
        <div className={`text-sm font-medium truncate ${isOwn ? 'text-white' : 'text-gray-900 dark:text-gray-100'}`}>
          {name}
        </div>
        {size > 0 && (
          <div className={`text-xs ${isOwn ? 'text-white/70' : 'text-gray-500 dark:text-gray-400'}`}>
            {formatFileSize(size)}
          </div>
        )}
      </div>
      <Download className={`w-4 h-4 ${isOwn ? 'text-white/70' : 'text-gray-400'}`} />
    </a>
  );
}

// ============================================================================
// КОМПОНЕНТ ПОСТА КАНАЛА
// ============================================================================

interface ChannelPostDisplayProps {
  post: Message['post'];
  isOwn: boolean;
  onPollVote?: (pollId: string, optionId: string) => void;
  onImageClick?: (url: string, name?: string) => void;
  messageId?: string;
  messageReactions?: MessageReactions;
  onReaction?: (messageId: string, emoji: string) => void;
  currentUserId?: string;
  onOpenThread?: () => void;
  commentsCount?: number;
  threadParticipants?: Array<{ id: string; avatarUrl: string | null }>;
}

function ChannelPostDisplay({ 
  post, 
  isOwn, 
  onPollVote, 
  onImageClick,
  messageId,
  messageReactions,
  onReaction,
  currentUserId = '',
  onOpenThread,
  commentsCount = 0,
  threadParticipants = [],
}: ChannelPostDisplayProps) {
  const [participants, setParticipants] = useState<Array<{ id: string; avatarUrl: string | null }>>(threadParticipants);
  
  // Загружаем участников треда для мини-аватарок
  useEffect(() => {
    if (commentsCount > 0 && participants.length === 0) {
      const loadParticipants = async () => {
        try {
          const response = await fetch(`/api/news/${post.id}/comments`);
          if (response.ok) {
            const data = await response.json();
            const allParticipants = new Map<string, { id: string; avatarUrl: string | null }>();
            
            (data.comments || []).forEach((comment: any) => {
              const normalized = normalizeUserAvatar(comment.user);
              if (normalized.avatarUrl) {
                allParticipants.set(comment.user.id, {
                  id: comment.user.id,
                  avatarUrl: normalized.avatarUrl,
                });
              }
              (comment.replies || []).forEach((reply: any) => {
                const normalizedReply = normalizeUserAvatar(reply.user);
                if (normalizedReply.avatarUrl && !allParticipants.has(reply.user.id)) {
                  allParticipants.set(reply.user.id, {
                    id: reply.user.id,
                    avatarUrl: normalizedReply.avatarUrl,
                  });
                }
              });
            });
            
            setParticipants(Array.from(allParticipants.values()).slice(0, 5));
          }
        } catch (err) {
          console.error('Failed to load thread participants:', err);
        }
      };
      loadParticipants();
    }
  }, [post.id, commentsCount, participants.length]);

  if (!post) return null;

  const handlePollVote = async (pollId: string, optionId: string) => {
    if (!onPollVote) return;
    try {
      const response = await fetch(`/api/news/polls/${pollId}/vote`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ optionId }),
      });

      if (response.ok) {
        onPollVote(pollId, optionId);
      }
    } catch (error) {
      console.error("Error voting:", error);
    }
  };


  return (
    <div className="space-y-3 relative break-words overflow-wrap-anywhere min-w-0 w-full">
      {/* Информация о пересылке и канале */}
      {(post as any).forwarded && (post as any).channelName && (
        <div className={clsx(
          "flex items-center gap-2 text-xs",
          isOwn ? 'text-white/70' : 'text-gray-500 dark:text-gray-400'
        )}>
          <span>Переслано из канала</span>
          <a
            href={`/dashboard/news/channel/${(post as any).channelId}`}
            onClick={(e) => {
              e.stopPropagation();
            }}
            className={clsx(
              "font-medium hover:underline",
              isOwn ? 'text-white/90' : 'text-blue-600 dark:text-blue-400'
            )}
          >
            {(post as any).channelName}
          </a>
        </div>
      )}
      {/* Cover Image */}
      {post.coverImage && (
        <div className="rounded-xl overflow-hidden">
          <button
            onClick={() => onImageClick?.(post.coverImage!, post.title)}
            className="w-full"
            type="button"
          >
            <img
              src={post.coverImage}
              alt={post.title}
              className="w-full max-h-96 object-cover rounded-xl cursor-pointer hover:opacity-90 transition-opacity"
              loading="lazy"
            />
          </button>
        </div>
      )}

      {/* Title */}
      <h3 className={`text-lg font-bold ${isOwn ? 'text-white' : 'text-gray-900 dark:text-white'}`}>
        {post.title}
      </h3>

      {/* Content */}
      <div
        className={`
          text-sm leading-relaxed break-words overflow-wrap-anywhere word-break-break-word
          ${isOwn ? 'text-white/90' : 'text-gray-700 dark:text-gray-300'}
          prose prose-sm max-w-none
          ${isOwn 
            ? 'prose-invert [&_*]:!text-white/90' 
            : '[&_p]:text-gray-700 dark:[&_p]:text-gray-300'
          }
          [&_p]:break-words [&_p]:overflow-wrap-anywhere [&_p]:word-break-break-word
        `}
        dangerouslySetInnerHTML={{ __html: post.content }}
      />

      {/* Polls */}
      {post.polls && post.polls.length > 0 && (
        <div className="space-y-4 mt-4">
          {post.polls.map((poll) => (
            <div
              key={poll.id}
              className={clsx(
                "rounded-xl border p-4",
                isOwn 
                  ? 'border-white/20 bg-white/5 backdrop-blur-sm' 
                  : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800/50 shadow-sm'
              )}
            >
              <h4 className={clsx(
                "text-sm font-semibold mb-3",
                isOwn ? 'text-white' : 'text-gray-900 dark:text-white'
              )}>
                {poll.question}
              </h4>
              <div className="space-y-2.5">
                {poll.options.map((option) => {
                  const isVoted = poll.userVote === option.id;
                  const percentage = option.percentage || 0;
                  const voteCount = option.voteCount || 0;

                  return (
                    <button
                      key={option.id}
                      onClick={() => {
                        if (!poll.isClosed && !poll.userVote) {
                          handlePollVote(poll.id, option.id);
                        }
                      }}
                      disabled={poll.isClosed || !!poll.userVote}
                      className={clsx(
                        "group relative w-full rounded-lg p-3 text-left transition-all duration-200",
                        "focus:outline-none focus:ring-2 focus:ring-offset-1",
                        isVoted
                          ? isOwn
                            ? "bg-white/15 border border-white/30"
                            : "bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800"
                          : poll.userVote
                          ? isOwn
                            ? "bg-white/5 border border-white/10"
                            : "bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700"
                          : isOwn
                          ? "bg-white/5 border border-white/10 hover:bg-white/10 hover:border-white/20"
                          : "bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-800 hover:border-gray-300 dark:hover:border-gray-600",
                        (poll.isClosed || poll.userVote) && "cursor-default"
                      )}
                    >
                      <div className="flex items-center justify-between gap-3 mb-2">
                        <span className={clsx(
                          "text-sm font-medium flex-1",
                          isOwn ? 'text-white' : 'text-gray-900 dark:text-white'
                        )}>
                          {option.text}
                        </span>
                        {poll.totalVotes > 0 && (
                          <span className={clsx(
                            "text-xs font-medium whitespace-nowrap",
                            isOwn ? 'text-white/80' : 'text-gray-600 dark:text-gray-400'
                          )}>
                            {percentage}% • {voteCount}
                          </span>
                        )}
                      </div>
                      {poll.totalVotes > 0 && (
                        <div className={clsx(
                          "h-1.5 w-full overflow-hidden rounded-full",
                          isOwn ? 'bg-white/15' : 'bg-gray-200 dark:bg-gray-700'
                        )}>
                          <div
                            className={clsx(
                              "h-full rounded-full transition-all duration-500 ease-out",
                              isOwn 
                                ? 'bg-white/60' 
                                : isVoted
                                ? 'bg-blue-500 dark:bg-blue-400'
                                : 'bg-blue-400 dark:bg-blue-500'
                            )}
                            style={{ width: `${percentage}%` }}
                          />
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
              {poll.totalVotes > 0 && (
                <p className={clsx(
                  "mt-3 text-xs font-medium",
                  isOwn ? 'text-white/70' : 'text-gray-500 dark:text-gray-400'
                )}>
                  Всего голосов: {poll.totalVotes}
                </p>
              )}
            </div>
          ))}
        </div>
      )}


      {/* Thread indicator with mini-avatars - как в Slack */}
      {commentsCount > 0 && (
        <button
          onClick={onOpenThread}
          className={clsx(
            "mt-2 flex items-center gap-2 text-xs transition-colors group",
            isOwn ? 'text-white/70 hover:text-white' : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
          )}
        >
          {participants.length > 0 && (
            <div className="flex -space-x-1.5">
              {participants.slice(0, 3).map((participant, idx) => (
                <img
                  key={participant.id}
                  src={participant.avatarUrl || "/default-avatar.png"}
                  alt=""
                  className={clsx(
                    "rounded-full border",
                    isOwn 
                      ? "w-4 h-4 border-white/30" 
                      : "w-4 h-4 border-white dark:border-gray-900"
                  )}
                  style={{ zIndex: 10 - idx }}
                />
              ))}
              {participants.length > 3 && (
                <div className={clsx(
                  "rounded-full border flex items-center justify-center text-[9px] font-medium",
                  isOwn
                    ? "w-4 h-4 border-white/30 bg-white/20 text-white"
                    : "w-4 h-4 border-white dark:border-gray-900 bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-300"
                )}>
                  +{participants.length - 3}
                </div>
              )}
            </div>
          )}
          <MessageCircle className="w-3.5 h-3.5" />
          <span>
            {commentsCount} {commentsCount === 1 ? 'ответ' : commentsCount < 5 ? 'ответа' : 'ответов'}
          </span>
        </button>
      )}
    </div>
  );
}

// ============================================================================
// КОМПОНЕНТ СООБЩЕНИЯ
// ============================================================================

interface MessageBubbleProps {
  message: Message;
  isOwn: boolean;
  showAvatar: boolean;
  showName: boolean;
  currentUserId: string;
  onContextMenu: (e: React.MouseEvent, message: Message) => void;
  onReaction?: (messageId: string, emoji: string) => void;
  onOpenThread?: () => void;
  onImageClick?: (url: string, name?: string) => void;
  onPollVote?: (pollId: string, optionId: string) => void;
  isGroupChat?: boolean;
}

const MessageBubble = memo(function MessageBubble({
  message,
  isOwn,
  showAvatar,
  showName,
  currentUserId,
  onContextMenu,
  onReaction,
  onOpenThread,
  onImageClick,
  onPollVote,
  isGroupChat = false,
}: MessageBubbleProps) {
  const isDeleted = !!message.deletedAt;
  const isChannelPost = message.messageType === 'channel_post' && message.post;

  return (
    <div 
      data-message-id={message.id}
      className={`flex gap-2 ${isOwn ? 'flex-row-reverse' : ''}`}
      onContextMenu={(e) => onContextMenu(e, message)}
    >
      {/* Avatar */}
      <div className="flex-shrink-0 w-8">
        {showAvatar && !isOwn && (
          message.sender.avatarUrl && typeof message.sender.avatarUrl === 'string' && message.sender.avatarUrl.trim() !== '' ? (
            <img
              src={message.sender.avatarUrl}
              alt={getSenderName(message.sender)}
              className="w-8 h-8 rounded-full object-cover"
              onError={(e) => {
                // Если изображение не загрузилось, скрываем его и показываем инициалы
                e.currentTarget.style.display = 'none';
                const parent = e.currentTarget.parentElement;
                if (parent && !parent.querySelector('.avatar-fallback')) {
                  const fallback = document.createElement('div');
                  fallback.className = 'avatar-fallback w-8 h-8 rounded-full bg-gradient-to-br from-blue-400 to-purple-500 flex items-center justify-center text-white text-xs font-semibold';
                  fallback.textContent = getSenderInitials(message.sender);
                  parent.appendChild(fallback);
                }
              }}
            />
          ) : (
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-400 to-purple-500 flex items-center justify-center text-white text-xs font-semibold">
              {getSenderInitials(message.sender)}
            </div>
          )
        )}
      </div>

      {/* Message content */}
      <div className={`max-w-[70%] min-w-0 ${isOwn ? 'items-end' : 'items-start'} ${isChannelPost ? 'max-w-[85%] sm:max-w-[75%]' : ''}`}>
        {/* Reply preview */}
        {message.replyTo && (
          <div className={`
            mb-1 px-3 py-2 rounded-xl text-xs border-l-2
            ${isOwn 
              ? 'bg-blue-600/30 dark:bg-blue-400/20 border-blue-400 dark:border-blue-300' 
              : 'bg-gray-100 dark:bg-gray-700/60 border-blue-500 dark:border-blue-400'
            }
          `}>
            <div className={`font-medium ${isOwn ? 'text-blue-900 dark:text-blue-100' : 'text-blue-700 dark:text-blue-400'}`}>
              {getSenderName(message.replyTo.sender)}
            </div>
            <div className={`truncate mt-0.5 ${isOwn ? 'text-gray-900 dark:text-white/90' : 'text-gray-900 dark:text-gray-300'}`}>
              {message.replyTo.content}
            </div>
          </div>
        )}

        {/* Bubble */}
        <div className={`
          group relative rounded-2xl px-4 py-2.5 flex flex-col min-w-0 w-full
          ${isOwn 
            ? 'bg-blue-500 text-white rounded-br-md' 
            : 'bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-bl-md'
          }
          ${isDeleted ? 'opacity-60' : ''}
        `}>
          {/* 1-й ряд: Имя и должность (только для групп) */}
          {isGroupChat && showName && !isOwn && (
            <div className="flex items-center gap-2 mb-1.5">
              <span className={`text-xs font-medium ${isOwn ? 'text-blue-100' : 'text-gray-700 dark:text-gray-300'}`}>
                {getSenderName(message.sender)}
              </span>
              {(message.sender.jobTitle || message.sender.profession) && (
                <span className={`text-[10px] ${isOwn ? 'text-blue-100/70' : 'text-gray-500 dark:text-gray-400'}`}>
                  – {message.sender.jobTitle || message.sender.profession}
                </span>
              )}
            </div>
          )}
          {isDeleted ? (
            <div className={`italic text-sm opacity-70 ${isOwn ? 'text-white' : 'text-gray-600 dark:text-gray-400'}`}>
              Сообщение удалено
            </div>
          ) : isChannelPost ? (
            // Отображение поста канала
            <ChannelPostDisplay 
              post={message.post!} 
              isOwn={isOwn}
              onPollVote={onPollVote}
              onImageClick={onImageClick}
              messageId={message.id}
              messageReactions={message.reactions || undefined}
              onReaction={(msgId, emoji) => {
                // Передаем messageId и emoji в родительский обработчик
                if (onReaction) {
                  onReaction(msgId, emoji);
                }
              }}
              currentUserId={currentUserId}
              onOpenThread={onOpenThread}
              commentsCount={message.post?._count.comments || 0}
              threadParticipants={[]} // Загружается внутри компонента
            />
          ) : (
            <>
              {/* Attachments */}
              {message.attachments && message.attachments.length > 0 && (
                <div className="mb-2">
                  <AttachmentsDisplay
                    attachments={message.attachments}
                    isOwn={isOwn}
                    onImageClick={onImageClick}
                  />
                </div>
              )}

              {/* Text content with markdown */}
              {message.content && (() => {
                // КРИТИЧЕСКОЕ ИСПРАВЛЕНИЕ: Проверяем, является ли это начальным сообщением обращения
                const isAppealInitialMessage = message.content.includes('**Обращение #') && 
                                                message.content.includes('**Тема:**') &&
                                                message.content.includes('**Текст обращения:**');
                
                // Если это начальное сообщение обращения - используем специальный компонент
                if (isAppealInitialMessage) {
                  return (
                    <>
                      <AppealMessageCard content={message.content} isOwn={isOwn} />
                      {/* Link previews */}
                      <LinkPreviews content={message.content} isOwn={isOwn} />
                    </>
                  );
                }
                
                // Обрабатываем упоминания ДО передачи в ReactMarkdown
                // Заменяем @[Name](userId) на специальные плейсхолдеры, чтобы ReactMarkdown не интерпретировал их как ссылки
                const mentionRegex = /@\[([^\]]+)\]\(([^)]+)\)/g;
                const mentionPlaceholders: Map<string, { name: string; userId: string }> = new Map();
                let processedContent = message.content;
                let placeholderIndex = 0;
                
                processedContent = processedContent.replace(mentionRegex, (match, name, userId) => {
                  const placeholder = `__MENTION_PLACEHOLDER_${placeholderIndex}__`;
                  mentionPlaceholders.set(placeholder, { name, userId });
                  placeholderIndex++;
                  return placeholder;
                });

                return (
                  <>
                    <div className={`
                      text-[15px] leading-relaxed break-words
                      ${isOwn ? '!text-white' : 'text-gray-900 dark:text-gray-100'}
                      prose prose-sm max-w-none
                      ${isOwn 
                        ? 'prose-invert [&_*]:!text-white [&_p]:!text-white [&_strong]:!text-white [&_em]:!text-white [&_li]:!text-white [&_h1]:!text-white [&_h2]:!text-white [&_h3]:!text-white [&_h4]:!text-white [&_h5]:!text-white [&_h6]:!text-white [&_blockquote]:!text-white [&_blockquote]:border-blue-300 [&_a]:!text-blue-200 [&_a]:underline hover:[&_a]:!text-blue-100 [&_code]:!text-blue-100 [&_code]:bg-blue-400/30 [&_pre]:bg-blue-400/20 [&_pre]:!text-white' 
                        : '[&_p]:text-gray-900 dark:[&_p]:text-gray-100 [&_strong]:text-gray-900 dark:[&_strong]:text-gray-100 [&_em]:text-gray-900 dark:[&_em]:text-gray-100 [&_li]:text-gray-900 dark:[&_li]:text-gray-100 [&_h1]:text-gray-900 dark:[&_h1]:text-gray-100 [&_h2]:text-gray-900 dark:[&_h2]:text-gray-100 [&_h3]:text-gray-900 dark:[&_h3]:text-gray-100 [&_h4]:text-gray-900 dark:[&_h4]:text-gray-100 [&_h5]:text-gray-900 dark:[&_h5]:text-gray-100 [&_h6]:text-gray-900 dark:[&_h6]:text-gray-100 [&_a]:text-blue-600 dark:[&_a]:text-blue-400 [&_code]:text-gray-900 dark:[&_code]:text-gray-100'
                      }
                    `}>
                      <ReactMarkdown 
                        remarkPlugins={[remarkGfm]}
                        components={{
                          // Заменяем плейсхолдеры на стилизованные упоминания
                          p: ({ children }) => {
                            const content = String(children);
                            const parts: React.ReactNode[] = [];
                            let lastIndex = 0;
                            
                            // Ищем все плейсхолдеры и заменяем их на стилизованные упоминания
                            for (const [placeholder, { name, userId }] of mentionPlaceholders.entries()) {
                              const index = content.indexOf(placeholder, lastIndex);
                              if (index !== -1) {
                                // Добавляем текст до плейсхолдера
                                if (index > lastIndex) {
                                  parts.push(content.substring(lastIndex, index));
                                }
                                
                                // Добавляем стилизованное упоминание
                                parts.push(
                                  <span
                                    key={`mention-${userId}-${index}`}
                                    className={`
                                      font-medium px-1.5 py-0.5 rounded
                                      ${isOwn 
                                        ? 'bg-white/20 text-white' 
                                        : 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'
                                      }
                                    `}
                                    title={`@${name}`}
                                  >
                                    @{name}
                                  </span>
                                );
                                
                                lastIndex = index + placeholder.length;
                              }
                            }
                            
                            // Добавляем оставшийся текст
                            if (lastIndex < content.length) {
                              parts.push(content.substring(lastIndex));
                            }
                            
                            // Если упоминаний не найдено, возвращаем оригинальный контент
                            if (parts.length === 0) {
                              return <p>{children}</p>;
                            }
                            
                            return <p>{parts}</p>;
                          },
                        }}
                      >
                        {processedContent}
                      </ReactMarkdown>
                    </div>
                    
                    {/* Link previews */}
                    <LinkPreviews content={message.content} isOwn={isOwn} />
                  </>
                );
              })()}
            </>
          )}

          {/* 3-й ряд: Реакции (слева) и время (справа) */}
          <div className="flex items-center justify-between gap-2 mt-1.5 pt-1">
            {/* Reactions - слева */}
            {!isDeleted && message.reactions && Object.keys(message.reactions).length > 0 && (
              <div className="flex flex-wrap gap-0.5">
                <MessageReactionsDisplay
                  reactions={message.reactions}
                  currentUserId={currentUserId}
                  onToggle={(emoji) => onReaction?.(message.id, emoji)}
                  isGroupChat={isGroupChat}
                />
              </div>
            )}
            
            {/* Time and status - справа */}
            <div className={`
              flex items-center gap-1 text-[10px] shrink-0
              ${isOwn ? 'text-blue-100/70' : 'text-gray-400 dark:text-gray-500'}
            `}>
              <span>{formatMessageTime(new Date(message.createdAt))}</span>
              {message.editedAt && <span>(ред.)</span>}
              {isOwn && (
                // Одна галочка - отправлено, две галочки - прочитано
                message.isRead ? (
                  <CheckCheck className="w-3.5 h-3.5" />
                ) : (
                  <Check className="w-3.5 h-3.5 opacity-70" />
                )
              )}
            </div>
          </div>
        </div>

        {/* Thread indicator */}
        {!isDeleted && (message.threadRepliesCount || 0) > 0 && (
          <button
            onClick={onOpenThread}
            className="mt-2 flex items-center gap-1.5 text-xs text-blue-600 dark:text-blue-400 hover:underline"
          >
            <MessageSquare className="w-3.5 h-3.5" />
            <span>
              {message.threadRepliesCount} {message.threadRepliesCount === 1 ? 'ответ' : 'ответов'}
            </span>
          </button>
        )}
      </div>
    </div>
  );
}, (prevProps, nextProps) => {
  // Кастомная функция сравнения для оптимизации
  return (
    prevProps.message.id === nextProps.message.id &&
    prevProps.message.content === nextProps.message.content &&
    prevProps.message.reactions === nextProps.message.reactions &&
    prevProps.message.threadRepliesCount === nextProps.message.threadRepliesCount &&
    prevProps.isOwn === nextProps.isOwn &&
    prevProps.showAvatar === nextProps.showAvatar &&
    prevProps.showName === nextProps.showName
  );
});

// ============================================================================
// СИСТЕМНОЕ СООБЩЕНИЕ
// ============================================================================

function ActivityMessage({ message }: { message: Message }) {
  const getActivityIcon = () => {
    switch (message.activityType) {
      case "status_changed": return <Settings className="w-4 h-4" />;
      case "participant_added": return <UserPlus className="w-4 h-4" />;
      case "message_edited": return <Edit2 className="w-4 h-4" />;
      case "file_attached": return <FileText className="w-4 h-4" />;
      default: return <AlertCircle className="w-4 h-4" />;
    }
  };

  return (
    <div className="flex items-center justify-center py-3">
      <div className="flex items-center gap-2 px-4 py-2 bg-gray-100 dark:bg-gray-800 rounded-full text-xs text-gray-500 dark:text-gray-400">
        {getActivityIcon()}
        <span>{message.content}</span>
        <span className="text-gray-400 dark:text-gray-500">
          {formatMessageTime(new Date(message.createdAt))}
        </span>
      </div>
    </div>
  );
}

// ============================================================================
// ОСНОВНОЙ КОМПОНЕНТ
// ============================================================================

export default function SlackStyleMessages({
  messages,
  currentUserId,
  typingUsers,
  isTicketChat = false,
  isGroupChat = false,
  isAIChat = false,
  ticketId,
  onReply,
  onStartThread,
  onEdit,
  onDelete,
  onReaction,
  onOpenThread,
  onForward,
  onImageClick,
  onPollVote,
  onQuestionClick,
  chatId,
}: SlackStyleMessagesProps) {
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [isAtBottom, setIsAtBottom] = useState(true);
  const scrollTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isRestoringScrollRef = useRef(false);
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    message: Message;
  } | null>(null);

  const scrollToBottom = useCallback((smooth = true) => {
    messagesEndRef.current?.scrollIntoView({
      behavior: smooth ? "smooth" : "auto",
    });
  }, []);

  // Сохранение позиции скролла (относительно низа контейнера для стабильности)
  const saveScrollPosition = useCallback(() => {
    if (!containerRef.current || !chatId || isRestoringScrollRef.current) return;
    
    const { scrollTop, scrollHeight, clientHeight } = containerRef.current;
    // Сохраняем расстояние от низа, а не от верха - это более стабильно при изменении высоты контента
    const distanceFromBottom = scrollHeight - scrollTop - clientHeight;
    
    // Находим ID последнего видимого сообщения для более точного восстановления
    const visibleMessages = messages.filter((msg, idx) => {
      const element = document.querySelector(`[data-message-id="${msg.id}"]`);
      if (!element) return false;
      const rect = element.getBoundingClientRect();
      const containerRect = containerRef.current!.getBoundingClientRect();
      return rect.top >= containerRect.top && rect.top <= containerRect.bottom;
    });
    
    const lastVisibleMessageId = visibleMessages.length > 0 
      ? visibleMessages[visibleMessages.length - 1].id 
      : messages.length > 0 ? messages[messages.length - 1].id : null;
    
    if (distanceFromBottom > 0 || lastVisibleMessageId) {
      // Сохраняем в localStorage для персистентности
      try {
        localStorage.setItem(`chat_scroll_${chatId}`, JSON.stringify({
          distanceFromBottom,
          lastVisibleMessageId,
          scrollTop, // Сохраняем и абсолютную позицию для совместимости
        }));
      } catch (e) {
        // Игнорируем ошибки localStorage
      }
    }
  }, [chatId, messages]);

  // Восстановление позиции скролла
  const restoreScrollPosition = useCallback(() => {
    if (!containerRef.current || !chatId || messages.length === 0) return;
    
    try {
      const savedData = localStorage.getItem(`chat_scroll_${chatId}`);
      if (!savedData) return;
      
      const saved = JSON.parse(savedData);
      const { distanceFromBottom, lastVisibleMessageId, scrollTop: savedScrollTop } = saved || {};
      
      isRestoringScrollRef.current = true;
      
      // Используем двойной requestAnimationFrame для гарантии полного рендера
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          if (!containerRef.current) {
            isRestoringScrollRef.current = false;
            return;
          }
          
          // Приоритет 1: Восстановление по ID последнего видимого сообщения (самый точный способ)
          if (lastVisibleMessageId) {
            const messageElement = document.querySelector(`[data-message-id="${lastVisibleMessageId}"]`) as HTMLElement;
            if (messageElement) {
              // Скроллим к сообщению, выравнивая по верху видимой области
              messageElement.scrollIntoView({ behavior: 'auto', block: 'start' });
              // Добавляем небольшой отступ от верха
              containerRef.current.scrollTop = Math.max(0, containerRef.current.scrollTop - 20);
              setTimeout(() => {
                isRestoringScrollRef.current = false;
              }, 200);
              return;
            }
          }
          
          // Приоритет 2: Восстановление по расстоянию от низа (более стабильно при изменении высоты)
          if (distanceFromBottom !== undefined && distanceFromBottom > 0) {
            const { scrollHeight, clientHeight } = containerRef.current;
            const targetScrollTop = scrollHeight - clientHeight - distanceFromBottom;
            if (targetScrollTop > 0) {
              containerRef.current.scrollTop = targetScrollTop;
              setTimeout(() => {
                isRestoringScrollRef.current = false;
              }, 200);
              return;
            }
          }
          
          // Приоритет 3: Восстановление по абсолютной позиции (fallback)
          if (savedScrollTop && savedScrollTop > 0) {
            containerRef.current.scrollTop = savedScrollTop;
            setTimeout(() => {
              isRestoringScrollRef.current = false;
            }, 200);
            return;
          }
          
          isRestoringScrollRef.current = false;
        });
      });
    } catch (e) {
      // Игнорируем ошибки localStorage
      isRestoringScrollRef.current = false;
    }
  }, [chatId, messages]);

  // Восстанавливаем позицию при загрузке сообщений
  useEffect(() => {
    if (messages.length > 0 && chatId) {
      // Проверяем, был ли пользователь внизу
      const wasAtBottom = localStorage.getItem(`chat_at_bottom_${chatId}`) === 'true';
      
      if (wasAtBottom) {
        // Если был внизу, скроллим вниз
        setTimeout(() => {
          scrollToBottom(false);
        }, 100);
      } else {
        // Если не был внизу, восстанавливаем позицию
        const timer = setTimeout(() => {
          restoreScrollPosition();
        }, 200);
        return () => clearTimeout(timer);
      }
    }
  }, [messages.length, chatId, restoreScrollPosition, scrollToBottom]);

  // Автоматический скролл вниз только если пользователь был внизу и не восстанавливаем позицию
  useEffect(() => {
    if (isAtBottom && !isRestoringScrollRef.current) {
      // Проверяем, что пользователь действительно был внизу (не восстанавливаем позицию)
      const wasAtBottom = localStorage.getItem(`chat_at_bottom_${chatId}`) === 'true';
      if (wasAtBottom) {
        scrollToBottom();
      }
    }
  }, [messages.length, isAtBottom, scrollToBottom, chatId]);

  const handleContextMenu = useCallback((e: React.MouseEvent, message: Message) => {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY, message });
  }, []);

  const handleScroll = useCallback(() => {
    if (!containerRef.current || isRestoringScrollRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = containerRef.current;
    const distanceFromBottom = scrollHeight - scrollTop - clientHeight;
    const atBottom = distanceFromBottom < 100;
    setIsAtBottom(atBottom);
    
    // Сохраняем флаг, был ли пользователь внизу
    if (chatId) {
      try {
        localStorage.setItem(`chat_at_bottom_${chatId}`, String(atBottom));
      } catch (e) {
        // Игнорируем ошибки localStorage
      }
    }
    
    // Debounce сохранения позиции скролла
    if (scrollTimeoutRef.current) {
      clearTimeout(scrollTimeoutRef.current);
    }
    scrollTimeoutRef.current = setTimeout(() => {
      saveScrollPosition();
    }, 150);
  }, [saveScrollPosition, chatId]);

  const handleCopy = useCallback((message: Message) => {
    navigator.clipboard.writeText(message.content);
  }, []);

  // Очистка при размонтировании
  useEffect(() => {
    return () => {
      if (scrollTimeoutRef.current) {
        clearTimeout(scrollTimeoutRef.current);
      }
      // Сохраняем позицию при размонтировании
      saveScrollPosition();
    };
  }, [saveScrollPosition]);

  // КРИТИЧЕСКОЕ ИСПРАВЛЕНИЕ: Выносим useMemo на верхний уровень компонента
  // useMemo НЕ может быть вызван внутри JSX или условного рендеринга
  const renderedMessages = useMemo(() => {
    return messages.map((message, index) => {
      const previousMessage = index > 0 ? messages[index - 1] : undefined;
      const showDate = shouldShowDateSeparator(message, previousMessage);
      const isOwn = message.senderId === currentUserId;
      
      // Показываем аватар и имя если это первое сообщение или от другого отправителя
      const showAvatar = !previousMessage || 
        previousMessage.senderId !== message.senderId ||
        showDate;
      const showName = showAvatar;

      if (message.isActivity) {
        return (
          <div key={message.id}>
            {showDate && (
              <div className="flex items-center justify-center my-4">
                <div className="px-4 py-1.5 bg-white dark:bg-gray-800 rounded-full text-xs font-medium text-gray-500 dark:text-gray-400 shadow-sm">
                  {formatMessageDate(new Date(message.createdAt))}
                </div>
              </div>
            )}
            <ActivityMessage message={message} />
          </div>
        );
      }

      return (
        <div key={message.id}>
          {showDate && (
            <div className="flex items-center justify-center my-4">
              <div className="px-4 py-1.5 bg-white dark:bg-gray-800 rounded-full text-xs font-medium text-gray-500 dark:text-gray-400 shadow-sm">
                {formatMessageDate(new Date(message.createdAt))}
              </div>
            </div>
          )}
          
          <div className={`py-1 ${showAvatar ? 'mt-3' : ''}`}>
            <MessageBubble
              message={message}
              isOwn={isOwn}
              showAvatar={showAvatar}
              showName={showName}
              currentUserId={currentUserId}
              onContextMenu={handleContextMenu}
              onReaction={onReaction ? (msgId, emoji) => onReaction(msgId, emoji) : undefined}
              onOpenThread={() => onOpenThread?.(message)}
              onImageClick={onImageClick}
              onPollVote={onPollVote}
              isGroupChat={isGroupChat}
            />
          </div>
        </div>
      );
    });
  }, [messages, currentUserId, handleContextMenu, onReaction, onOpenThread, onImageClick, onPollVote, isGroupChat, isTicketChat, ticketId]);

  return (
    <div
      ref={containerRef}
      className="flex-1 overflow-y-auto bg-gray-50 dark:bg-gray-900"
      onScroll={handleScroll}
    >
      <div className="py-4 px-4 space-y-1 min-h-full">
        {isAIChat && messages.length === 0 && onQuestionClick ? (
          <div className="flex items-center justify-center h-full">
            <AIChatWelcome onQuestionClick={onQuestionClick} />
          </div>
        ) : (
          renderedMessages
        )}

        {/* Typing indicator */}
        {typingUsers.size > 0 && (
          <div className="flex items-center gap-2 py-2 px-4">
            <div className="flex gap-1">
              <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" />
              <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: "0.2s" }} />
              <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: "0.4s" }} />
            </div>
            <span className="text-sm text-gray-500 dark:text-gray-400">печатает...</span>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Scroll to bottom button */}
      {!isAtBottom && (
        <button
          onClick={() => scrollToBottom()}
          className="absolute bottom-24 right-6 p-3 bg-white dark:bg-gray-800 rounded-full shadow-lg border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700 transition-all hover:scale-105"
        >
          <ChevronDown className="w-5 h-5 text-gray-600 dark:text-gray-300" />
        </button>
      )}

      {/* Context menu */}
      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          message={contextMenu.message}
          isOwn={contextMenu.message.senderId === currentUserId}
          isGroupChat={isGroupChat}
          onClose={() => setContextMenu(null)}
          onReply={() => onReply?.(contextMenu.message)}
          onStartThread={() => onStartThread?.(contextMenu.message)}
          onEdit={() => onEdit?.(contextMenu.message)}
          onDelete={() => onDelete?.(contextMenu.message.id)}
          onForward={() => onForward?.(contextMenu.message)}
          onCopy={() => handleCopy(contextMenu.message)}
          onReaction={(emoji) => onReaction?.(contextMenu.message.id, emoji)}
        />
      )}
    </div>
  );
}
