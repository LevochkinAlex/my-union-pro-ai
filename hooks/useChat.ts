"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { Chat, Message } from "@/types/chat";

interface UseChatOptions {
  onError?: (error: string) => void;
}

export function useChat(options: UseChatOptions = {}) {
  const [chats, setChats] = useState<Chat[]>([]);
  const [selectedChat, setSelectedChat] = useState<Chat | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [sending, setSending] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [oldestMessageId, setOldestMessageId] = useState<string | null>(null);
  const [isBotTyping, setIsBotTyping] = useState(false);
  
  const messagesRef = useRef<Message[]>([]);
  const refreshIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Синхронизация ref с messages
  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  // Загрузка списка чатов
  const loadChats = useCallback(async () => {
    try {
      const response = await fetch("/api/chat");
      if (response.ok) {
        const data = await response.json();
        setChats(data.chats || []);
      }
    } catch (error) {
      console.error("[useChat] Error loading chats:", error);
      options.onError?.("Ошибка загрузки чатов");
    } finally {
      setLoading(false);
    }
  }, [options.onError]);

  // Загрузка сообщений чата
  const loadMessages = useCallback(async (chatId: string, silent = false) => {
    if (!silent) {
      setLoadingMessages(true);
    }

    try {
      // При silent-запросе (polling) запрашиваем только новые сообщения
      const url = silent 
        ? `/api/chat/${chatId}?limit=20&t=${Date.now()}`  // Меньше сообщений для polling
        : `/api/chat/${chatId}?limit=50&t=${Date.now()}`;
      const response = await fetch(url);
      if (response.ok) {
        const data = await response.json();
        const newMessages = data.messages || [];
        
        if (silent) {
          // При фоновом обновлении добавляем только новые сообщения
          setMessages(prev => {
            const existingIds = new Set(prev.map(m => m.id));
            const newOnly = newMessages.filter((m: Message) => !existingIds.has(m.id));
            return newOnly.length > 0 ? [...prev, ...newOnly] : prev;
          });
        } else {
          setMessages(newMessages);
        }
        
        setHasMore(data.pagination?.hasMore || false);
        setOldestMessageId(data.pagination?.oldestMessageId || null);
      }
    } catch (error) {
      console.error("[useChat] Error loading messages:", error);
      if (!silent) {
        options.onError?.("Ошибка загрузки сообщений");
      }
    } finally {
      if (!silent) {
        setLoadingMessages(false);
      }
    }
  }, [options.onError]);

  // Загрузка старых сообщений
  const loadOlderMessages = useCallback(async () => {
    if (!selectedChat || !oldestMessageId || loadingOlder) return;

    setLoadingOlder(true);
    try {
      const response = await fetch(
        `/api/chat/${selectedChat.id}?limit=50&cursor=${oldestMessageId}&direction=older&t=${Date.now()}`
      );
      
      if (response.ok) {
        const data = await response.json();
        const olderMessages = data.messages || [];
        
        if (olderMessages.length > 0) {
          setMessages(prev => [...olderMessages, ...prev]);
          setHasMore(data.pagination?.hasMore || false);
          setOldestMessageId(data.pagination?.oldestMessageId || null);
        } else {
          setHasMore(false);
        }
      }
    } catch (error) {
      console.error("[useChat] Error loading older messages:", error);
    } finally {
      setLoadingOlder(false);
    }
  }, [selectedChat, oldestMessageId, loadingOlder]);

  // Выбор чата
  const selectChat = useCallback((chat: Chat | null) => {
    // Очищаем интервал обновления предыдущего чата
    if (refreshIntervalRef.current) {
      clearInterval(refreshIntervalRef.current);
      refreshIntervalRef.current = null;
    }

    setSelectedChat(chat);
    setMessages([]);
    setHasMore(false);
    setOldestMessageId(null);
    setIsBotTyping(false);

    if (chat) {
      loadMessages(chat.id);
      
      // Автообновление каждые 10 секунд (было 5)
      refreshIntervalRef.current = setInterval(() => {
        loadMessages(chat.id, true);
      }, 10000);
    }
  }, [loadMessages]);

  // Создание или открытие чата
  const createOrOpenChat = useCallback(async (userId: string): Promise<Chat | null> => {
    try {
      // Сначала проверяем существующие чаты
      const existingChat = chats.find(c => c.otherUser.id === userId);
      if (existingChat) {
        selectChat(existingChat);
        return existingChat;
      }

      // Создаём новый чат
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ participantId: userId }),
      });

      if (response.ok) {
        const data = await response.json();
        const newChat = data.chat;
        
        // Добавляем чат в список
        setChats(prev => {
          const exists = prev.some(c => c.id === newChat.id);
          return exists ? prev : [newChat, ...prev];
        });
        
        selectChat(newChat);
        return newChat;
      }
    } catch (error) {
      console.error("[useChat] Error creating chat:", error);
      options.onError?.("Ошибка создания чата");
    }
    return null;
  }, [chats, selectChat, options.onError]);

  // Отправка сообщения
  const sendMessage = useCallback(async (
    content: string,
    file?: File,
    replyToId?: string
  ): Promise<boolean> => {
    if (!selectedChat) return false;

    setSending(true);
    try {
      let response;

      if (file) {
        // Отправка с файлом
        const formData = new FormData();
        formData.append("content", content);
        formData.append("file", file);
        if (replyToId) formData.append("replyToId", replyToId);

        response = await fetch(`/api/chat/${selectedChat.id}/attachments`, {
          method: "POST",
          body: formData,
        });
      } else {
        // Текстовое сообщение
        response = await fetch(`/api/chat/${selectedChat.id}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content, replyToId }),
        });
      }

      if (response.ok) {
        const data = await response.json();
        const newMessage = data.message;
        
        // Добавляем сообщение в список
        setMessages(prev => [...prev, newMessage]);
        
        // Обновляем последнее сообщение в чате
        setChats(prev => prev.map(chat => 
          chat.id === selectedChat.id
            ? { ...chat, lastMessage: content || "[Файл]", lastMessageAt: new Date() }
            : chat
        ));
        
        return true;
      }
    } catch (error) {
      console.error("[useChat] Error sending message:", error);
      options.onError?.("Ошибка отправки сообщения");
    } finally {
      setSending(false);
    }
    return false;
  }, [selectedChat, options.onError]);

  // Редактирование сообщения
  const editMessage = useCallback(async (
    messageId: string,
    content: string
  ): Promise<boolean> => {
    if (!selectedChat) return false;

    try {
      const response = await fetch(`/api/chat/${selectedChat.id}/messages/${messageId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content }),
      });

      if (response.ok) {
        const data = await response.json();
        setMessages(prev => prev.map(m => m.id === messageId ? data.message : m));
        return true;
      }
    } catch (error) {
      console.error("[useChat] Error editing message:", error);
      options.onError?.("Ошибка редактирования сообщения");
    }
    return false;
  }, [selectedChat, options.onError]);

  // Удаление сообщения
  const deleteMessage = useCallback(async (messageId: string): Promise<boolean> => {
    if (!selectedChat) return false;

    try {
      const response = await fetch(`/api/chat/${selectedChat.id}/messages/${messageId}`, {
        method: "DELETE",
      });

      if (response.ok) {
        setMessages(prev => prev.map(m => 
          m.id === messageId ? { ...m, deletedAt: new Date().toISOString() } : m
        ));
        return true;
      }
    } catch (error) {
      console.error("[useChat] Error deleting message:", error);
      options.onError?.("Ошибка удаления сообщения");
    }
    return false;
  }, [selectedChat, options.onError]);

  // Реакция на сообщение
  const toggleReaction = useCallback(async (
    messageId: string,
    emoji: string
  ): Promise<boolean> => {
    if (!selectedChat) return false;

    try {
      const response = await fetch(`/api/chat/${selectedChat.id}/messages/${messageId}/reactions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ emoji }),
      });

      if (response.ok) {
        // Перезагружаем сообщения для обновления реакций
        loadMessages(selectedChat.id, true);
        return true;
      }
    } catch (error) {
      console.error("[useChat] Error toggling reaction:", error);
    }
    return false;
  }, [selectedChat, loadMessages]);

  // Пересылка сообщения
  const forwardMessage = useCallback(async (
    messageId: string,
    targetUserId: string
  ): Promise<boolean> => {
    try {
      const response = await fetch("/api/chat/forward", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messageId, targetUserId }),
      });

      if (response.ok) {
        await loadChats(); // Обновляем список чатов
        return true;
      }
    } catch (error) {
      console.error("[useChat] Error forwarding message:", error);
      options.onError?.("Ошибка пересылки сообщения");
    }
    return false;
  }, [loadChats, options.onError]);

  // Очистка при размонтировании
  useEffect(() => {
    return () => {
      if (refreshIntervalRef.current) {
        clearInterval(refreshIntervalRef.current);
      }
    };
  }, []);

  return {
    // Состояние
    chats,
    selectedChat,
    messages,
    loading,
    loadingMessages,
    loadingOlder,
    sending,
    hasMore,
    isBotTyping,
    
    // Действия
    loadChats,
    loadMessages,
    loadOlderMessages,
    selectChat,
    createOrOpenChat,
    sendMessage,
    editMessage,
    deleteMessage,
    toggleReaction,
    forwardMessage,
  };
}

