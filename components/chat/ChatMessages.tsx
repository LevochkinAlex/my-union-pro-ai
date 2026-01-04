"use client";

import { memo, useRef, useEffect, useCallback, useState } from "react";
import { Virtuoso, VirtuosoHandle } from "react-virtuoso";
import { Message, Chat } from "@/types/chat";
import { MessageItem } from "./MessageItem";
import { formatMessageDate, getNameInitials, getInitials, getUserName } from "@/lib/chat-utils";

// Большое начальное значение для firstItemIndex (для поддержки prepend)
const START_INDEX = 100000;

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
  const [atBottom, setAtBottom] = useState(true);
  const hasInitialized = useRef(false);
  
  // Для prepend паттерна: отслеживаем firstItemIndex
  const [firstItemIndex, setFirstItemIndex] = useState(START_INDEX);
  const prevMessagesLength = useRef(0);

  // Подготовка данных с разделителями дат
  const items = prepareMessagesWithDates(messages);

  // При смене чата — сбрасываем состояние
  useEffect(() => {
    if (prevChatId.current !== chat.id) {
      hasInitialized.current = false;
      setAtBottom(true);
      setFirstItemIndex(START_INDEX);
      prevMessagesLength.current = 0;
    }
    prevChatId.current = chat.id;
  }, [chat.id]);

  // Обновляем firstItemIndex при добавлении старых сообщений (prepend)
  useEffect(() => {
    if (items.length > prevMessagesLength.current && prevMessagesLength.current > 0 && hasInitialized.current) {
      // Проверяем, это prepend (старые сообщения) или append (новые)
      // При prepend первое сообщение меняется, при append - нет
      const addedCount = items.length - prevMessagesLength.current;
      
      // Если загружались старые сообщения, уменьшаем firstItemIndex
      // чтобы Virtuoso сохранил позицию скролла
      if (loadingOlder) {
        setFirstItemIndex(prev => prev - addedCount);
      }
    }
    prevMessagesLength.current = items.length;
  }, [items.length, loadingOlder]);

  // Начальный скролл к концу при загрузке чата
  useEffect(() => {
    if (!hasInitialized.current && items.length > 0 && virtuosoRef.current) {
      // Небольшая задержка для рендера
      const timeoutId = setTimeout(() => {
        if (virtuosoRef.current) {
          virtuosoRef.current.scrollToIndex({
            index: items.length - 1,
            align: "end",
            behavior: "auto",
          });
          hasInitialized.current = true;
        }
      }, 100);
      return () => clearTimeout(timeoutId);
    }
  }, [items.length]);

  // Скролл к низу при отправке нового сообщения текущим пользователем
  const lastMessageIdRef = useRef<string | null>(null);
  const prevMessagesCountRef = useRef(0);
  
  useEffect(() => {
    if (messages.length === 0 || !hasInitialized.current) return;
    
    const lastMessage = messages[messages.length - 1];
    const isNewMessage = messages.length > prevMessagesCountRef.current;
    const isOwnMessage = lastMessage?.senderId === currentUserId;
    const isReallyNew = lastMessage?.id !== lastMessageIdRef.current;
    
    // Скроллим если: новое сообщение от текущего пользователя ИЛИ пользователь был внизу
    if (isReallyNew && isNewMessage && (isOwnMessage || atBottom)) {
      // Используем requestAnimationFrame для плавности
      requestAnimationFrame(() => {
        virtuosoRef.current?.scrollToIndex({
          index: items.length - 1,
          align: "end",
          behavior: isOwnMessage ? "auto" : "smooth", // Мгновенно для своих, плавно для чужих
        });
      });
    }
    
    // Обновляем refs
    if (lastMessage) {
      lastMessageIdRef.current = lastMessage.id;
    }
    prevMessagesCountRef.current = messages.length;
  }, [messages, currentUserId, items.length, atBottom]);

  // Автоскролл к низу при новых сообщениях (если пользователь был внизу)
  const handleFollowOutput = useCallback((isAtBottom: boolean) => {
    return isAtBottom ? "smooth" : false;
  }, []);

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
      // Определяем, является ли сообщение "старым" (не в последних 15 сообщениях)
      const lastIndex = items.length - 1;
      // index здесь - это виртуальный индекс, нужно получить реальный
      const realIndex = index - firstItemIndex;
      const distanceFromEnd = lastIndex - realIndex;
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
  }, [currentUserId, isGroupChat, firstItemIndex, items.length, onReply, onEdit, onDelete, onForward, onReaction, onImageClick, onProfileClick]);

  if (loading) {
    return <LoadingState />;
  }

  if (messages.length === 0) {
    return <EmptyState chat={chat} />;
  }

  return (
    <div className="h-full w-full overflow-hidden">
      <Virtuoso
        key={chat.id}
        ref={virtuosoRef}
        data={items}
        firstItemIndex={firstItemIndex}
        initialTopMostItemIndex={items.length - 1}
        itemContent={itemContent}
        followOutput={handleFollowOutput}
        atBottomStateChange={setAtBottom}
        startReached={handleStartReached}
        alignToBottom
        overscan={{ main: 200, reverse: 200 }}
        className="h-full w-full"
        style={{ 
          overscrollBehavior: "contain",
          WebkitOverflowScrolling: "touch",
        }}
        components={{
          Header: () => (
            <>
              {loadingOlder && (
                <div className="flex justify-center py-3">
                  <div className="inline-block h-5 w-5 animate-spin rounded-full border-2 border-solid border-blue-500 border-r-transparent" />
                </div>
              )}
              {hasMore && !loadingOlder && (
                <div className="flex justify-center py-3">
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
            <div className="pb-4">
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
  // Для групп - название и инициалы от названия
  // Для личных чатов - имя пользователя и его инициалы
  const isGroup = chat.type === "GROUP";
  const name = isGroup ? (chat.name || "Группа") : getUserName(chat.otherUser);
  const initials = isGroup ? getNameInitials(chat.name) : getInitials(chat.otherUser);
  const gradientClass = isGroup 
    ? "from-green-500 to-teal-600" 
    : "from-blue-500 to-purple-600";

  // Проверяем наличие аватарки (для групп - iconUrl, для личных - otherUser.avatarUrl)
  const avatarUrl = isGroup ? chat.iconUrl : chat.otherUser?.avatarUrl;

  return (
    <div className="flex-1 flex items-center justify-center">
      <div className="text-center p-6">
        {avatarUrl ? (
          <img 
            src={avatarUrl} 
            alt={name} 
            className="w-20 h-20 mx-auto mb-4 rounded-full object-cover"
          />
        ) : (
          <div className={`w-20 h-20 mx-auto mb-4 rounded-full bg-gradient-to-br ${gradientClass} flex items-center justify-center text-white text-2xl font-semibold`}>
            {initials}
          </div>
        )}
        <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-1">
          {name}
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
