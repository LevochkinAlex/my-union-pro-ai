"use client";

import { memo, useRef, useEffect, useCallback } from "react";
import { Message, Chat } from "@/types/chat";
import { MessageItem } from "./MessageItem";
import { formatMessageDate } from "@/lib/chat-utils";

interface ChatMessagesProps {
  chat: Chat;
  messages: Message[];
  currentUserId: string | null;
  loading: boolean;
  loadingOlder: boolean;
  hasMore: boolean;
  isBotTyping?: boolean;
  onLoadMore: () => void;
  onReply: (message: Message) => void;
  onEdit: (message: Message) => void;
  onDelete: (messageId: string) => void;
  onForward: (message: Message) => void;
  onReaction: (messageId: string, emoji: string) => void;
  onImageClick: (url: string, name?: string) => void;
}

function ChatMessagesComponent({
  chat,
  messages,
  currentUserId,
  loading,
  loadingOlder,
  hasMore,
  isBotTyping,
  onLoadMore,
  onReply,
  onEdit,
  onDelete,
  onForward,
  onReaction,
  onImageClick,
}: ChatMessagesProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const isUserScrolling = useRef(false);
  const lastScrollTop = useRef(0);

  // Обработка скролла для загрузки старых сообщений
  const handleScroll = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;

    const { scrollTop, scrollHeight, clientHeight } = container;
    
    // Определяем направление скролла
    isUserScrolling.current = scrollTop < lastScrollTop.current;
    lastScrollTop.current = scrollTop;

    // Загрузка старых сообщений при скролле вверх
    if (scrollTop < 100 && hasMore && !loadingOlder) {
      onLoadMore();
    }
  }, [hasMore, loadingOlder, onLoadMore]);

  // Скролл к последнему сообщению при новых сообщениях
  useEffect(() => {
    if (!isUserScrolling.current && messages.length > 0) {
      endRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages.length]);

  // Группировка сообщений по дням
  const groupedMessages = groupMessagesByDate(messages);

  if (loading) {
    return <LoadingState />;
  }

  if (messages.length === 0) {
    return <EmptyState chat={chat} />;
  }

  return (
    <div
      ref={containerRef}
      className="flex-1 overflow-y-auto p-4 space-y-4"
      onScroll={handleScroll}
    >
      {/* Индикатор загрузки старых сообщений */}
      {loadingOlder && (
        <div className="flex justify-center py-2">
          <div className="inline-block h-5 w-5 animate-spin rounded-full border-2 border-solid border-blue-500 border-r-transparent" />
        </div>
      )}

      {/* Кнопка загрузки старых */}
      {hasMore && !loadingOlder && (
        <div className="flex justify-center">
          <button
            onClick={onLoadMore}
            className="text-sm text-blue-500 hover:text-blue-600 dark:text-blue-400 dark:hover:text-blue-300"
          >
            Загрузить ранние сообщения
          </button>
        </div>
      )}

      {/* Сообщения сгруппированные по датам */}
      {groupedMessages.map(({ date, messages: dayMessages }) => (
        <div key={date}>
          {/* Разделитель даты */}
          <div className="flex items-center justify-center my-4">
            <div className="bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-400 text-xs px-3 py-1 rounded-full">
              {date}
            </div>
          </div>

          {/* Сообщения за день */}
          {dayMessages.map((message) => (
            <MessageItem
              key={message.id}
              message={message}
              currentUserId={currentUserId}
              isOwn={message.senderId === currentUserId}
              onReply={onReply}
              onEdit={onEdit}
              onDelete={onDelete}
              onForward={onForward}
              onReaction={onReaction}
              onImageClick={onImageClick}
            />
          ))}
        </div>
      ))}

      {/* Индикатор печатания бота */}
      {isBotTyping && <TypingIndicator />}

      {/* Якорь для скролла */}
      <div ref={endRef} />
    </div>
  );
}

// Группировка сообщений по дате
function groupMessagesByDate(messages: Message[]): { date: string; messages: Message[] }[] {
  const groups: { date: string; messages: Message[] }[] = [];
  let currentDate = "";
  let currentGroup: Message[] = [];

  messages.forEach((message) => {
    const date = formatMessageDate(message.createdAt);
    
    if (date !== currentDate) {
      if (currentGroup.length > 0) {
        groups.push({ date: currentDate, messages: currentGroup });
      }
      currentDate = date;
      currentGroup = [message];
    } else {
      currentGroup.push(message);
    }
  });

  if (currentGroup.length > 0) {
    groups.push({ date: currentDate, messages: currentGroup });
  }

  return groups;
}

const LoadingState = memo(function LoadingState() {
  return (
    <div className="flex-1 flex items-center justify-center">
      <div className="text-center">
        <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-blue-500 border-r-transparent" />
        <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">Загрузка сообщений...</p>
      </div>
    </div>
  );
});

const EmptyState = memo(function EmptyState({ chat }: { chat: Chat }) {
  return (
    <div className="flex-1 flex items-center justify-center">
      <div className="text-center p-6">
        <div className="w-20 h-20 mx-auto mb-4 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white text-2xl font-semibold">
          {chat.otherUser.firstName?.[0] || "?"}
          {chat.otherUser.lastName?.[0] || ""}
        </div>
        <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-1">
          {[chat.otherUser.lastName, chat.otherUser.firstName].filter(Boolean).join(" ")}
        </h3>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Начните переписку!
        </p>
      </div>
    </div>
  );
});

const TypingIndicator = memo(function TypingIndicator() {
  return (
    <div className="flex justify-start mb-2">
      <div className="px-4 py-3 rounded-2xl bg-gray-100 dark:bg-gray-700 rounded-bl-md">
        <div className="flex items-center gap-1">
          <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
          <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
          <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
        </div>
      </div>
    </div>
  );
});

export const ChatMessages = memo(ChatMessagesComponent);
export default ChatMessages;

