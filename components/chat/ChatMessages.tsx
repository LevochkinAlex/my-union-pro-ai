"use client";

import { memo, useRef, useEffect, useCallback, useState } from "react";
import { Virtuoso, VirtuosoHandle } from "react-virtuoso";
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
  // Deprecated - не используется с Virtuoso
  onSaveScrollPosition?: (chatId: string, position: number) => void;
  getSavedScrollPosition?: (chatId: string) => number | null;
}

// Ключ для sessionStorage
const SCROLL_POSITION_KEY = "chat_scroll_positions";

// Функции для работы с sessionStorage
function saveScrollPosition(chatId: string, index: number) {
  try {
    const stored = sessionStorage.getItem(SCROLL_POSITION_KEY);
    const positions = stored ? JSON.parse(stored) : {};
    positions[chatId] = { index, timestamp: Date.now() };
    sessionStorage.setItem(SCROLL_POSITION_KEY, JSON.stringify(positions));
  } catch {
    // sessionStorage недоступен
  }
}

function getScrollPosition(chatId: string): number | null {
  try {
    const stored = sessionStorage.getItem(SCROLL_POSITION_KEY);
    if (!stored) return null;
    const positions = JSON.parse(stored);
    const data = positions[chatId];
    // Позиция актуальна в течение 30 минут
    if (data && Date.now() - data.timestamp < 30 * 60 * 1000) {
      return data.index;
    }
    return null;
  } catch {
    return null;
  }
}

// Подготовка данных с разделителями дат
interface MessageOrDate {
  type: "message" | "date";
  message?: Message;
  date?: string;
}

function prepareMessagesWithDates(messages: Message[]): MessageOrDate[] {
  const result: MessageOrDate[] = [];
  let currentDate = "";

  messages.forEach((message) => {
    const date = formatMessageDate(message.createdAt);
    
    if (date !== currentDate) {
      result.push({ type: "date", date });
      currentDate = date;
    }
    result.push({ type: "message", message });
  });

  return result;
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
  const virtuosoRef = useRef<VirtuosoHandle>(null);
  const prevChatId = useRef<string | null>(null);
  const currentVisibleIndex = useRef<number | null>(null);
  const [atBottom, setAtBottom] = useState(true);

  // Подготовка данных с разделителями дат
  const items = prepareMessagesWithDates(messages);

  // При смене чата — сохраняем позицию старого
  useEffect(() => {
    if (prevChatId.current && prevChatId.current !== chat.id) {
      // Сохраняем текущую позицию для предыдущего чата
      const savedIdx = currentVisibleIndex.current;
      if (savedIdx !== null && savedIdx >= 0) {
        saveScrollPosition(prevChatId.current, savedIdx);
      }
    }
    prevChatId.current = chat.id;
  }, [chat.id]);

  // Сохранение позиции при скролле (debounced)
  const savePositionTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  
  const handleRangeChanged = useCallback((range: { startIndex: number; endIndex: number }) => {
    // Запоминаем текущую позицию
    currentVisibleIndex.current = range.startIndex;
    
    // Сохраняем позицию с debounce
    if (savePositionTimeoutRef.current) {
      clearTimeout(savePositionTimeoutRef.current);
    }
    savePositionTimeoutRef.current = setTimeout(() => {
      saveScrollPosition(chat.id, range.startIndex);
    }, 300);
  }, [chat.id]);

  // Cleanup при размонтировании
  useEffect(() => {
    return () => {
      if (savePositionTimeoutRef.current) {
        clearTimeout(savePositionTimeoutRef.current);
      }
      // Сохраняем позицию при уходе
      if (currentVisibleIndex.current !== null) {
        saveScrollPosition(chat.id, currentVisibleIndex.current);
      }
    };
  }, [chat.id]);

  // Автоскролл к низу при новых сообщениях (если пользователь был внизу)
  const handleFollowOutput = useCallback(() => {
    return atBottom ? "smooth" : false;
  }, [atBottom]);

  // Загрузка старых сообщений при скролле вверх
  const handleStartReached = useCallback(() => {
    if (hasMore && !loadingOlder) {
      onLoadMore();
    }
  }, [hasMore, loadingOlder, onLoadMore]);

  // Рендер элемента (сообщение или разделитель даты)
  const itemContent = useCallback((index: number, item: MessageOrDate) => {
    if (item.type === "date") {
      return (
        <div className="flex items-center justify-center my-4">
          <div className="bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-400 text-xs px-3 py-1 rounded-full">
            {item.date}
          </div>
        </div>
      );
    }

    if (item.type === "message" && item.message) {
      return (
        <MessageItem
          message={item.message}
          currentUserId={currentUserId}
          isOwn={item.message.senderId === currentUserId}
          onReply={onReply}
          onEdit={onEdit}
          onDelete={onDelete}
          onForward={onForward}
          onReaction={onReaction}
          onImageClick={onImageClick}
        />
      );
    }

    return null;
  }, [currentUserId, onReply, onEdit, onDelete, onForward, onReaction, onImageClick]);

  if (loading) {
    return <LoadingState />;
  }

  if (messages.length === 0) {
    return <EmptyState chat={chat} />;
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <Virtuoso
        key={chat.id}
        ref={virtuosoRef}
        data={items}
        itemContent={itemContent}
        initialTopMostItemIndex={items.length > 0 ? items.length - 1 : 0}
        followOutput={handleFollowOutput}
        atBottomStateChange={setAtBottom}
        startReached={handleStartReached}
        rangeChanged={handleRangeChanged}
        increaseViewportBy={{ top: 200, bottom: 200 }}
        className="flex-1 overflow-y-auto"
        style={{ height: "100%" }}
        components={{
          Header: () => (
            <>
              {loadingOlder && (
                <div className="flex justify-center py-2">
                  <div className="inline-block h-5 w-5 animate-spin rounded-full border-2 border-solid border-blue-500 border-r-transparent" />
                </div>
              )}
              {hasMore && !loadingOlder && (
                <div className="flex justify-center py-2">
                  <button
                    onClick={onLoadMore}
                    className="text-sm text-blue-500 hover:text-blue-600 dark:text-blue-400 dark:hover:text-blue-300"
                  >
                    Загрузить ранние сообщения
                  </button>
                </div>
              )}
            </>
          ),
          Footer: () => (
            <>
              {isBotTyping && <TypingIndicator />}
            </>
          ),
        }}
      />
    </div>
  );
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
    <div className="flex justify-start mb-2 px-4">
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
