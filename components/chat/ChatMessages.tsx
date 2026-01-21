'use client';

import { useEffect, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface Message {
  id: string;
  senderId: string;
  sender: {
    id: string;
    firstName?: string;
    lastName?: string;
    avatarUrl?: string;
  };
  content: string;
  messageType: string;
  createdAt: Date;
  replyTo?: {
    id: string;
    content: string;
    sender: {
      firstName?: string;
      lastName?: string;
    };
  };
  reactions?: Record<string, { count: number; userIds: string[] }>;
  attachments?: Array<{
    type: string;
    url: string;
    name: string;
  }>;
  editedAt?: Date;
}

interface ChatMessagesProps {
  messages: Message[];
  currentUserId: string;
  typingUsers: Set<string>;
}

export default function ChatMessages({ messages, currentUserId, typingUsers }: ChatMessagesProps) {
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const getSenderName = (sender: Message['sender']) => {
    return [sender.firstName, sender.lastName].filter(Boolean).join(' ') || 'Пользователь';
  };

  return (
    <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
      {messages.map(message => {
        const isOwn = message.senderId === currentUserId;
        const senderName = getSenderName(message.sender);

        return (
          <div
            key={message.id}
            className={`flex gap-3 ${isOwn ? 'flex-row-reverse' : ''}`}
          >
            {/* Avatar */}
            {!isOwn && (
              <img
                src={message.sender.avatarUrl || '/default-avatar.png'}
                alt={senderName}
                className="w-8 h-8 rounded-full"
              />
            )}

            {/* Message content */}
            <div className={`flex-1 ${isOwn ? 'items-end' : 'items-start'} flex flex-col`}>
              {!isOwn && (
                <span className="text-xs text-gray-500 dark:text-gray-400 mb-1">
                  {senderName}
                </span>
              )}

              {/* Reply preview */}
              {message.replyTo && (
                <div className="mb-1 pl-3 border-l-2 border-blue-500 text-sm text-gray-600 dark:text-gray-400">
                  <div className="font-medium">
                    {message.replyTo.sender.firstName || 'Пользователь'}
                  </div>
                  <div className="truncate">{message.replyTo.content}</div>
                </div>
              )}

              {/* Message bubble */}
              <div
                className={`rounded-lg px-4 py-2 max-w-md ${
                  isOwn
                    ? 'bg-blue-500 text-white'
                    : 'bg-white dark:bg-gray-800 text-gray-900 dark:text-white'
                }`}
              >
                {/* Attachments */}
                {message.attachments && message.attachments.length > 0 && (
                  <div className="mb-2 space-y-2">
                    {message.attachments.map((att, idx) => (
                      <div key={idx}>
                        {att.type === 'image' ? (
                          <img
                            src={att.url}
                            alt={att.name}
                            className="max-w-full rounded"
                          />
                        ) : (
                          <a
                            href={att.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-blue-500 hover:underline"
                          >
                            📎 {att.name}
                          </a>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {/* Content */}
                <div className={isOwn ? 'prose prose-invert prose-sm max-w-none' : 'prose prose-sm dark:prose-invert max-w-none'}>
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>
                    {message.content}
                  </ReactMarkdown>
                </div>

                {/* Reactions */}
                {message.reactions && Object.keys(message.reactions).length > 0 && (
                  <div className="flex gap-1 mt-2 flex-wrap">
                    {Object.entries(message.reactions).map(([emoji, data]) => (
                      <span
                        key={emoji}
                        className="bg-gray-100 dark:bg-gray-700 px-2 py-0.5 rounded text-sm"
                      >
                        {emoji} {data.count}
                      </span>
                    ))}
                  </div>
                )}

                {/* Edited indicator */}
                {message.editedAt && (
                  <span className="text-xs opacity-70 ml-2">(изменено)</span>
                )}
              </div>

              {/* Timestamp */}
              <span className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                {new Date(message.createdAt).toLocaleTimeString('ru-RU', {
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </span>
            </div>
          </div>
        );
      })}

      {/* Typing indicator */}
      {typingUsers.size > 0 && (
        <div className="flex gap-3">
          <div className="w-8 h-8 rounded-full bg-gray-300 dark:bg-gray-600" />
          <div className="bg-white dark:bg-gray-800 rounded-lg px-4 py-2">
            <div className="flex gap-1">
              <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" />
              <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }} />
              <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0.4s' }} />
            </div>
          </div>
        </div>
      )}

      <div ref={messagesEndRef} />
    </div>
  );
}
