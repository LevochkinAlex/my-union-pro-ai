"use client";

import { memo, useState, useCallback, useRef, useEffect, useMemo } from "react";
import { Message, ChatUser } from "@/types/chat";
import { getUserName, getInitials, formatTime, getFileUrl, formatFileSize } from "@/lib/chat-utils";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

// URL регулярное выражение для детекции ссылок
const URL_REGEX = /(https?:\/\/[^\s<>"{}|\\^`[\]]+)/gi;

// Типизированный интерфейс для link preview
interface LinkPreview {
  url: string;
  title: string | null;
  description: string | null;
  image: string | null;
  siteName: string | null;
  favicon: string | null;
}

// Иконки для типов файлов
const FileTypeIcon = memo(function FileTypeIcon({ 
  mimeType, 
  fileName,
  className = "w-6 h-6"
}: { 
  mimeType?: string;
  fileName: string;
  className?: string;
}) {
  const ext = fileName.split('.').pop()?.toLowerCase();
  
  // PDF
  if (mimeType === 'application/pdf' || ext === 'pdf') {
    return (
      <div className={`${className} rounded-lg bg-red-500 flex items-center justify-center`}>
        <span className="text-white text-xs font-bold">PDF</span>
      </div>
    );
  }
  
  // Word documents
  if (mimeType?.includes('word') || ext === 'doc' || ext === 'docx') {
    return (
      <div className={`${className} rounded-lg bg-blue-600 flex items-center justify-center`}>
        <span className="text-white text-xs font-bold">DOC</span>
      </div>
    );
  }
  
  // Excel
  if (mimeType?.includes('spreadsheet') || mimeType?.includes('excel') || ext === 'xls' || ext === 'xlsx') {
    return (
      <div className={`${className} rounded-lg bg-green-600 flex items-center justify-center`}>
        <span className="text-white text-xs font-bold">XLS</span>
      </div>
    );
  }
  
  // Archive
  if (mimeType?.includes('zip') || mimeType?.includes('rar') || mimeType?.includes('archive') || 
      ['zip', 'rar', '7z', 'tar', 'gz'].includes(ext || '')) {
    return (
      <div className={`${className} rounded-lg bg-yellow-500 flex items-center justify-center`}>
        <span className="text-white text-xs font-bold">ZIP</span>
      </div>
    );
  }
  
  // Text files
  if (mimeType?.includes('text') || ext === 'txt') {
    return (
      <div className={`${className} rounded-lg bg-gray-500 flex items-center justify-center`}>
        <span className="text-white text-xs font-bold">TXT</span>
      </div>
    );
  }
  
  // CSV
  if (ext === 'csv') {
    return (
      <div className={`${className} rounded-lg bg-emerald-500 flex items-center justify-center`}>
        <span className="text-white text-xs font-bold">CSV</span>
      </div>
    );
  }
  
  // Default file icon
  return (
    <div className={`${className} rounded-lg bg-gray-400 flex items-center justify-center`}>
      <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
      </svg>
    </div>
  );
});

// Компонент для lazy loading изображений с blur эффектом (как в WhatsApp)
const LazyImage = memo(function LazyImage({
  src,
  alt,
  onClick,
  className = "",
  isOldImage = false,
}: {
  src: string;
  alt: string;
  onClick?: () => void;
  className?: string;
  isOldImage?: boolean;
}) {
  const [isLoaded, setIsLoaded] = useState(false);
  const [hasError, setHasError] = useState(false);
  const [showImage, setShowImage] = useState(!isOldImage);
  const imgRef = useRef<HTMLImageElement>(null);

  const handleDownload = (e: React.MouseEvent) => {
    e.stopPropagation();
    setShowImage(true);
  };

  const handleRetry = (e: React.MouseEvent) => {
    e.stopPropagation();
    setHasError(false);
    setIsLoaded(false);
    if (imgRef.current) {
      const currentSrc = imgRef.current.src;
      imgRef.current.src = '';
      setTimeout(() => {
        if (imgRef.current) imgRef.current.src = currentSrc;
      }, 100);
    }
  };

  const shouldShowPlaceholder = isOldImage && !showImage;

  return (
    <div
      className={`relative overflow-hidden rounded-lg ${onClick ? "cursor-pointer" : ""} ${className}`}
      style={{ 
        width: "100%",
        minHeight: shouldShowPlaceholder ? "150px" : undefined,
        aspectRatio: shouldShowPlaceholder ? "4/3" : undefined,
      }}
    >
      {shouldShowPlaceholder && (
        <div className="absolute inset-0 flex flex-col items-center justify-center overflow-hidden bg-gradient-to-br from-blue-500/20 via-purple-500/20 to-pink-500/20">
          <div className="absolute inset-0 backdrop-blur-xl bg-black/10" />
          <div className="relative z-10 flex flex-col items-center gap-2">
            <div className="p-2 rounded-full bg-white/20">
              <svg className="w-6 h-6 text-white/80" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
            </div>
            <button
              onClick={handleDownload}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-white/90 dark:bg-gray-800/90 rounded-full shadow-lg text-xs font-medium text-gray-900 dark:text-white hover:scale-105 transition-transform"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
              Загрузить
            </button>
          </div>
        </div>
      )}

      {hasError && (
        <div className="flex flex-col items-center justify-center py-8 text-gray-400 bg-gray-100 dark:bg-gray-800 rounded-lg">
          <svg className="w-8 h-8 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
          <span className="text-xs mb-2">Ошибка загрузки</span>
          <button
            onClick={handleRetry}
            className="px-3 py-1 text-xs bg-gray-200 dark:bg-gray-700 rounded-full hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
          >
            Повторить
          </button>
        </div>
      )}
      
      {showImage && !hasError && (
        <div className="relative">
          {!isLoaded && (
            <div className="absolute inset-0 flex items-center justify-center bg-gray-100 dark:bg-gray-800 rounded-lg">
              <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
            </div>
          )}
          <img
            ref={imgRef}
            src={src}
            alt={alt}
            onClick={onClick}
            loading={isOldImage ? "lazy" : "eager"}
            decoding="async"
            onLoad={() => setIsLoaded(true)}
            onError={() => {
              setHasError(true);
              setIsLoaded(true);
            }}
            className={`max-w-full max-h-[400px] w-full h-auto object-contain rounded-lg transition-opacity duration-200 ${
              isLoaded ? "opacity-100" : "opacity-0"
            }`}
            style={{ maxWidth: "100%", height: "auto" }}
          />
        </div>
      )}
    </div>
  );
});

interface MessageItemProps {
  message: Message;
  currentUserId: string | null;
  isOwn: boolean;
  isOldMessage?: boolean;
  showSenderName?: boolean;
  onReply?: (message: Message) => void;
  onEdit?: (message: Message) => void;
  onDelete?: (messageId: string) => void;
  onForward?: (message: Message) => void;
  onReaction?: (messageId: string, emoji: string) => void;
  onImageClick?: (url: string, name?: string) => void;
  onProfileClick?: (userId: string) => void;
}

const QUICK_EMOJIS = ["😊", "👍", "❤️", "🤝", "✌️", "⚡", "🔥"];

function MessageItemComponent({
  message,
  currentUserId,
  isOwn,
  isOldMessage = false,
  showSenderName = false,
  onReply,
  onEdit,
  onDelete,
  onForward,
  onReaction,
  onImageClick,
  onProfileClick,
}: MessageItemProps) {
  const [showContextMenu, setShowContextMenu] = useState(false);
  const [contextMenuPos, setContextMenuPos] = useState({ x: 0, y: 0 });
  const [isHovered, setIsHovered] = useState(false);
  const [swipeX, setSwipeX] = useState(0);
  const [isSwiping, setIsSwiping] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const touchStartRef = useRef<{ x: number; y: number; time: number } | null>(null);
  const longPressTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Закрытие контекстного меню при клике вне
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent | TouchEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setShowContextMenu(false);
      }
    };
    
    if (showContextMenu) {
      document.addEventListener("mousedown", handleClickOutside);
      document.addEventListener("touchstart", handleClickOutside);
      return () => {
        document.removeEventListener("mousedown", handleClickOutside);
        document.removeEventListener("touchstart", handleClickOutside);
      };
    }
  }, [showContextMenu]);

  // Long press для мобильных - открывает контекстное меню
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    const touch = e.touches[0];
    touchStartRef.current = { x: touch.clientX, y: touch.clientY, time: Date.now() };
    
    longPressTimerRef.current = setTimeout(() => {
      // Вибрация на устройствах с поддержкой
      if (navigator.vibrate) navigator.vibrate(50);
      
      const rect = containerRef.current?.getBoundingClientRect();
      if (rect) {
        const x = Math.min(touch.clientX, window.innerWidth - 220);
        const y = Math.min(touch.clientY - 50, window.innerHeight - 400);
        setContextMenuPos({ x, y: Math.max(y, 50) });
      }
      setShowContextMenu(true);
      touchStartRef.current = null;
    }, 500);
  }, []);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (!touchStartRef.current) return;
    
    const touch = e.touches[0];
    const deltaX = touch.clientX - touchStartRef.current.x;
    const deltaY = Math.abs(touch.clientY - touchStartRef.current.y);
    
    // Если двигаемся больше по Y - отменяем свайп
    if (deltaY > 30) {
      if (longPressTimerRef.current) clearTimeout(longPressTimerRef.current);
      touchStartRef.current = null;
      setSwipeX(0);
      setIsSwiping(false);
      return;
    }
    
    // Отменяем long press если начали свайп
    if (Math.abs(deltaX) > 10) {
      if (longPressTimerRef.current) clearTimeout(longPressTimerRef.current);
    }
    
    // Свайп вправо для ответа (только для чужих сообщений) или влево (для своих)
    const maxSwipe = 80;
    if ((!isOwn && deltaX > 0) || (isOwn && deltaX < 0)) {
      const clampedX = Math.min(Math.abs(deltaX), maxSwipe) * (deltaX > 0 ? 1 : -1);
      setSwipeX(clampedX);
      setIsSwiping(true);
    }
  }, [isOwn]);

  const handleTouchEnd = useCallback(() => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
    }
    
    // Если свайп достаточный - вызываем ответ
    if (Math.abs(swipeX) > 60 && onReply) {
      if (navigator.vibrate) navigator.vibrate(30);
      onReply(message);
    }
    
    touchStartRef.current = null;
    setSwipeX(0);
    setIsSwiping(false);
  }, [swipeX, onReply, message]);

  // Обработчик правого клика (десктоп)
  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    const rect = containerRef.current?.getBoundingClientRect();
    if (rect) {
      const x = Math.min(e.clientX, window.innerWidth - 220);
      const y = Math.min(e.clientY, window.innerHeight - 350);
      setContextMenuPos({ x, y });
    }
    setShowContextMenu(true);
  }, []);

  // Быстрая реакция по двойному клику/тапу
  const handleDoubleClick = useCallback(() => {
    if (navigator.vibrate) navigator.vibrate(30);
    onReaction?.(message.id, "❤️");
  }, [message.id, onReaction]);

  // Быстрая реакция кнопкой при наведении (десктоп)
  const handleQuickReaction = useCallback(() => {
    onReaction?.(message.id, "❤️");
  }, [message.id, onReaction]);

  const handleReaction = useCallback((emoji: string) => {
    onReaction?.(message.id, emoji);
    setShowContextMenu(false);
  }, [message.id, onReaction]);

  const handleAction = useCallback((action: () => void) => {
    action();
    setShowContextMenu(false);
  }, []);

  const isDeleted = !!message.deletedAt;
  const hasAttachments = message.attachments && message.attachments.length > 0;
  const hasReactions = message.reactions && Object.keys(message.reactions).length > 0;

  if (isDeleted) {
    return (
      <div className={`flex ${isOwn ? "justify-end" : "justify-start"} mb-2 px-4`}>
        <div className="px-4 py-2 rounded-2xl bg-gray-100 dark:bg-gray-700 text-gray-400 dark:text-gray-500 italic text-sm">
          Сообщение удалено
        </div>
      </div>
    );
  }

  return (
    <>
      <div
        ref={containerRef}
        className={`flex ${isOwn ? "justify-end" : "justify-start"} mb-2 px-2 sm:px-4 w-full min-w-0 relative`}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        onContextMenu={handleContextMenu}
        onDoubleClick={handleDoubleClick}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onTouchCancel={handleTouchEnd}
      >
        {/* Индикатор свайпа для ответа */}
        {isSwiping && Math.abs(swipeX) > 20 && (
          <div 
            className={`absolute ${isOwn ? "right-full mr-2" : "left-full ml-2"} top-1/2 -translate-y-1/2 transition-opacity`}
            style={{ opacity: Math.min(Math.abs(swipeX) / 60, 1) }}
          >
            <div className={`w-8 h-8 rounded-full bg-blue-500 flex items-center justify-center text-white shadow-lg ${Math.abs(swipeX) > 60 ? "scale-110" : ""} transition-transform`}>
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
              </svg>
            </div>
          </div>
        )}
        
        <div 
          className={`flex items-end gap-2 max-w-[90%] sm:max-w-[85%] md:max-w-[70%] min-w-0 ${isOwn ? "flex-row-reverse" : ""}`}
          style={{ 
            transform: isSwiping ? `translateX(${swipeX}px)` : undefined,
            transition: isSwiping ? "none" : "transform 0.2s ease-out"
          }}
        >
          {/* Аватар для чужих сообщений */}
          {!isOwn && (
            <button 
              className="flex-shrink-0 mb-1 cursor-pointer hover:opacity-80 transition-opacity"
              onClick={() => message.sender?.id && onProfileClick?.(message.sender.id)}
              title={`Открыть профиль ${getUserName(message.sender)}`}
            >
              <Avatar user={message.sender} size="sm" />
            </button>
          )}

          <div className="flex flex-col relative min-w-0 flex-1">
            {/* Имя отправителя для групповых чатов */}
            {!isOwn && showSenderName && message.sender && (
              <button
                className="text-xs font-medium text-blue-600 dark:text-blue-400 hover:underline text-left mb-0.5 ml-1 truncate"
                onClick={() => message.sender?.id && onProfileClick?.(message.sender.id)}
              >
                {getUserName(message.sender)}
              </button>
            )}

            {/* Ответ на сообщение */}
            {message.replyTo && (
              <ReplyPreview message={message.replyTo} isOwn={isOwn} />
            )}

            {/* Пересланное сообщение */}
            {message.forwardedFrom && (
              <ForwardedPreview message={message.forwardedFrom} isOwn={isOwn} />
            )}

            {/* Основной контент с кнопкой реакции */}
            <div className="relative">
              {/* Бабл сообщения */}
              <div
                className={`px-3 sm:px-4 py-2 rounded-2xl min-w-0 max-w-full w-full overflow-hidden transition-opacity ${
                  isOwn
                    ? "bg-blue-500 text-white rounded-br-md"
                    : "bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-white rounded-bl-md"
                } ${(message as any)._isPending ? "opacity-70" : ""}`}
              >
                {/* Вложения */}
                {hasAttachments && (
                  <Attachments
                    attachments={message.attachments!}
                    isOwn={isOwn}
                    isOldMessage={isOldMessage}
                    onImageClick={onImageClick}
                  />
                )}

                {/* Текст сообщения с обнаружением ссылок */}
                {message.content && (
                  <MessageContent content={message.content} isOwn={isOwn} />
                )}

                {/* Время и статус редактирования/отправки */}
                <div
                  className={`flex items-center gap-1 mt-1 text-xs ${
                    isOwn ? "text-blue-100" : "text-gray-500 dark:text-gray-400"
                  }`}
                >
                  <span>{formatTime(message.createdAt)}</span>
                  {message.editedAt && <span>(ред.)</span>}
                  {/* Индикатор статуса отправки */}
                  {isOwn && (
                    (message as any)._isPending ? (
                      <svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                    ) : (
                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                    )
                  )}
                </div>
              </div>

              {/* Кнопка быстрой реакции при наведении (только десктоп) */}
              {isHovered && !isSwiping && (
                <button
                  onClick={handleQuickReaction}
                  className={`hidden sm:flex absolute ${isOwn ? "-left-4" : "-right-4"} top-1/2 -translate-y-1/2 w-8 h-8 items-center justify-center bg-white dark:bg-gray-800 rounded-full shadow-lg border border-gray-200 dark:border-gray-600 hover:scale-110 transition-transform z-10`}
                  title="Поставить ❤️"
                >
                  <span className="text-base">❤️</span>
                </button>
              )}
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
        </div>
      </div>

      {/* Контекстное меню (телеграм-стиль) */}
      {showContextMenu && (
        <ContextMenu
          ref={menuRef}
          position={contextMenuPos}
          isOwn={isOwn}
          onReaction={handleReaction}
          onReply={() => handleAction(() => onReply?.(message))}
          onEdit={() => handleAction(() => onEdit?.(message))}
          onDelete={() => handleAction(() => onDelete?.(message.id))}
          onForward={() => handleAction(() => onForward?.(message))}
          onCopyText={() => {
            navigator.clipboard.writeText(message.content || "");
            setShowContextMenu(false);
          }}
        />
      )}
    </>
  );
}

// Контекстное меню в стиле Telegram
const ContextMenu = memo(function ContextMenu({
  ref,
  position,
  isOwn,
  onReaction,
  onReply,
  onEdit,
  onDelete,
  onForward,
  onCopyText,
}: {
  ref?: React.Ref<HTMLDivElement>;
  position: { x: number; y: number };
  isOwn: boolean;
  onReaction: (emoji: string) => void;
  onReply: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onForward: () => void;
  onCopyText: () => void;
}) {
  return (
    <div
      ref={ref}
      className="fixed z-50 bg-white dark:bg-gray-800 rounded-2xl shadow-2xl border border-gray-200 dark:border-gray-700 py-2 min-w-[200px] animate-in fade-in zoom-in-95 duration-100"
      style={{ left: position.x, top: position.y }}
    >
      {/* Панель быстрых реакций */}
      <div className="flex items-center justify-center gap-1 px-3 py-2 border-b border-gray-200 dark:border-gray-700">
        {QUICK_EMOJIS.map((emoji) => (
          <button
            key={emoji}
            onClick={() => onReaction(emoji)}
            className="w-9 h-9 flex items-center justify-center text-xl hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full transition-colors hover:scale-110"
          >
            {emoji}
          </button>
        ))}
      </div>

      {/* Действия */}
      <div className="py-1">
        <MenuItem
          icon={
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
            </svg>
          }
          label="Ответить"
          onClick={onReply}
        />
        
        {isOwn && (
          <MenuItem
            icon={
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
              </svg>
            }
            label="Редактировать"
            onClick={onEdit}
          />
        )}

        <MenuItem
          icon={
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
            </svg>
          }
          label="Копировать текст"
          onClick={onCopyText}
        />

        <MenuItem
          icon={
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 7l5 5m0 0l-5 5m5-5H6" />
            </svg>
          }
          label="Переслать"
          onClick={onForward}
        />

        {isOwn && (
          <>
            <div className="border-t border-gray-200 dark:border-gray-700 my-1" />
            <MenuItem
              icon={
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              }
              label="Удалить"
              onClick={onDelete}
              danger
            />
          </>
        )}
      </div>
    </div>
  );
});

const MenuItem = memo(function MenuItem({
  icon,
  label,
  onClick,
  danger = false,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-3 px-4 py-2.5 text-sm transition-colors ${
        danger 
          ? "text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20" 
          : "text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700"
      }`}
    >
      {icon}
      <span className="font-medium">{label}</span>
    </button>
  );
});

// Подкомпоненты
const Avatar = memo(function Avatar({ user, size }: { user: ChatUser | null; size: "sm" | "md" }) {
  const sizeClass = size === "sm" ? "w-8 h-8 text-xs" : "w-10 h-10 text-sm";
  
  // Проверка на null для оптимистичных сообщений
  if (!user) {
    return (
      <div className={`${sizeClass} rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white font-semibold`}>
        <svg className={`${size === "sm" ? "w-4 h-4" : "w-5 h-5"}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
        </svg>
      </div>
    );
  }
  
  if (user.avatarUrl) {
    return (
      <img
        src={getFileUrl(user.avatarUrl)}
        alt={getUserName(user)}
        className={`${sizeClass} rounded-full object-cover`}
      />
    );
  }

  const initials = getInitials(user);
  const hasInitials = initials && initials !== "П" && initials.trim() !== "";

  return (
    <div className={`${sizeClass} rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white font-semibold`}>
      {hasInitials ? (
        initials
      ) : (
        <svg className={`${size === "sm" ? "w-4 h-4" : "w-5 h-5"}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
        </svg>
      )}
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
      className={`mb-1 px-2 sm:px-3 py-1.5 rounded-lg border-l-2 min-w-0 ${
        isOwn
          ? "bg-blue-400/30 border-blue-300"
          : "bg-gray-200 dark:bg-gray-600 border-gray-400"
      }`}
    >
      <p className={`text-xs font-medium truncate ${isOwn ? "text-blue-100" : "text-gray-600 dark:text-gray-300"}`}>
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
    <div
      className={`mb-1 flex items-center gap-1 text-xs ${
        isOwn ? "text-blue-100" : "text-gray-500 dark:text-gray-400"
      }`}
    >
      <span className="inline-flex">
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
  isOldMessage = false,
  onImageClick,
}: {
  attachments: NonNullable<Message["attachments"]>;
  isOwn: boolean;
  isOldMessage?: boolean;
  onImageClick?: (url: string, name?: string) => void;
}) {
  return (
    <div className="mb-2 space-y-2 w-full max-w-full min-w-0">
      {attachments.map((attachment) => {
        const isImage = attachment.mimeType?.startsWith("image/") || 
                       ["jpg", "jpeg", "png", "gif", "webp", "heic"].some(ext => 
                         attachment.fileName.toLowerCase().endsWith(ext));

        if (isImage) {
          return (
            <LazyImage
              key={attachment.id}
              src={getFileUrl(attachment.filePath)}
              alt={attachment.originalName}
              onClick={() => onImageClick?.(getFileUrl(attachment.filePath), attachment.originalName)}
              className="rounded-lg w-full hover:opacity-90 transition-opacity max-w-full"
              isOldImage={isOldMessage}
            />
          );
        }

        // Документы с красивым превью
        return (
          <a
            key={attachment.id}
            href={getFileUrl(attachment.filePath)}
            download={attachment.originalName}
            target="_blank"
            rel="noopener noreferrer"
            className={`flex items-center gap-2 sm:gap-3 p-2 sm:p-3 rounded-xl transition-all min-w-0 max-w-full w-full ${
              isOwn 
                ? "bg-blue-400/30 hover:bg-blue-400/40" 
                : "bg-white/80 dark:bg-gray-600/80 hover:bg-white dark:hover:bg-gray-600 shadow-sm"
            }`}
            style={{ maxWidth: "100%", transform: "none" }}
          >
            <FileTypeIcon 
              mimeType={attachment.mimeType} 
              fileName={attachment.originalName} 
              className="w-10 h-10 sm:w-12 sm:h-12 flex-shrink-0" 
            />
            <div className="min-w-0 flex-1 overflow-hidden">
              <p className={`text-xs sm:text-sm font-medium truncate ${isOwn ? "text-white" : "text-gray-900 dark:text-white"}`}>
                {attachment.originalName}
              </p>
              <p className={`text-xs mt-0.5 ${isOwn ? "text-blue-100" : "text-gray-500 dark:text-gray-400"}`}>
                {formatFileSize(attachment.fileSize)}
              </p>
            </div>
            <div className={`p-1.5 sm:p-2 rounded-full flex-shrink-0 ${isOwn ? "bg-blue-400/50" : "bg-gray-100 dark:bg-gray-500"}`}>
              <svg className={`w-3.5 h-3.5 sm:w-4 sm:h-4 ${isOwn ? "text-white" : "text-gray-600 dark:text-gray-300"}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
            </div>
          </a>
        );
      })}
    </div>
  );
});

// Компонент для контента сообщения с ссылками, Markdown и превью
const MessageContent = memo(function MessageContent({
  content,
  isOwn,
}: {
  content: string;
  isOwn: boolean;
}) {
  const [linkPreview, setLinkPreview] = useState<LinkPreview | null>(null);
  const [isLoadingPreview, setIsLoadingPreview] = useState(false);
  
  // Проверяем, содержит ли сообщение markdown-разметку
  const hasMarkdown = useMemo(() => {
    return /(\*\*|__|##|- |\d\. |```|\[.*\]\(.*\))/.test(content);
  }, [content]);
  
  // Находим первый URL в сообщении
  const firstUrl = useMemo(() => {
    const match = content.match(URL_REGEX);
    return match ? match[0] : null;
  }, [content]);

  // Загружаем превью ссылки
  useEffect(() => {
    if (!firstUrl) return;
    
    let isCancelled = false;
    setIsLoadingPreview(true);
    
    fetch('/api/link-preview', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: firstUrl }),
    })
      .then(res => res.ok ? res.json() : null)
      .then(data => {
        if (!isCancelled && data) {
          setLinkPreview(data);
        }
      })
      .catch(() => {})
      .finally(() => {
        if (!isCancelled) setIsLoadingPreview(false);
      });
    
    return () => { isCancelled = true; };
  }, [firstUrl]);

  // Разбиваем текст на части (текст и ссылки) - только для обычного текста без markdown
  const parts = useMemo(() => {
    if (hasMarkdown) return null; // Для markdown используем ReactMarkdown
    
    const result: { type: 'text' | 'link'; content: string }[] = [];
    let lastIndex = 0;
    
    content.replace(URL_REGEX, (match, offset) => {
      // Добавляем текст до ссылки
      if (offset > lastIndex) {
        result.push({ type: 'text', content: content.slice(lastIndex, offset) });
      }
      // Добавляем ссылку
      result.push({ type: 'link', content: match });
      lastIndex = offset + match.length;
      return match;
    });
    
    // Добавляем оставшийся текст
    if (lastIndex < content.length) {
      result.push({ type: 'text', content: content.slice(lastIndex) });
    }
    
    return result;
  }, [content, hasMarkdown]);

  return (
    <div className="min-w-0">
      {hasMarkdown ? (
        // Рендерим Markdown для сообщений с разметкой (обычно от AI)
        <div 
          className={`prose prose-sm max-w-none ${
            isOwn ? "prose-invert" : "dark:prose-invert"
          } prose-p:my-1 prose-ul:my-1 prose-ol:my-1 prose-li:my-0.5 prose-headings:my-2 prose-strong:font-semibold prose-a:text-blue-400 prose-a:no-underline hover:prose-a:underline`}
          style={{ wordBreak: "normal", overflowWrap: "break-word", hyphens: "auto" }}
        >
          <ReactMarkdown remarkPlugins={[remarkGfm]}>
            {content}
          </ReactMarkdown>
        </div>
      ) : (
        // Обычный текст с детекцией ссылок
        <p className="whitespace-pre-wrap text-sm md:text-base" style={{ wordBreak: "normal", overflowWrap: "break-word", hyphens: "auto" }}>
          {parts?.map((part, i) => 
            part.type === 'link' ? (
              <a
                key={i}
                href={part.content}
                target="_blank"
                rel="noopener noreferrer"
                className={`underline hover:no-underline ${
                  isOwn ? "text-blue-100 hover:text-white" : "text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300"
                }`}
                style={{ wordBreak: "break-all" }}
              >
                {part.content}
              </a>
            ) : (
              <span key={i}>{part.content}</span>
            )
          )}
        </p>
      )}
      
      {/* Превью ссылки */}
      {linkPreview && (linkPreview.title || linkPreview.image) && (
        <a
          href={linkPreview.url}
          target="_blank"
          rel="noopener noreferrer"
          className={`mt-2 block rounded-xl overflow-hidden transition-all hover:opacity-90 ${
            isOwn 
              ? "bg-blue-400/30" 
              : "bg-white/80 dark:bg-gray-600/80 shadow-sm"
          }`}
        >
          {linkPreview.image && (
            <div className="relative aspect-video w-full overflow-hidden">
              <img 
                src={linkPreview.image} 
                alt={linkPreview.title || ''} 
                className="w-full h-full object-cover"
                loading="lazy"
              />
            </div>
          )}
          <div className="p-3">
            <div className="flex items-center gap-2 mb-1">
              {linkPreview.favicon && (
                <img 
                  src={linkPreview.favicon} 
                  alt="" 
                  className="w-4 h-4 rounded"
                  onError={(e) => e.currentTarget.style.display = 'none'}
                />
              )}
              <span className={`text-xs ${isOwn ? "text-blue-100" : "text-gray-500 dark:text-gray-400"}`}>
                {linkPreview.siteName || new URL(linkPreview.url).hostname}
              </span>
            </div>
            {linkPreview.title && (
              <p className={`text-sm font-medium line-clamp-2 ${isOwn ? "text-white" : "text-gray-900 dark:text-white"}`}>
                {linkPreview.title}
              </p>
            )}
            {linkPreview.description && (
              <p className={`text-xs mt-1 line-clamp-2 ${isOwn ? "text-blue-100" : "text-gray-500 dark:text-gray-400"}`}>
                {linkPreview.description}
              </p>
            )}
          </div>
        </a>
      )}
      
      {/* Индикатор загрузки превью */}
      {isLoadingPreview && firstUrl && (
        <div className={`mt-2 p-3 rounded-xl ${isOwn ? "bg-blue-400/20" : "bg-gray-100 dark:bg-gray-700"}`}>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin opacity-50" />
            <span className={`text-xs ${isOwn ? "text-blue-100" : "text-gray-500 dark:text-gray-400"}`}>
              Загрузка превью...
            </span>
          </div>
        </div>
      )}
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

export const MessageItem = memo(MessageItemComponent);
export default MessageItem;
