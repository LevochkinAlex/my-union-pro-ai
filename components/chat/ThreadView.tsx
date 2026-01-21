"use client";

import { useState, useEffect, useRef } from 'react';
import { X, Reply, Send } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
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
      
      // Загружаем корневое сообщение
      const rootResponse = await fetch(`/api/chat/${chatId}/messages?threadRootId=${threadRootId}&limit=1`);
      if (rootResponse.ok) {
        const rootData = await safeJsonParse(rootResponse);
        if (rootData?.messages && rootData.messages.length > 0) {
          setRootMessage(rootData.messages[0]);
        }
      }

      // Загружаем ответы в треде
      const response = await fetch(`/api/chat/${chatId}/messages?threadRootId=${threadRootId}`);
      if (response.ok) {
        const data = await safeJsonParse(response);
        setMessages(data?.messages || []);
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
        throw new Error('Ошибка отправки сообщения');
      }

      const data = await safeJsonParse(response);
      if (data?.message) {
        setMessages(prev => [...prev, data.message]);
      }

      // Перезагружаем тред для синхронизации
      await loadThread();
    } catch (error) {
      console.error('Send error:', error);
      setNewMessage(content);
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

  if (loading) {
    return (
      <div className="fixed right-0 top-0 h-full w-96 bg-white dark:bg-gray-900 border-l border-gray-200 dark:border-gray-800 shadow-xl z-50 flex items-center justify-center">
        <div className="text-gray-500">Загрузка треда...</div>
      </div>
    );
  }

  return (
    <div className="fixed right-0 top-0 h-full w-96 bg-white dark:bg-gray-900 border-l border-gray-200 dark:border-gray-800 shadow-xl z-50 flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-800">
        <div className="flex items-center gap-2">
          <Reply className="w-4 h-4 text-gray-500" />
          <h3 className="font-semibold text-gray-900 dark:text-white">Тред</h3>
          <span className="text-sm text-gray-500">({messages.length} ответов)</span>
        </div>
        <button
          onClick={onClose}
          className="p-1 hover:bg-gray-100 dark:hover:bg-gray-800 rounded"
        >
          <X className="w-5 h-5 text-gray-500" />
        </button>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
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
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>
                    {rootMessage.content}
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
      <div className="p-4 border-t border-gray-200 dark:border-gray-800">
        <div className="flex gap-2">
          <textarea
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
            placeholder="Напишите ответ в треде..."
            className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-800 dark:text-white"
            rows={2}
          />
          <button
            onClick={handleSend}
            disabled={!newMessage.trim() || sending}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
