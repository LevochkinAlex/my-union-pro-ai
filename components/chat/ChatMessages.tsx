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
  onProfileClick?: (userId: string) => void;
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
  onProfileClick,
}: ChatMessagesProps) {
  // Определяем, является ли чат групповым или чатом обращения (показываем имена отправителей)
  const isGroupChat = chat.type === "GROUP" || !!chat.ticketId;
  const virtuosoRef = useRef<VirtuosoHandle>(null);
  const prevChatId = useRef<string | null>(null);
  const currentVisibleIndex = useRef<number | null>(null);
  const [atBottom, setAtBottom] = useState(true);
  const hasInitialized = useRef(false);
  const initialScrollDone = useRef(false);
  const previousItemsLength = useRef<number>(0);
  const scrollPositionBeforeLoad = useRef<number | null>(null);

  // Подготовка данных с разделителями дат
  const items = prepareMessagesWithDates(messages);

  // При смене чата — сохраняем позицию старого и сбрасываем флаг инициализации
  useEffect(() => {
    if (prevChatId.current && prevChatId.current !== chat.id) {
      // Сохраняем текущую позицию для предыдущего чата
      const savedIdx = currentVisibleIndex.current;
      if (savedIdx !== null && savedIdx >= 0) {
        saveScrollPosition(prevChatId.current, savedIdx);
      }
      // Сбрасываем флаги при смене чата
      hasInitialized.current = false;
      initialScrollDone.current = false;
      setAtBottom(true);
      previousItemsLength.current = 0;
      scrollPositionBeforeLoad.current = null;
    }
    prevChatId.current = chat.id;
  }, [chat.id]);

  // Восстановление позиции после загрузки сообщений (только один раз при смене чата)
  useEffect(() => {
    // Если уже выполнили первоначальный скролл, не делаем повторно
    if (initialScrollDone.current || items.length === 0 || !virtuosoRef.current) {
      return;
    }

    // Инициализируем previousItemsLength при первой загрузке
    if (previousItemsLength.current === 0) {
      previousItemsLength.current = items.length;
    }

    // Даём время на рендер списка
    const timeoutId = setTimeout(() => {
      if (!virtuosoRef.current || items.length === 0) return;
      
      const savedIndex = getScrollPosition(chat.id);
      const lastIndex = items.length - 1;
      
      // Если сохранённая позиция близка к концу (в пределах 5 сообщений), скроллим к концу
      const distanceFromEnd = savedIndex !== null ? lastIndex - savedIndex : Infinity;
      const shouldScrollToEnd = savedIndex === null || distanceFromEnd <= 5;
      
      if (shouldScrollToEnd) {
        // Скроллим к концу (последние сообщения)
        virtuosoRef.current.scrollToIndex({
          index: "LAST",
          align: "end",
          behavior: "auto",
        });
        currentVisibleIndex.current = lastIndex;
        saveScrollPosition(chat.id, lastIndex);
      } else if (savedIndex !== null && savedIndex >= 0 && savedIndex < items.length) {
        // Восстанавливаем сохранённую позицию
        virtuosoRef.current.scrollToIndex({
          index: savedIndex,
          align: "start",
          behavior: "auto",
        });
        currentVisibleIndex.current = savedIndex;
      } else {
        // Если позиция некорректна, скроллим к концу
        virtuosoRef.current.scrollToIndex({
          index: "LAST",
          align: "end",
          behavior: "auto",
        });
        currentVisibleIndex.current = lastIndex;
      }
      
      initialScrollDone.current = true;
      hasInitialized.current = true;
    }, 200);
    
    return () => clearTimeout(timeoutId);
  }, [chat.id, items.length]);

  // Сохранение позиции при скролле (debounced)
  const savePositionTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  
  const handleRangeChanged = useCallback((range: { startIndex: number; endIndex: number }) => {
    // Запоминаем текущую позицию
    currentVisibleIndex.current = range.startIndex;
    
    // Проверяем, близко ли к концу
    const lastIndex = items.length - 1;
    const distanceFromEnd = lastIndex - range.endIndex;
    const isNearBottom = distanceFromEnd <= 3;
    
    // Обновляем состояние atBottom для автоскролла
    setAtBottom(isNearBottom);
    
    // Сохраняем позицию с debounce (только если инициализация завершена)
    if (!hasInitialized.current) return;
    
    if (savePositionTimeoutRef.current) {
      clearTimeout(savePositionTimeoutRef.current);
    }
    savePositionTimeoutRef.current = setTimeout(() => {
      // Если пользователь близко к концу (в пределах 3 сообщений), сохраняем как конец
      const indexToSave = isNearBottom ? lastIndex : range.startIndex;
      
      saveScrollPosition(chat.id, indexToSave);
      currentVisibleIndex.current = indexToSave;
    }, 500);
  }, [chat.id, items.length]);

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
  const handleFollowOutput = useCallback((isAtBottom: boolean) => {
    // Если пользователь внизу или близко к низу, следим за новыми сообщениями
    return isAtBottom ? "smooth" : false;
  }, []);

  // Восстановление позиции скролла после загрузки старых сообщений
  useEffect(() => {
    if (items.length > previousItemsLength.current && previousItemsLength.current > 0 && loadingOlder) {
      // Старые сообщения были добавлены в начало
      const addedCount = items.length - previousItemsLength.current;
      
      // Восстанавливаем позицию скролла, учитывая добавленные сообщения
      if (scrollPositionBeforeLoad.current !== null && virtuosoRef.current) {
        const newIndex = scrollPositionBeforeLoad.current + addedCount;
        
        // Используем двойной requestAnimationFrame для гарантированного восстановления после рендера
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            if (virtuosoRef.current && newIndex < items.length && newIndex >= 0) {
              virtuosoRef.current.scrollToIndex({
                index: newIndex,
                align: "start",
                behavior: "auto",
              });
              currentVisibleIndex.current = newIndex;
              scrollPositionBeforeLoad.current = null;
            }
          });
        });
      }
    }
    previousItemsLength.current = items.length;
  }, [items.length, loadingOlder]);

  // Загрузка старых сообщений при скролле вверх
  const handleStartReached = useCallback(() => {
    if (hasMore && !loadingOlder) {
      // Сохраняем текущую позицию перед загрузкой
      if (currentVisibleIndex.current !== null) {
        scrollPositionBeforeLoad.current = currentVisibleIndex.current;
      }
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
      // Определяем, является ли сообщение "старым" (не в последних 15 сообщениях)
      const lastIndex = items.length - 1;
      const distanceFromEnd = lastIndex - index;
      const isOldMessage = distanceFromEnd > 15;
      
      return (
        <MessageItem
          message={item.message}
          currentUserId={currentUserId}
          isOwn={item.message.senderId === currentUserId}
          isOldMessage={isOldMessage}
          showSenderName={isGroupChat}
          onReply={onReply}
          onEdit={onEdit}
          onDelete={onDelete}
          onForward={onForward}
          onReaction={onReaction}
          onImageClick={onImageClick}
          onProfileClick={onProfileClick}
        />
      );
    }

    return null;
  }, [currentUserId, isGroupChat, onReply, onEdit, onDelete, onForward, onReaction, onImageClick, onProfileClick]);

  if (loading) {
    return <LoadingState />;
  }

  if (messages.length === 0) {
    return <EmptyState chat={chat} />;
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden min-h-0 w-full max-w-full min-w-0">
      <Virtuoso
        key={chat.id}
        ref={virtuosoRef}
        data={items}
        itemContent={itemContent}
        followOutput={handleFollowOutput}
        atBottomStateChange={(isAtBottom) => {
          setAtBottom(isAtBottom);
          // Если пользователь достиг низа, сохраняем позицию
          if (isAtBottom && hasInitialized.current && items.length > 0) {
            const lastIndex = items.length - 1;
            saveScrollPosition(chat.id, lastIndex);
            currentVisibleIndex.current = lastIndex;
          }
        }}
        startReached={handleStartReached}
        rangeChanged={handleRangeChanged}
        increaseViewportBy={{ top: 200, bottom: 400 }}
        className="flex-1 w-full max-w-full min-w-0"
        style={{ height: "100%", width: "100%", maxWidth: "100%", overflowX: "hidden" }}
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
            <div style={{ paddingBottom: "140px", minHeight: "140px" }}>
              {isBotTyping && <TypingIndicator />}
            </div>
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
