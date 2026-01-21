"use client";

import { useState } from 'react';
import { Reply, MoreVertical, Edit, Trash2, Smile } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import MessageContent from './MessageContent';

interface MessageItemProps {
  message: {
    id: string;
    senderId?: string;
    sender?: {
      id: string;
      firstName?: string;
      lastName?: string;
      avatarUrl?: string;
    };
    content: string;
    createdAt: string;
    replyTo?: {
      id: string;
      content: string;
      sender: {
        firstName?: string;
        lastName?: string;
      };
    };
    threadRepliesCount?: number;
    threadLastReplyAt?: string;
    reactions?: Array<{
      emoji: string;
      count: number;
      users: string[];
    }> | Record<string, { userIds: string[]; users?: Array<{ id: string; avatarUrl: string | null; name: string }> }>;
    attachments?: Array<{
      id: string;
      type: string;
      url: string;
      name: string;
    }>;
  };
  currentUserId: string;
  isOwn?: boolean;
  isOldMessage?: boolean;
  showSenderName?: boolean;
  onReply?: (messageId: string) => void;
  onStartThread?: (messageId: string) => void;
  onEdit?: (messageId: string, content: string) => void;
  onDelete?: (messageId: string) => void;
  onReaction?: (messageId: string, emoji: string) => void;
  onOpenThread?: (messageId: string) => void;
  onForward?: (messageId: string) => void;
  onImageClick?: (url: string) => void;
  onProfileClick?: (userId: string) => void;
}

export default function MessageItem({
  message,
  currentUserId,
  isOwn = false,
  isOldMessage = false,
  showSenderName = false,
  onReply,
  onStartThread,
  onEdit,
  onDelete,
  onReaction,
  onOpenThread,
  onForward,
  onImageClick,
  onProfileClick,
}: MessageItemProps) {
  const [showMenu, setShowMenu] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState(message.content);

  const getSenderName = () => {
    if (message.sender) {
      if (message.sender.firstName || message.sender.lastName) {
        return [message.sender.firstName, message.sender.lastName].filter(Boolean).join(' ') || 'Пользователь';
      }
    }
    return 'Пользователь';
  };

  const formatTime = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const minutes = Math.floor(diff / 60000);

    if (minutes < 1) return 'только что';
    if (minutes < 60) return `${minutes} мин назад`;
    if (date.toDateString() === now.toDateString()) {
      return date.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
    }
    return date.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' });
  };

  const handleEdit = () => {
    if (editContent.trim() && editContent !== message.content) {
      onEdit?.(message.id, editContent);
    }
    setIsEditing(false);
  };

  const commonReactions = ['👍', '❤️', '😂', '🎉', '👏', '🔥'];

  return (
    <div className="group hover:bg-gray-50 dark:hover:bg-gray-800/50 px-4 py-2 relative">
      <div className="flex items-start gap-3">
        {/* Avatar */}
        {message.sender?.avatarUrl ? (
          <img
            src={message.sender.avatarUrl}
            alt={getSenderName()}
            className="w-8 h-8 rounded-full flex-shrink-0"
            onClick={() => message.sender?.id && onProfileClick?.(message.sender.id)}
          />
        ) : (
          <div 
            className="w-8 h-8 rounded-full bg-gray-300 dark:bg-gray-700 flex items-center justify-center text-xs flex-shrink-0 cursor-pointer"
            onClick={() => (message.sender?.id || message.senderId) && onProfileClick?.((message.sender?.id || message.senderId)!)}
          >
            {getSenderName()[0]?.toUpperCase()}
          </div>
        )}
        
        {/* Message content */}
        <div className="flex-1 min-w-0">
          {/* Header */}
          {(showSenderName || !isOwn) && (
            <div className="flex items-center gap-2 mb-1">
              <span 
                className="font-medium text-sm text-gray-900 dark:text-white cursor-pointer hover:underline"
                onClick={() => (message.sender?.id || message.senderId) && onProfileClick?.((message.sender?.id || message.senderId)!)}
              >
                {getSenderName()}
              </span>
              <span className="text-xs text-gray-500">
                {formatTime(message.createdAt)}
              </span>
              {isOwn && (
                <span className="text-xs text-blue-600 dark:text-blue-400">Вы</span>
              )}
            </div>
          )}

          {/* Reply to */}
          {message.replyTo && (
            <div className="mb-2 p-2 bg-gray-100 dark:bg-gray-800 rounded text-xs text-gray-600 dark:text-gray-400 border-l-2 border-gray-300 dark:border-gray-700">
              <div className="font-medium">
                {message.replyTo.sender.firstName} {message.replyTo.sender.lastName}
              </div>
              <div className="truncate">{message.replyTo.content}</div>
            </div>
          )}

          {/* Message content */}
          {isEditing ? (
            <div className="space-y-2">
              <textarea
                value={editContent}
                onChange={(e) => setEditContent(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-800 dark:text-white"
                rows={3}
                autoFocus
              />
              <div className="flex gap-2">
                <button
                  onClick={handleEdit}
                  className="px-3 py-1 bg-blue-600 text-white rounded text-sm hover:bg-blue-700"
                >
                  Сохранить
                </button>
                <button
                  onClick={() => {
                    setIsEditing(false);
                    setEditContent(message.content);
                  }}
                  className="px-3 py-1 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded text-sm hover:bg-gray-300 dark:hover:bg-gray-600"
                >
                  Отмена
                </button>
              </div>
            </div>
          ) : (
            <div className="text-sm text-gray-700 dark:text-gray-300">
              <MessageContent content={message.content} />
      </div>
          )}

          {/* Attachments */}
          {message.attachments && message.attachments.length > 0 && (
            <div className="mt-2 space-y-2">
              {message.attachments.map((att) => (
                <div key={att.id} className="border border-gray-200 dark:border-gray-700 rounded p-2">
                  {att.type === 'image' ? (
                    <img 
                      src={att.url} 
                      alt={att.name} 
                      className="max-w-md rounded cursor-pointer hover:opacity-90 transition-opacity"
                      onClick={() => onImageClick?.(att.url)}
                    />
                  ) : (
                    <a
                      href={att.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-600 dark:text-blue-400 hover:underline"
                    >
                      📎 {att.name}
                    </a>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Thread indicator */}
          {message.threadRepliesCount !== undefined && message.threadRepliesCount > 0 && (
            <button
              onClick={() => onOpenThread?.(message.id)}
              className="mt-2 flex items-center gap-1 text-xs text-blue-600 dark:text-blue-400 hover:underline"
            >
              <Reply className="w-3 h-3" />
              {message.threadRepliesCount} {message.threadRepliesCount === 1 ? 'ответ' : 'ответов'} в треде
            </button>
          )}

          {/* Reactions */}
          {(() => {
            let reactionsArray: Array<{ emoji: string; count: number; users: string[] }> = [];
            
            if (Array.isArray(message.reactions)) {
              reactionsArray = message.reactions;
            } else if (message.reactions && typeof message.reactions === 'object') {
              // Преобразуем Record в массив
              reactionsArray = Object.entries(message.reactions).map(([emoji, data]) => ({
                emoji,
                count: data.userIds?.length || 0,
                users: data.userIds || [],
              }));
            }
            
            return reactionsArray.length > 0 ? (
              <div className="flex gap-1 mt-2 flex-wrap">
                {reactionsArray.map((reaction, idx) => (
                  <button
                    key={idx}
                    onClick={() => onReaction?.(message.id, reaction.emoji)}
                    className="px-2 py-0.5 bg-gray-100 dark:bg-gray-800 rounded-full text-xs hover:bg-gray-200 dark:hover:bg-gray-700 flex items-center gap-1"
                  >
                    {reaction.emoji} {reaction.count}
                  </button>
                ))}
              </div>
            ) : null;
          })()}

          {/* Action buttons (show on hover) */}
          <div className="flex items-center gap-2 mt-2 opacity-0 group-hover:opacity-100 transition-opacity">
            <button
              onClick={() => onReply?.(message.id)}
              className="flex items-center gap-1 px-2 py-1 text-xs text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 rounded"
            >
              <Reply className="w-3 h-3" />
              Ответить
            </button>
            <button
              onClick={() => onStartThread?.(message.id)}
              className="flex items-center gap-1 px-2 py-1 text-xs text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 rounded"
            >
              <Reply className="w-3 h-3" />
              Создать тред
            </button>
            <div className="relative">
              <button
                onClick={() => setShowMenu(!showMenu)}
                className="p-1 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 rounded"
              >
                <MoreVertical className="w-4 h-4" />
              </button>
              {showMenu && (
                <div className="absolute left-0 bottom-full mb-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg z-10 min-w-[150px]">
                  {isOwn && (
                    <>
                      <button
                        onClick={() => {
                          setIsEditing(true);
                          setShowMenu(false);
                        }}
                        className="w-full px-3 py-2 text-left text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-2"
                      >
                        <Edit className="w-4 h-4" />
                        Редактировать
                      </button>
                      <button
                        onClick={() => {
                          if (confirm('Удалить сообщение?')) {
                            onDelete?.(message.id);
                          }
                          setShowMenu(false);
                        }}
                        className="w-full px-3 py-2 text-left text-sm text-red-600 dark:text-red-400 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-2"
                      >
                        <Trash2 className="w-4 h-4" />
                        Удалить
                      </button>
                    </>
                  )}
                  {onForward && (
                    <button
                      onClick={() => {
                        onForward(message.id);
                        setShowMenu(false);
                      }}
                      className="w-full px-3 py-2 text-left text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-2"
                    >
                      <Reply className="w-4 h-4" />
                      Переслать
                    </button>
                  )}
                  <button
                    onClick={() => {
                      // Показываем панель реакций
                      setShowMenu(false);
                    }}
                    className="w-full px-3 py-2 text-left text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-2"
                  >
                    <Smile className="w-4 h-4" />
                    Добавить реакцию
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
    </div>
    </div>
  );
}
