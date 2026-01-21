'use client';

import { useEffect, useRef } from 'react';
import { useTheme } from 'next-themes';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
  Card,
  CardBody,
  Avatar,
  Chip,
  ScrollShadow,
} from '@heroui/react';
import { Check, CheckCheck } from 'lucide-react';

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
  reactions?: Record<string, { count?: number; userIds: string[]; users?: any[] }> | null;
  attachments?: Array<{
    type: string;
    url?: string;
    name?: string;
    fileName?: string;
    filePath?: string;
  }>;
  editedAt?: Date | string;
}

interface ChatMessagesProps {
  messages: Message[];
  currentUserId: string;
  typingUsers: Set<string>;
}

export default function ChatMessages({ messages, currentUserId, typingUsers }: ChatMessagesProps) {
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const { resolvedTheme } = useTheme();

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
    <ScrollShadow className="flex-1 h-full">
      <div className="p-4 space-y-4">
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
                <Avatar
                  src={message.sender.avatarUrl}
                  name={senderName}
                  size="sm"
                  className="flex-shrink-0"
                />
              )}

              {/* Message content */}
              <div className={`flex-1 ${isOwn ? 'items-end' : 'items-start'} flex flex-col max-w-[70%]`}>
                {!isOwn && (
                  <span className="text-xs text-foreground-500 mb-1 px-1">
                    {senderName}
                  </span>
                )}

                {/* Reply preview */}
                {message.replyTo && (
                  <Card className="mb-1 w-full" shadow="none">
                    <CardBody className="p-2 bg-default-100 dark:bg-default-50">
                      <div className="text-xs font-medium text-foreground-600 dark:text-foreground-400">
                        {message.replyTo.sender.firstName || 'Пользователь'}
                      </div>
                      <div className="text-xs text-foreground-500 truncate">
                        {message.replyTo.content}
                      </div>
                    </CardBody>
                  </Card>
                )}

                {/* Message bubble */}
                <Card
                  className={`${
                    isOwn
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-default-100 dark:bg-default-50'
                  }`}
                  shadow="sm"
                >
                  <CardBody className="p-3">
                    {/* Attachments */}
                    {message.attachments && message.attachments.length > 0 && (
                      <div className="mb-2 space-y-2">
                        {message.attachments.map((att, idx) => {
                          const attUrl = att.url || att.filePath || '';
                          const attName = att.name || att.fileName || 'Вложение';
                          
                          return (
                            <div key={idx}>
                              {att.type === 'image' ? (
                                <img
                                  src={attUrl}
                                  alt={attName}
                                  className="max-w-full rounded-lg"
                                />
                              ) : (
                                <a
                                  href={attUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className={`text-sm underline ${
                                    isOwn ? 'text-primary-foreground' : 'text-primary'
                                  }`}
                                >
                                  📎 {attName}
                                </a>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {/* Content */}
                    <div className={`text-sm ${
                      isOwn ? 'text-primary-foreground' : 'text-foreground'
                    }`}>
                      <div className="prose prose-sm dark:prose-invert max-w-none">
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>
                          {message.content}
                        </ReactMarkdown>
                      </div>
                    </div>

                    {/* Reactions */}
                    {message.reactions && Object.keys(message.reactions).length > 0 && (
                      <div className="flex gap-1 mt-2 flex-wrap">
                        {Object.entries(message.reactions).map(([emoji, data]) => (
                          <Chip
                            key={emoji}
                            size="sm"
                            variant="flat"
                            className="text-xs"
                          >
                            {emoji} {data.count ?? data.userIds?.length ?? 0}
                          </Chip>
                        ))}
                      </div>
                    )}

                    {/* Edited indicator */}
                    {message.editedAt && (
                      <span className={`text-xs mt-1 ${
                        isOwn ? 'text-primary-foreground/70' : 'text-foreground-400'
                      }`}>
                        (изменено)
                      </span>
                    )}
                  </CardBody>
                </Card>

                {/* Timestamp and read status */}
                <div className="flex items-center gap-1 mt-1 px-1">
                  <span className="text-xs text-foreground-400">
                    {new Date(message.createdAt).toLocaleTimeString('ru-RU', {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </span>
                  {isOwn && (
                    <CheckCheck className="w-3 h-3 text-primary" />
                  )}
                </div>
              </div>
            </div>
          );
        })}

        {/* Typing indicator */}
        {typingUsers.size > 0 && (
          <div className="flex gap-3">
            <Avatar size="sm" className="flex-shrink-0" />
            <Card className="bg-default-100 dark:bg-default-50" shadow="sm">
              <CardBody className="p-3">
                <div className="flex gap-1">
                  <div className="w-2 h-2 bg-foreground-400 rounded-full animate-bounce" />
                  <div className="w-2 h-2 bg-foreground-400 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }} />
                  <div className="w-2 h-2 bg-foreground-400 rounded-full animate-bounce" style={{ animationDelay: '0.4s' }} />
                </div>
              </CardBody>
            </Card>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>
    </ScrollShadow>
  );
}
