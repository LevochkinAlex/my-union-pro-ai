"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
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
} from "lucide-react";
import EmojiPicker from "./EmojiPicker";

// ============================================================================
// ТИПЫ
// ============================================================================

export interface MessageSender {
  id: string;
  firstName?: string | null;
  lastName?: string | null;
  middleName?: string | null;
  avatarUrl?: string | null;
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
}

export interface SlackStyleMessagesProps {
  messages: Message[];
  currentUserId: string;
  typingUsers: Set<string>;
  isTicketChat?: boolean;
  isGroupChat?: boolean; // Для определения типа чата (групповой или приватный)
  onReply?: (message: Message) => void;
  onEdit?: (message: Message) => void;
  onDelete?: (messageId: string) => void;
  onReaction?: (messageId: string, emoji: string) => void;
  onOpenThread?: (message: Message) => void;
  onForward?: (message: Message) => void;
  onImageClick?: (url: string, name?: string) => void;
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

function getAttachmentUrl(att: MessageAttachment): string {
  return att.url || att.filePath || '';
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
  onClose: () => void;
  onReply?: () => void;
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
  onClose,
  onReply,
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
        <button
          onClick={() => { onReply?.(); onClose(); }}
          className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700"
        >
          <Reply className="w-4 h-4" />
          Ответить
        </button>
        
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
            return (
              <button
                key={img.id || idx}
                onClick={() => onImageClick?.(url, name)}
                className="relative group overflow-hidden rounded-xl"
              >
                <img
                  src={img.thumbnailUrl || url}
                  alt={name}
                  className="w-full max-w-[300px] max-h-[300px] object-cover rounded-xl transition-transform group-hover:scale-105"
                  loading="lazy"
                />
                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors rounded-xl" />
              </button>
            );
          })}
        </div>
      )}

      {/* Files */}
      {files.map((file, idx) => {
        const url = getAttachmentUrl(file);
        const name = getAttachmentName(file);
        const size = getAttachmentSize(file);
        
        return (
          <a
            key={file.id || idx}
            href={url}
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
      })}
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
  onReaction?: (emoji: string) => void;
  onOpenThread?: () => void;
  onImageClick?: (url: string, name?: string) => void;
  isGroupChat?: boolean;
}

function MessageBubble({
  message,
  isOwn,
  showAvatar,
  showName,
  currentUserId,
  onContextMenu,
  onReaction,
  onOpenThread,
  onImageClick,
  isGroupChat = false,
}: MessageBubbleProps) {
  const isDeleted = !!message.deletedAt;

  return (
    <div 
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
      <div className={`max-w-[70%] ${isOwn ? 'items-end' : 'items-start'}`}>
        {/* Sender name */}
        {showName && !isOwn && (
          <div className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-1 ml-1">
            {getSenderName(message.sender)}
          </div>
        )}

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
          group relative rounded-2xl px-4 py-2.5
          ${message.reactions && Object.keys(message.reactions).length > 0 ? 'pb-8' : 'pb-2.5'}
          ${isOwn 
            ? 'bg-blue-500 text-white rounded-br-md' 
            : 'bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-bl-md'
          }
          ${isDeleted ? 'opacity-60' : ''}
        `}>
          {isDeleted ? (
            <div className={`italic text-sm opacity-70 ${isOwn ? 'text-white' : 'text-gray-600 dark:text-gray-400'}`}>
              Сообщение удалено
            </div>
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
              {message.content && (
                <div className={`
                  text-[15px] leading-relaxed break-words
                  ${isOwn ? '!text-white' : 'text-gray-900 dark:text-gray-100'}
                  prose prose-sm max-w-none
                  ${isOwn 
                    ? 'prose-invert [&_*]:!text-white [&_p]:!text-white [&_strong]:!text-white [&_em]:!text-white [&_li]:!text-white [&_h1]:!text-white [&_h2]:!text-white [&_h3]:!text-white [&_h4]:!text-white [&_h5]:!text-white [&_h6]:!text-white [&_blockquote]:!text-white [&_blockquote]:border-blue-300 [&_a]:!text-blue-200 [&_a]:underline hover:[&_a]:!text-blue-100 [&_code]:!text-blue-100 [&_code]:bg-blue-400/30 [&_pre]:bg-blue-400/20 [&_pre]:!text-white' 
                    : '[&_p]:text-gray-900 dark:[&_p]:text-gray-100 [&_strong]:text-gray-900 dark:[&_strong]:text-gray-100 [&_em]:text-gray-900 dark:[&_em]:text-gray-100 [&_li]:text-gray-900 dark:[&_li]:text-gray-100 [&_h1]:text-gray-900 dark:[&_h1]:text-gray-100 [&_h2]:text-gray-900 dark:[&_h2]:text-gray-100 [&_h3]:text-gray-900 dark:[&_h3]:text-gray-100 [&_h4]:text-gray-900 dark:[&_h4]:text-gray-100 [&_h5]:text-gray-900 dark:[&_h5]:text-gray-100 [&_h6]:text-gray-900 dark:[&_h6]:text-gray-100 [&_a]:text-blue-600 dark:[&_a]:text-blue-400 [&_code]:text-gray-900 dark:[&_code]:text-gray-100'
                  }
                `}>
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>
                    {message.content}
                  </ReactMarkdown>
                </div>
              )}
            </>
          )}

          {/* Time and status */}
          <div className={`
            flex items-center gap-1 mt-1 text-[10px] relative z-10
            ${isOwn ? 'text-blue-100/70 justify-end' : 'text-gray-400 dark:text-gray-500'}
            ${message.reactions && Object.keys(message.reactions).length > 0 ? (isOwn ? 'mr-16' : 'ml-16') : ''}
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

          {/* Reactions - абсолютное позиционирование внутри бабла, как в Telegram/WhatsApp */}
          {!isDeleted && message.reactions && (
            <div className={`
              absolute bottom-2.5 flex flex-wrap gap-0.5 z-20
              ${isOwn ? 'right-2' : 'left-2'}
            `}>
              <MessageReactionsDisplay
                reactions={message.reactions}
                currentUserId={currentUserId}
                onToggle={(emoji) => onReaction?.(emoji)}
                isGroupChat={isGroupChat}
              />
            </div>
          )}
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
}

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
  onReply,
  onEdit,
  onDelete,
  onReaction,
  onOpenThread,
  onForward,
  onImageClick,
}: SlackStyleMessagesProps) {
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [isAtBottom, setIsAtBottom] = useState(true);
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

  useEffect(() => {
    if (isAtBottom) {
      scrollToBottom();
    }
  }, [messages.length, isAtBottom, scrollToBottom]);

  const handleScroll = useCallback(() => {
    if (!containerRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = containerRef.current;
    setIsAtBottom(scrollHeight - scrollTop - clientHeight < 100);
  }, []);

  const handleContextMenu = useCallback((e: React.MouseEvent, message: Message) => {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY, message });
  }, []);

  const handleCopy = useCallback((message: Message) => {
    navigator.clipboard.writeText(message.content);
  }, []);

  return (
    <div
      ref={containerRef}
      className="flex-1 overflow-y-auto bg-gray-50 dark:bg-gray-900"
      onScroll={handleScroll}
    >
      <div className="py-4 px-4 space-y-1 min-h-full">
        {messages.map((message, index) => {
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
                  onReaction={(emoji) => onReaction?.(message.id, emoji)}
                  onOpenThread={() => onOpenThread?.(message)}
                  onImageClick={onImageClick}
                  isGroupChat={isGroupChat}
                />
              </div>
            </div>
          );
        })}

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
          onClose={() => setContextMenu(null)}
          onReply={() => onReply?.(contextMenu.message)}
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
