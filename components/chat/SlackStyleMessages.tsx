"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useTheme } from "next-themes";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  MoreHorizontal,
  Reply,
  Smile,
  Edit2,
  Trash2,
  Forward,
  MessageSquare,
  ChevronDown,
  Pin,
  Copy,
  Check,
  AlertCircle,
  UserPlus,
  Settings,
  FileText,
  Clock,
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
  url: string;
  name: string;
  size?: number;
  mimeType?: string;
  thumbnailUrl?: string;
  width?: number;
  height?: number;
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
  // Activity messages
  isActivity?: boolean;
  activityType?: string;
  activityData?: any;
}

export interface SlackStyleMessagesProps {
  messages: Message[];
  currentUserId: string;
  typingUsers: Set<string>;
  isTicketChat?: boolean;
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

function shouldGroupWithPrevious(current: Message, previous?: Message): boolean {
  if (!previous) return false;
  if (current.isActivity || previous.isActivity) return false;
  if (current.senderId !== previous.senderId) return false;
  const timeDiff = new Date(current.createdAt).getTime() - new Date(previous.createdAt).getTime();
  return timeDiff < 5 * 60 * 1000; // 5 минут
}

// ============================================================================
// SUB-COMPONENTS
// ============================================================================

interface MessageActionsProps {
  message: Message;
  isOwn: boolean;
  onReply?: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
  onReaction?: (emoji: string) => void;
  onOpenThread?: () => void;
  onForward?: () => void;
}

function MessageActions({
  message,
  isOwn,
  onReply,
  onEdit,
  onDelete,
  onReaction,
  onOpenThread,
  onForward,
}: MessageActionsProps) {
  const [showMenu, setShowMenu] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(message.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    setShowMenu(false);
  }, [message.content]);

  const quickReactions = ["👍", "❤️", "😂", "😮", "😢", "🎉"];

  return (
    <div className="absolute -top-3 right-2 opacity-0 group-hover:opacity-100 transition-opacity duration-150">
      <div className="flex items-center gap-0.5 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 p-0.5">
        {/* Quick reactions */}
        {quickReactions.slice(0, 3).map((emoji) => (
          <button
            key={emoji}
            onClick={() => onReaction?.(emoji)}
            className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded text-sm"
            title={`Реакция ${emoji}`}
          >
            {emoji}
          </button>
        ))}

        {/* Emoji picker */}
        <div className="relative">
          <button
            onClick={() => setShowEmojiPicker(!showEmojiPicker)}
            className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded"
            title="Добавить реакцию"
          >
            <Smile className="w-4 h-4 text-gray-500" />
          </button>
          {showEmojiPicker && (
            <div className="absolute top-full right-0 mt-1 z-50">
              <EmojiPicker
                onSelect={(emoji) => {
                  onReaction?.(emoji);
                  setShowEmojiPicker(false);
                }}
                onClose={() => setShowEmojiPicker(false)}
              />
            </div>
          )}
        </div>

        {/* Reply */}
        <button
          onClick={onReply}
          className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded"
          title="Ответить"
        >
          <Reply className="w-4 h-4 text-gray-500" />
        </button>

        {/* Thread */}
        <button
          onClick={onOpenThread}
          className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded"
          title="Открыть тред"
        >
          <MessageSquare className="w-4 h-4 text-gray-500" />
        </button>

        {/* More menu */}
        <div className="relative">
          <button
            onClick={() => setShowMenu(!showMenu)}
            className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded"
            title="Ещё"
          >
            <MoreHorizontal className="w-4 h-4 text-gray-500" />
          </button>

          {showMenu && (
            <>
              <div
                className="fixed inset-0 z-40"
                onClick={() => setShowMenu(false)}
              />
              <div className="absolute top-full right-0 mt-1 w-48 bg-white dark:bg-gray-800 rounded-lg shadow-xl border border-gray-200 dark:border-gray-700 py-1 z-50">
                <button
                  onClick={handleCopy}
                  className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
                >
                  {copied ? (
                    <Check className="w-4 h-4 text-green-500" />
                  ) : (
                    <Copy className="w-4 h-4" />
                  )}
                  {copied ? "Скопировано!" : "Копировать текст"}
                </button>

                {onForward && (
                  <button
                    onClick={() => {
                      onForward();
                      setShowMenu(false);
                    }}
                    className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
                  >
                    <Forward className="w-4 h-4" />
                    Переслать
                  </button>
                )}

                {isOwn && onEdit && (
                  <button
                    onClick={() => {
                      onEdit();
                      setShowMenu(false);
                    }}
                    className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
                  >
                    <Edit2 className="w-4 h-4" />
                    Редактировать
                  </button>
                )}

                {isOwn && onDelete && (
                  <button
                    onClick={() => {
                      onDelete();
                      setShowMenu(false);
                    }}
                    className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20"
                  >
                    <Trash2 className="w-4 h-4" />
                    Удалить
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

interface MessageReactionsDisplayProps {
  reactions: MessageReactions;
  currentUserId: string;
  onToggle: (emoji: string) => void;
}

function MessageReactionsDisplay({
  reactions,
  currentUserId,
  onToggle,
}: MessageReactionsDisplayProps) {
  return (
    <div className="flex flex-wrap gap-1 mt-1">
      {Object.entries(reactions).map(([emoji, data]) => {
        const count = data.count ?? data.userIds?.length ?? 0;
        const isLiked = data.userIds?.includes(currentUserId);
        if (count === 0) return null;

        return (
          <button
            key={emoji}
            onClick={() => onToggle(emoji)}
            className={`
              inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs transition-colors
              ${isLiked
                ? "bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-700"
                : "bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600"
              }
            `}
            title={data.users?.map((u) => u.name).join(", ")}
          >
            <span>{emoji}</span>
            <span>{count}</span>
          </button>
        );
      })}
    </div>
  );
}

interface ThreadIndicatorProps {
  repliesCount: number;
  lastReplyAt?: Date | null;
  onClick: () => void;
}

function ThreadIndicator({ repliesCount, lastReplyAt, onClick }: ThreadIndicatorProps) {
  if (repliesCount === 0) return null;

  return (
    <button
      onClick={onClick}
      className="mt-2 flex items-center gap-2 text-sm text-blue-600 dark:text-blue-400 hover:underline"
    >
      <MessageSquare className="w-4 h-4" />
      <span>
        {repliesCount} {repliesCount === 1 ? "ответ" : repliesCount < 5 ? "ответа" : "ответов"}
      </span>
      {lastReplyAt && (
        <span className="text-gray-500 dark:text-gray-400">
          · {formatMessageTime(new Date(lastReplyAt))}
        </span>
      )}
    </button>
  );
}

interface ActivityMessageProps {
  message: Message;
}

function ActivityMessage({ message }: ActivityMessageProps) {
  const getActivityIcon = () => {
    switch (message.activityType) {
      case "status_changed":
        return <Settings className="w-4 h-4" />;
      case "participant_added":
        return <UserPlus className="w-4 h-4" />;
      case "message_edited":
        return <Edit2 className="w-4 h-4" />;
      case "file_attached":
        return <FileText className="w-4 h-4" />;
      default:
        return <AlertCircle className="w-4 h-4" />;
    }
  };

  return (
    <div className="flex items-center justify-center py-2">
      <div className="flex items-center gap-2 px-4 py-2 bg-gray-100 dark:bg-gray-800 rounded-full text-sm text-gray-600 dark:text-gray-400">
        {getActivityIcon()}
        <span>{message.content}</span>
        <span className="text-xs text-gray-400">
          {formatMessageTime(new Date(message.createdAt))}
        </span>
      </div>
    </div>
  );
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export default function SlackStyleMessages({
  messages,
  currentUserId,
  typingUsers,
  isTicketChat = false,
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

  const scrollToBottom = useCallback((smooth = true) => {
    messagesEndRef.current?.scrollIntoView({
      behavior: smooth ? "smooth" : "auto",
    });
  }, []);

  // Auto-scroll when new messages arrive
  useEffect(() => {
    if (isAtBottom) {
      scrollToBottom();
    }
  }, [messages.length, isAtBottom, scrollToBottom]);

  // Track scroll position
  const handleScroll = useCallback(() => {
    if (!containerRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = containerRef.current;
    const threshold = 100;
    setIsAtBottom(scrollHeight - scrollTop - clientHeight < threshold);
  }, []);

  return (
    <div
      ref={containerRef}
      className="flex-1 overflow-y-auto"
      onScroll={handleScroll}
    >
      <div className="py-4 px-4 min-h-full">
        {messages.map((message, index) => {
          const previousMessage = index > 0 ? messages[index - 1] : undefined;
          const showDate = shouldShowDateSeparator(message, previousMessage);
          const groupWithPrevious = shouldGroupWithPrevious(message, previousMessage);
          const isOwn = message.senderId === currentUserId;
          const isDeleted = !!message.deletedAt;

          // Activity messages
          if (message.isActivity) {
            return (
              <div key={message.id}>
                {showDate && (
                  <div className="flex items-center justify-center my-4">
                    <div className="px-3 py-1 bg-gray-100 dark:bg-gray-800 rounded-full text-xs font-medium text-gray-600 dark:text-gray-400">
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
              {/* Date separator */}
              {showDate && (
                <div className="flex items-center justify-center my-4">
                  <div className="px-3 py-1 bg-gray-100 dark:bg-gray-800 rounded-full text-xs font-medium text-gray-600 dark:text-gray-400">
                    {formatMessageDate(new Date(message.createdAt))}
                  </div>
                </div>
              )}

              {/* Message */}
              <div
                className={`
                  group relative flex gap-3 px-2 py-1 rounded-lg
                  ${groupWithPrevious ? "mt-0.5" : "mt-4"}
                  hover:bg-gray-50 dark:hover:bg-gray-800/50
                `}
              >
                {/* Avatar */}
                <div className="flex-shrink-0 w-9">
                  {!groupWithPrevious && (
                    <>
                      {message.sender.avatarUrl ? (
                        <img
                          src={message.sender.avatarUrl}
                          alt={getSenderName(message.sender)}
                          className="w-9 h-9 rounded-lg object-cover"
                        />
                      ) : (
                        <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-gray-400 to-gray-500 flex items-center justify-center text-white font-medium text-sm">
                          {getSenderInitials(message.sender)}
                        </div>
                      )}
                    </>
                  )}
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  {/* Header (name + time) */}
                  {!groupWithPrevious && (
                    <div className="flex items-baseline gap-2 mb-0.5">
                      <span className="font-semibold text-sm text-gray-900 dark:text-white">
                        {getSenderName(message.sender)}
                      </span>
                      <span className="text-xs text-gray-500 dark:text-gray-400">
                        {formatMessageTime(new Date(message.createdAt))}
                      </span>
                      {message.editedAt && (
                        <span className="text-xs text-gray-400 dark:text-gray-500">
                          (изменено)
                        </span>
                      )}
                    </div>
                  )}

                  {/* Reply preview */}
                  {message.replyTo && (
                    <div className="mb-2 pl-3 border-l-2 border-gray-300 dark:border-gray-600">
                      <div className="text-xs text-gray-500 dark:text-gray-400">
                        <span className="font-medium">
                          {getSenderName(message.replyTo.sender)}
                        </span>
                      </div>
                      <div className="text-sm text-gray-600 dark:text-gray-400 truncate">
                        {message.replyTo.content}
                      </div>
                    </div>
                  )}

                  {/* Message content */}
                  {isDeleted ? (
                    <div className="italic text-gray-400 dark:text-gray-500 text-sm">
                      Сообщение удалено
                    </div>
                  ) : (
                    <>
                      {/* Attachments */}
                      {message.attachments && message.attachments.length > 0 && (
                        <div className="mb-2 space-y-2">
                          {message.attachments.map((att) => (
                            <div key={att.id}>
                              {att.type === "image" ? (
                                <button
                                  onClick={() => onImageClick?.(att.url, att.name)}
                                  className="block max-w-sm"
                                >
                                  <img
                                    src={att.thumbnailUrl || att.url}
                                    alt={att.name}
                                    className="rounded-lg max-h-64 object-cover cursor-pointer hover:opacity-90 transition-opacity"
                                  />
                                </button>
                              ) : (
                                <a
                                  href={att.url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-flex items-center gap-2 px-3 py-2 bg-gray-100 dark:bg-gray-700 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
                                >
                                  <FileText className="w-4 h-4 text-gray-500" />
                                  <span className="text-sm text-gray-700 dark:text-gray-300">
                                    {att.name}
                                  </span>
                                  {att.size && (
                                    <span className="text-xs text-gray-400">
                                      ({Math.round(att.size / 1024)} KB)
                                    </span>
                                  )}
                                </a>
                              )}
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Text content */}
                      <div className="text-sm text-gray-900 dark:text-gray-100 prose prose-sm dark:prose-invert max-w-none break-words">
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>
                          {message.content}
                        </ReactMarkdown>
                      </div>

                      {/* Reactions */}
                      {message.reactions && Object.keys(message.reactions).length > 0 && (
                        <MessageReactionsDisplay
                          reactions={message.reactions}
                          currentUserId={currentUserId}
                          onToggle={(emoji) => onReaction?.(message.id, emoji)}
                        />
                      )}

                      {/* Thread indicator */}
                      {(message.threadRepliesCount || 0) > 0 && (
                        <ThreadIndicator
                          repliesCount={message.threadRepliesCount || 0}
                          lastReplyAt={message.threadLastReplyAt}
                          onClick={() => onOpenThread?.(message)}
                        />
                      )}
                    </>
                  )}
                </div>

                {/* Actions (shown on hover) */}
                {!isDeleted && (
                  <MessageActions
                    message={message}
                    isOwn={isOwn}
                    onReply={() => onReply?.(message)}
                    onEdit={() => onEdit?.(message)}
                    onDelete={() => onDelete?.(message.id)}
                    onReaction={(emoji) => onReaction?.(message.id, emoji)}
                    onOpenThread={() => onOpenThread?.(message)}
                    onForward={() => onForward?.(message)}
                  />
                )}
              </div>
            </div>
          );
        })}

        {/* Typing indicator */}
        {typingUsers.size > 0 && (
          <div className="flex items-center gap-3 px-2 py-2 mt-2">
            <div className="w-9" />
            <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
              <div className="flex gap-1">
                <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" />
                <div
                  className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"
                  style={{ animationDelay: "0.2s" }}
                />
                <div
                  className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"
                  style={{ animationDelay: "0.4s" }}
                />
              </div>
              <span>печатает...</span>
            </div>
          </div>
        )}

        {/* Scroll anchor */}
        <div ref={messagesEndRef} />
      </div>

      {/* Scroll to bottom button */}
      {!isAtBottom && (
        <button
          onClick={() => scrollToBottom()}
          className="absolute bottom-24 right-6 p-2 bg-white dark:bg-gray-800 rounded-full shadow-lg border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
        >
          <ChevronDown className="w-5 h-5 text-gray-600 dark:text-gray-300" />
        </button>
      )}
    </div>
  );
}
