"use client";

import { memo, useState, useCallback, useRef, useEffect } from "react";
import { Message, ChatUser } from "@/types/chat";
import { getUserName, getInitials, formatTime, getFileUrl, formatFileSize } from "@/lib/chat-utils";

// Компонент для lazy loading изображений с blur эффектом (как в Telegram/WhatsApp)
const LazyImage = memo(function LazyImage({
  src,
  alt,
  onClick,
  className = "",
}: {
  src: string;
  alt: string;
  onClick?: () => void;
  className?: string;
}) {
  const [isLoaded, setIsLoaded] = useState(false);
  const [isInView, setIsInView] = useState(false);
  const [hasError, setHasError] = useState(false);
  const imgRef = useRef<HTMLDivElement>(null);

  // IntersectionObserver для определения видимости
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setIsInView(true);
            observer.disconnect();
          }
        });
      },
      {
        rootMargin: "200px", // Начинаем загрузку за 200px до появления
        threshold: 0,
      }
    );

    if (imgRef.current) {
      observer.observe(imgRef.current);
    }

    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={imgRef}
      onClick={onClick}
      className={`relative overflow-hidden bg-gray-200 dark:bg-gray-700 cursor-pointer ${className}`}
      style={{ minHeight: "100px" }}
    >
      {/* Placeholder с blur эффектом */}
      {!isLoaded && !hasError && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
        </div>
      )}
      
      {/* Ошибка загрузки */}
      {hasError && (
        <div className="absolute inset-0 flex items-center justify-center text-gray-400">
          <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
        </div>
      )}
      
      {/* Изображение */}
      {isInView && !hasError && (
        <img
          src={src}
          alt={alt}
          className={`max-w-full h-auto transition-all duration-300 ${
            isLoaded ? "opacity-100 blur-0" : "opacity-0 blur-md"
          }`}
          onLoad={() => setIsLoaded(true)}
          onError={() => setHasError(true)}
        />
      )}
    </div>
  );
});

interface MessageItemProps {
  message: Message;
  currentUserId: string | null;
  isOwn: boolean;
  onReply?: (message: Message) => void;
  onEdit?: (message: Message) => void;
  onDelete?: (messageId: string) => void;
  onForward?: (message: Message) => void;
  onReaction?: (messageId: string, emoji: string) => void;
  onImageClick?: (url: string, name?: string) => void;
}

function MessageItemComponent({
  message,
  currentUserId,
  isOwn,
  onReply,
  onEdit,
  onDelete,
  onForward,
  onReaction,
  onImageClick,
}: MessageItemProps) {
  const [showActions, setShowActions] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);

  const handleDoubleClick = useCallback(() => {
    onReaction?.(message.id, "❤️");
  }, [message.id, onReaction]);

  const isDeleted = !!message.deletedAt;
  const hasAttachments = message.attachments && message.attachments.length > 0;
  const hasReactions = message.reactions && Object.keys(message.reactions).length > 0;

  if (isDeleted) {
    return (
      <div className={`flex ${isOwn ? "justify-end" : "justify-start"} mb-2`}>
        <div className="px-4 py-2 rounded-2xl bg-gray-100 dark:bg-gray-700 text-gray-400 dark:text-gray-500 italic text-sm">
          Сообщение удалено
        </div>
      </div>
    );
  }

  return (
    <div
      className={`flex ${isOwn ? "justify-end" : "justify-start"} mb-2 group`}
      onMouseEnter={() => setShowActions(true)}
      onMouseLeave={() => {
        setShowActions(false);
        setShowEmojiPicker(false);
      }}
      onDoubleClick={handleDoubleClick}
    >
      <div className={`flex items-end gap-2 max-w-[85%] md:max-w-[70%] ${isOwn ? "flex-row-reverse" : ""}`}>
        {/* Аватар для чужих сообщений */}
        {!isOwn && (
          <div className="flex-shrink-0 mb-1">
            <Avatar user={message.sender} size="sm" />
          </div>
        )}

        <div className="flex flex-col">
          {/* Ответ на сообщение */}
          {message.replyTo && (
            <ReplyPreview message={message.replyTo} isOwn={isOwn} />
          )}

          {/* Пересланное сообщение */}
          {message.forwardedFrom && (
            <ForwardedPreview message={message.forwardedFrom} isOwn={isOwn} />
          )}

          {/* Основной контент */}
          <div
            className={`relative px-4 py-2 rounded-2xl ${
              isOwn
                ? "bg-blue-500 text-white rounded-br-md"
                : "bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-white rounded-bl-md"
            }`}
          >
            {/* Вложения */}
            {hasAttachments && (
              <Attachments
                attachments={message.attachments!}
                isOwn={isOwn}
                onImageClick={onImageClick}
              />
            )}

            {/* Текст сообщения */}
            {message.content && (
              <p className="whitespace-pre-wrap break-words text-sm md:text-base">
                {message.content}
              </p>
            )}

            {/* Время и статус редактирования */}
            <div
              className={`flex items-center gap-1 mt-1 text-xs ${
                isOwn ? "text-blue-100" : "text-gray-500 dark:text-gray-400"
              }`}
            >
              <span>{formatTime(message.createdAt)}</span>
              {message.editedAt && <span>(ред.)</span>}
            </div>
          </div>

          {/* Реакции */}
          {hasReactions && (
            <Reactions
              reactions={message.reactions!}
              currentUserId={currentUserId}
              isOwn={isOwn}
              onReaction={(emoji) => onReaction?.(message.id, emoji)}
            />
          )}
        </div>

        {/* Действия */}
        {showActions && (
          <MessageActions
            message={message}
            isOwn={isOwn}
            showEmojiPicker={showEmojiPicker}
            onToggleEmojiPicker={() => setShowEmojiPicker(!showEmojiPicker)}
            onReply={() => onReply?.(message)}
            onEdit={() => onEdit?.(message)}
            onDelete={() => onDelete?.(message.id)}
            onForward={() => onForward?.(message)}
            onReaction={(emoji) => {
              onReaction?.(message.id, emoji);
              setShowEmojiPicker(false);
            }}
          />
        )}
      </div>
    </div>
  );
}

// Подкомпоненты
const Avatar = memo(function Avatar({ user, size }: { user: ChatUser; size: "sm" | "md" }) {
  const sizeClass = size === "sm" ? "w-8 h-8 text-xs" : "w-10 h-10 text-sm";
  
  if (user.avatarUrl) {
    return (
      <img
        src={getFileUrl(user.avatarUrl)}
        alt={getUserName(user)}
        className={`${sizeClass} rounded-full object-cover`}
      />
    );
  }

  return (
    <div className={`${sizeClass} rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white font-semibold`}>
      {getInitials(user)}
    </div>
  );
});

const ReplyPreview = memo(function ReplyPreview({
  message,
  isOwn,
}: {
  message: Message;
  isOwn: boolean;
}) {
  return (
    <div
      className={`mb-1 px-3 py-1.5 rounded-lg border-l-2 ${
        isOwn
          ? "bg-blue-400/30 border-blue-300"
          : "bg-gray-200 dark:bg-gray-600 border-gray-400"
      }`}
    >
      <p className={`text-xs font-medium ${isOwn ? "text-blue-100" : "text-gray-600 dark:text-gray-300"}`}>
        {getUserName(message.sender)}
      </p>
      <p className={`text-xs truncate ${isOwn ? "text-blue-50" : "text-gray-500 dark:text-gray-400"}`}>
        {message.content || "[Вложение]"}
      </p>
    </div>
  );
});

const ForwardedPreview = memo(function ForwardedPreview({
  message,
  isOwn,
}: {
  message: Message;
  isOwn: boolean;
}) {
  return (
    <div className={`mb-1 text-xs ${isOwn ? "text-blue-100" : "text-gray-500 dark:text-gray-400"}`}>
      <span className="flex items-center gap-1">
        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
        </svg>
        Переслано от {getUserName(message.sender)}
      </span>
    </div>
  );
});

const Attachments = memo(function Attachments({
  attachments,
  isOwn,
  onImageClick,
}: {
  attachments: NonNullable<Message["attachments"]>;
  isOwn: boolean;
  onImageClick?: (url: string, name?: string) => void;
}) {
  return (
    <div className="mb-2 space-y-2">
      {attachments.map((attachment) => {
        const isImage = attachment.mimeType?.startsWith("image/") || 
                       ["jpg", "jpeg", "png", "gif", "webp"].some(ext => 
                         attachment.fileName.toLowerCase().endsWith(ext));

        if (isImage) {
          return (
            <LazyImage
              key={attachment.id}
              src={getFileUrl(attachment.filePath)}
              alt={attachment.originalName}
              onClick={() => onImageClick?.(getFileUrl(attachment.filePath), attachment.originalName)}
              className="rounded-lg max-w-[300px] hover:opacity-90 transition-opacity"
            />
          );
        }

        return (
          <a
            key={attachment.id}
            href={getFileUrl(attachment.filePath)}
            download={attachment.originalName}
            target="_blank"
            rel="noopener noreferrer"
            className={`flex items-center gap-2 p-2 rounded-lg ${
              isOwn ? "bg-blue-400/30" : "bg-gray-200 dark:bg-gray-600"
            }`}
          >
            <svg className="w-8 h-8 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
            </svg>
            <div className="min-w-0 flex-1">
              <p className={`text-sm font-medium truncate ${isOwn ? "text-white" : "text-gray-900 dark:text-white"}`}>
                {attachment.originalName}
              </p>
              <p className={`text-xs ${isOwn ? "text-blue-100" : "text-gray-500 dark:text-gray-400"}`}>
                {formatFileSize(attachment.fileSize)}
              </p>
            </div>
          </a>
        );
      })}
    </div>
  );
});

const Reactions = memo(function Reactions({
  reactions,
  currentUserId,
  isOwn,
  onReaction,
}: {
  reactions: NonNullable<Message["reactions"]>;
  currentUserId: string | null;
  isOwn: boolean;
  onReaction: (emoji: string) => void;
}) {
  const reactionList = Object.entries(reactions).map(([emoji, data]) => {
    const userIds = data.userIds || [];
    const isLiked = currentUserId ? userIds.includes(currentUserId) : false;
    return { emoji, count: userIds.length, isLiked };
  }).filter(r => r.count > 0);

  if (reactionList.length === 0) return null;

  return (
    <div className={`flex flex-wrap gap-1 mt-1 ${isOwn ? "justify-end" : "justify-start"}`}>
      {reactionList.map(({ emoji, count, isLiked }) => (
        <button
          key={emoji}
          onClick={() => onReaction(emoji)}
          className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-xs transition-colors ${
            isLiked
              ? "bg-blue-100 dark:bg-blue-900/50 text-blue-600 dark:text-blue-400"
              : "bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-600"
          }`}
        >
          <span>{emoji}</span>
          <span>{count}</span>
        </button>
      ))}
    </div>
  );
});

const MessageActions = memo(function MessageActions({
  message,
  isOwn,
  showEmojiPicker,
  onToggleEmojiPicker,
  onReply,
  onEdit,
  onDelete,
  onForward,
  onReaction,
}: {
  message: Message;
  isOwn: boolean;
  showEmojiPicker: boolean;
  onToggleEmojiPicker: () => void;
  onReply: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onForward: () => void;
  onReaction: (emoji: string) => void;
}) {
  const [showDropdown, setShowDropdown] = useState(false);
  const quickEmojis = ["❤️", "👍", "😂", "😮", "😢", "🔥"];

  const handleAction = (action: () => void) => {
    action();
    setShowDropdown(false);
  };

  return (
    <div className={`relative flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity ${isOwn ? "mr-2" : "ml-2"}`}>
      {/* Quick emoji picker */}
      {showEmojiPicker && (
        <div className="absolute bottom-full mb-1 flex items-center gap-1 bg-white dark:bg-gray-800 rounded-full shadow-lg px-2 py-1 border border-gray-200 dark:border-gray-700 z-20">
          {quickEmojis.map((emoji) => (
            <button
              key={emoji}
              onClick={() => onReaction(emoji)}
              className="hover:scale-125 transition-transform p-1"
            >
              {emoji}
            </button>
          ))}
        </div>
      )}

      {/* Три точки - кнопка меню */}
      <button
        onClick={() => setShowDropdown(!showDropdown)}
        className="p-2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 bg-white dark:bg-gray-800 rounded-full shadow-lg border border-gray-200 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
        title="Действия"
      >
        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
          <circle cx="12" cy="5" r="2" />
          <circle cx="12" cy="12" r="2" />
          <circle cx="12" cy="19" r="2" />
        </svg>
      </button>

      {/* Dropdown меню */}
      {showDropdown && (
        <div 
          className={`absolute ${isOwn ? "right-0" : "left-0"} bottom-full mb-1 bg-white dark:bg-gray-800 rounded-xl shadow-xl border border-gray-200 dark:border-gray-700 py-1 min-w-[160px] z-30`}
        >
          <DropdownItem
            icon="emoji"
            label="Реакция"
            onClick={() => {
              onToggleEmojiPicker();
              setShowDropdown(false);
            }}
          />
          <DropdownItem
            icon="reply"
            label="Ответить"
            onClick={() => handleAction(onReply)}
          />
          <DropdownItem
            icon="forward"
            label="Переслать"
            onClick={() => handleAction(onForward)}
          />
          {isOwn && (
            <>
              <div className="border-t border-gray-200 dark:border-gray-700 my-1" />
              <DropdownItem
                icon="edit"
                label="Редактировать"
                onClick={() => handleAction(onEdit)}
              />
              <DropdownItem
                icon="delete"
                label="Удалить"
                onClick={() => handleAction(onDelete)}
                danger
              />
            </>
          )}
        </div>
      )}
    </div>
  );
});

const DropdownItem = memo(function DropdownItem({
  icon,
  label,
  onClick,
  danger = false,
}: {
  icon: "emoji" | "reply" | "forward" | "edit" | "delete";
  label: string;
  onClick: () => void;
  danger?: boolean;
}) {
  const icons = {
    emoji: "M14.828 14.828a4 4 0 01-5.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z",
    reply: "M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6",
    forward: "M13 7l5 5m0 0l-5 5m5-5H6",
    edit: "M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z",
    delete: "M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16",
  };

  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-3 px-4 py-2 text-sm transition-colors ${
        danger 
          ? "text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20" 
          : "text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700"
      }`}
    >
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={icons[icon]} />
      </svg>
      <span>{label}</span>
    </button>
  );
});

export const MessageItem = memo(MessageItemComponent);
export default MessageItem;

