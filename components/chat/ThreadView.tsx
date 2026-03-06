"use client";

import { useState, useEffect, useRef } from 'react';
import { X, Reply, Send } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import clsx from 'clsx';
import { safeJsonParse } from "@/lib/api-client";

interface ThreadMessage {
  id: string;
  sender: {
    id: string;
    firstName?: string;
    lastName?: string;
    avatarUrl?: string;
  };
  content: string;
  createdAt: string;
  messageType?: string;
  post?: { title?: string };
  reactions?: Array<{
    emoji: string;
    count: number;
    users: string[];
  }>;
  replyTo?: {
    id: string;
    content: string;
    sender: {
      firstName?: string;
      lastName?: string;
    };
  };
}

interface ThreadViewProps {
  threadRootId: string;
  chatId: string;
  onClose: () => void;
  currentUserId: string;
}

export default function ThreadView({ threadRootId, chatId, onClose, currentUserId }: ThreadViewProps) {
  const [messages, setMessages] = useState<ThreadMessage[]>([]);
  const [rootMessage, setRootMessage] = useState<ThreadMessage | null>(null);
  const [loading, setLoading] = useState(true);
  const [newMessage, setNewMessage] = useState('');
  const [sending, setSending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    loadThread();
  }, [threadRootId, chatId]);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const loadThread = async () => {
    try {
      setLoading(true);
      
      // Загружаем корневое сообщение из основного списка сообщений чата
      // (корневое сообщение имеет id === threadRootId и threadRootId === null)
      const chatResponse = await fetch(`/api/chat/${chatId}`);
      if (chatResponse.ok) {
        const chatData = await safeJsonParse(chatResponse);
        const rootMsg = chatData?.messages?.find((m: any) => m.id === threadRootId);
        if (rootMsg) {
          setRootMessage(rootMsg);
        }
      }

      // Загружаем ответы в треде (сообщения с threadRootId === threadRootId)
      const response = await fetch(`/api/chat/${chatId}/messages?threadRootId=${threadRootId}`);
      if (response.ok) {
        const data = await safeJsonParse(response);
        // Фильтруем, чтобы исключить корневое сообщение из списка ответов (на случай если оно попало)
        const replies = (data?.messages || []).filter((msg: any) => msg.id !== threadRootId);
        // Преобразуем формат реакций из объекта в массив для совместимости с ThreadMessage
        const formattedReplies = replies.map((msg: any) => ({
          ...msg,
          reactions: msg.reactions ? Object.entries(msg.reactions).map(([emoji, data]: [string, any]) => ({
            emoji,
            count: data.count || 0,
            users: data.userIds || [],
          })) : [],
        }));
        setMessages(formattedReplies);
      }
    } catch (error) {
      console.error('Failed to load thread:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSend = async () => {
    if (!newMessage.trim() || sending) return;

    setSending(true);
    const content = newMessage.trim();
    setNewMessage('');

    try {
      const response = await fetch(`/api/chat/${chatId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content,
          threadRootId,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Ошибка отправки сообщения' }));
        throw new Error(errorData.error || 'Ошибка отправки сообщения');
      }

      const data = await safeJsonParse(response);
      if (data?.message) {
        // Преобразуем формат реакций из объекта в массив для совместимости с ThreadMessage
        const formattedMessage = {
          ...data.message,
          reactions: data.message.reactions 
            ? Object.entries(data.message.reactions).map(([emoji, data]: [string, any]) => ({
                emoji,
                count: data.count || 0,
                users: data.userIds || [],
              }))
            : [],
        };
        
        // Добавляем сообщение в список сразу для оптимистичного обновления
        setMessages(prev => [...prev, formattedMessage]);
        
        // Сброс высоты textarea
        if (textareaRef.current) {
          textareaRef.current.style.height = 'auto';
        }
        
        // Перезагружаем тред для синхронизации (с небольшой задержкой для БД)
        setTimeout(async () => {
          await loadThread();
        }, 300);
      } else {
        // Если сообщение не вернулось, перезагружаем тред
        await loadThread();
      }
    } catch (error) {
      console.error('Send error:', error);
      setNewMessage(content);
      // Показываем ошибку пользователю
      alert(error instanceof Error ? error.message : 'Ошибка отправки сообщения');
    } finally {
      setSending(false);
    }
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

  const getSenderName = (sender: ThreadMessage['sender']) => {
    if (sender.firstName || sender.lastName) {
      return [sender.firstName, sender.lastName].filter(Boolean).join(' ') || 'Пользователь';
    }
    return 'Пользователь';
  };

  /** Для постов канала не показываем сырой JSON/HTML — только заголовок или краткую подпись. */
  const getRootMessageDisplayContent = (msg: ThreadMessage | null): string => {
    if (!msg) return '';
    if (msg.messageType === 'channel_post' && msg.post?.title) {
      return msg.post.title;
    }
    try {
      const parsed = JSON.parse(msg.content);
      if (parsed?.type === 'channel_post' && parsed?.title) return parsed.title;
      if (parsed?.type === 'channel_post') return 'Пост в канале';
    } catch {
      // не JSON — обычный текст
    }
    return msg.content;
  };

  const isChannelPostRoot = (msg: ThreadMessage | null): boolean => {
    if (!msg) return false;
    if (msg.messageType === 'channel_post') return true;
    try {
      const parsed = JSON.parse(msg.content);
      return parsed?.type === 'channel_post';
    } catch {
      return false;
    }
  };

  if (loading) {
    return (
      <div className="h-full bg-white dark:bg-gray-900 flex items-center justify-center">
        <div className="text-gray-500">Загрузка треда...</div>
      </div>
    );
  }

  return (
    <div className="h-full bg-white dark:bg-gray-900 flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-800 flex-shrink-0">
        <div className="flex items-center gap-2">
          <Reply className="w-4 h-4 text-gray-500" />
          <h3 className="font-semibold text-gray-900 dark:text-white">Тред</h3>
          <span className="text-sm text-gray-500">
            ({messages.length} {messages.length === 1 ? 'ответ' : messages.length < 5 ? 'ответа' : 'ответов'})
          </span>
        </div>
        <button
          onClick={onClose}
          className="p-1 hover:bg-gray-100 dark:hover:bg-gray-800 rounded transition-colors"
          aria-label="Закрыть тред"
        >
          <X className="w-5 h-5 text-gray-500" />
        </button>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 min-h-0">
        {/* Root message */}
        {rootMessage && (
          <div className="bg-blue-50 dark:bg-blue-900/20 p-3 rounded-lg border border-blue-200 dark:border-blue-800">
            <div className="flex items-start gap-2 mb-2">
              {rootMessage.sender.avatarUrl ? (
                <img
                  src={rootMessage.sender.avatarUrl}
                  alt={getSenderName(rootMessage.sender)}
                  className="w-6 h-6 rounded-full"
                />
              ) : (
                <div className="w-6 h-6 rounded-full bg-gray-300 dark:bg-gray-700 flex items-center justify-center text-xs">
                  {getSenderName(rootMessage.sender)[0]?.toUpperCase()}
                </div>
              )}
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <span className="font-medium text-sm text-gray-900 dark:text-white">
                    {getSenderName(rootMessage.sender)}
                  </span>
                  <span className="text-xs text-gray-500">
                    {formatTime(rootMessage.createdAt)}
                  </span>
                </div>
                <div className="text-sm text-gray-700 dark:text-gray-300">
                  {isChannelPostRoot(rootMessage) && (
                    <span className="mb-1 inline-block text-xs font-medium text-blue-600 dark:text-blue-400">Пост в канале</span>
                  )}
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>
                    {getRootMessageDisplayContent(rootMessage)}
                  </ReactMarkdown>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Thread replies */}
        {messages.map((msg) => (
          <div key={msg.id} className="flex items-start gap-2">
            {msg.sender.avatarUrl ? (
              <img
                src={msg.sender.avatarUrl}
                alt={getSenderName(msg.sender)}
                className="w-8 h-8 rounded-full"
              />
            ) : (
              <div className="w-8 h-8 rounded-full bg-gray-300 dark:bg-gray-700 flex items-center justify-center text-xs">
                {getSenderName(msg.sender)[0]?.toUpperCase()}
              </div>
            )}
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1">
                <span className="font-medium text-sm text-gray-900 dark:text-white">
                  {getSenderName(msg.sender)}
                </span>
                <span className="text-xs text-gray-500">
                  {formatTime(msg.createdAt)}
                </span>
              </div>
              {msg.replyTo && (
                <div className="mb-2 p-2 bg-gray-100 dark:bg-gray-800 rounded text-xs text-gray-600 dark:text-gray-400 border-l-2 border-gray-300 dark:border-gray-700">
                  <div className="font-medium">
                    {msg.replyTo.sender.firstName} {msg.replyTo.sender.lastName}
                  </div>
                  <div className="truncate">{msg.replyTo.content}</div>
                </div>
              )}
              <div className="text-sm text-gray-700 dark:text-gray-300">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                  {msg.content}
                </ReactMarkdown>
              </div>
              {msg.reactions && msg.reactions.length > 0 && (
                <div className="flex gap-1 mt-2">
                  {msg.reactions.map((reaction, idx) => (
                    <button
                      key={idx}
                      className="px-2 py-0.5 bg-gray-100 dark:bg-gray-800 rounded-full text-xs hover:bg-gray-200 dark:hover:bg-gray-700"
                    >
                      {reaction.emoji} {reaction.count}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="p-4 border-t border-gray-200 dark:border-gray-800 flex-shrink-0">
        <div className="relative border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 focus-within:ring-2 focus-within:ring-blue-500 focus-within:border-blue-500 dark:focus-within:border-blue-500">
          <textarea
            ref={textareaRef}
            value={newMessage}
            onChange={(e) => {
              setNewMessage(e.target.value);
              // Автоматическое изменение высоты textarea
              const textarea = e.target as HTMLTextAreaElement;
              textarea.style.height = 'auto';
              const newHeight = Math.min(textarea.scrollHeight, 200); // Максимум 200px
              textarea.style.height = `${newHeight}px`;
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
            placeholder="Напишите ответ в треде..."
            className="w-full px-3 py-2 pr-12 bg-transparent border-none outline-none resize-none text-gray-900 dark:text-gray-100 placeholder-gray-500 dark:placeholder-gray-400 text-[15px] leading-relaxed max-h-[200px] min-h-[42px]"
            rows={1}
          />
          <button
            type="button"
            onClick={handleSend}
            disabled={!newMessage.trim() || sending}
            title="Отправить"
            aria-label="Отправить"
            className={`
              absolute right-2 bottom-2 w-8 h-8 rounded-full flex items-center justify-center transition-all duration-200
              ${newMessage.trim() && !sending
                ? 'bg-blue-600 hover:bg-blue-700 text-white'
                : 'bg-gray-200 dark:bg-gray-700 text-gray-400 dark:text-gray-500 cursor-not-allowed'
              }
            `}
          >
            <Send className="w-4 h-4" aria-hidden />
          </button>
        </div>
      </div>
    </div>
  );
}
