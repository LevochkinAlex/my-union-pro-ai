"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import { useSession } from "next-auth/react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { DEMO_USER_ID, DEMO_MEMBER_USER_ID } from "@/lib/demo-constants";

const DEMO_ASSISTANT_STORAGE_KEY = "demo_assistant_messages";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  timestamp: number;
  id?: string; // Уникальный ID для предотвращения дубликатов
}

export default function FloatingChatBot() {
  const { data: session } = useSession();
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [userAvatar, setUserAvatar] = useState<string | null>(null);
  const [chatId, setChatId] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const conversationHistoryRef = useRef<ChatMessage[]>([]);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const isSendingMessageRef = useRef(false);
  const [isUserTyping, setIsUserTyping] = useState(false);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const isDemo = typeof window !== "undefined" && (session?.user?.id === DEMO_USER_ID || session?.user?.id === DEMO_MEMBER_USER_ID || (session?.user as { isDemo?: boolean })?.isDemo);
  
  // Вычисляем, можно ли отправить сообщение
  const canSend = input.trim().length > 0 && !isLoading;

  // Авторесайз textarea
  const adjustTextareaHeight = useCallback(() => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = "auto";
      textarea.style.height = Math.min(textarea.scrollHeight, 120) + "px";
    }
  }, []);

  useEffect(() => {
    adjustTextareaHeight();
  }, [input, adjustTextareaHeight]);

  // Загружаем аватарку пользователя (не в демо — профиля нет в БД)
  useEffect(() => {
    if (!session?.user?.id || isDemo) return;

    const loadUserAvatar = async () => {
      try {
        const response = await fetch("/api/profile");
        if (response.ok) {
          const data = await response.json();
          if (data.user?.avatarUrl) {
            setUserAvatar(data.user.avatarUrl);
          }
        }
      } catch (error) {
        console.error("[FloatingChatBot] Failed to load user avatar:", error);
      }
    };

    loadUserAvatar();
  }, [session?.user?.id, isDemo]);

  // Загружаем историю чата при открытии: демо — из localStorage, иначе из API
  useEffect(() => {
    if (!isOpen || !session?.user?.id || isSendingMessageRef.current || messages.length > 0) return;
    if (isDemo) {
      try {
        const raw = localStorage.getItem(DEMO_ASSISTANT_STORAGE_KEY);
        if (raw) {
          const parsed = JSON.parse(raw) as ChatMessage[];
          if (Array.isArray(parsed) && parsed.length > 0) {
            setMessages(parsed);
            conversationHistoryRef.current = parsed;
          }
        }
      } catch {
        // ignore
      }
      return;
    }
    loadChatHistory();
  }, [isOpen, session?.user?.id]);

  // Сохраняем историю демо в localStorage при изменении сообщений
  useEffect(() => {
    if (!isDemo || messages.length === 0) return;
    try {
      localStorage.setItem(DEMO_ASSISTANT_STORAGE_KEY, JSON.stringify(messages));
    } catch {
      // ignore
    }
  }, [isDemo, messages]);

  // Периодически синхронизируем сообщения с основным чатом (не в демо)
  useEffect(() => {
    if (isDemo || !isOpen || !chatId || !session?.user?.id) return;

    const syncInterval = setInterval(() => {
      if (!isSendingMessageRef.current) {
        loadChatHistory();
      }
    }, 3000);

    return () => clearInterval(syncInterval);
  }, [isDemo, isOpen, chatId, session?.user?.id]);

  // Автоскролл к последнему сообщению
  useEffect(() => {
    if (isOpen && (messages.length > 0 || isLoading)) {
      // Используем requestAnimationFrame для более надежного скролла
      requestAnimationFrame(() => {
        setTimeout(() => {
          messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
        }, 150);
      });
    }
  }, [messages, isOpen, isLoading]);

  // Очистка таймаута при размонтировании
  useEffect(() => {
    return () => {
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }
    };
  }, []);

  // Загрузка истории чата с ботом
  const loadChatHistory = async () => {
    if (!session?.user?.id || isSendingMessageRef.current) return;

    try {
      // Если chatId уже известен, используем его напрямую
      if (chatId) {
        const messagesResponse = await fetch(`/api/chat/${chatId}`);
        if (messagesResponse.ok) {
          const messagesData = await messagesResponse.json();
          const chatMessages = (messagesData.messages || []).map((msg: any) => ({
            role: msg.senderId === session.user.id ? "user" : "assistant",
            content: msg.content,
            timestamp: new Date(msg.createdAt).getTime(),
            id: msg.id || `${msg.senderId === session.user.id ? "user" : "assistant"}-${msg.id || Date.now()}-${Math.random()}`,
          }));
          
          // Объединяем с существующими сообщениями, избегая дубликатов
          setMessages((prev) => {
            // Создаем Set для быстрой проверки дубликатов по ID и содержимому
            const existingIds = new Set(prev.map(m => m.id).filter(Boolean));
            const existingContent = new Set(
              prev.map(m => `${m.role}:${m.content}:${Math.floor(m.timestamp / 1000)}`)
            );
            
            // Добавляем только новые сообщения
            const newMessages = chatMessages.filter(m => {
              if (m.id && existingIds.has(m.id)) return false;
              const contentKey = `${m.role}:${m.content}:${Math.floor(m.timestamp / 1000)}`;
              return !existingContent.has(contentKey);
            });
            
            if (newMessages.length === 0) return prev;
            
            // Объединяем и сортируем по времени
            const merged = [...prev, ...newMessages].sort((a, b) => a.timestamp - b.timestamp);
            conversationHistoryRef.current = merged;
            return merged;
          });
          return;
        }
      }

      // Если chatId неизвестен, получаем список чатов и ищем чат с ботом
      const chatsResponse = await fetch("/api/chat");
      if (chatsResponse.ok) {
        const chatsData = await chatsResponse.json();
        const botChat = chatsData.chats?.find((chat: any) => 
          chat.otherUser?.email === "ai-assistant@myunion.pro" ||
          (chat.otherUser?.firstName === "AI" && chat.otherUser?.lastName === "Помощник") ||
          chat.otherUser?.firstName?.includes("AI") ||
          chat.otherUser?.firstName?.includes("Помощник")
        );

        if (botChat) {
          const newChatId = botChat.id;
          // Обновляем chatId
          if (newChatId !== chatId) {
            setChatId(newChatId);
          }
          
          // Загружаем сообщения из чата
          const messagesResponse = await fetch(`/api/chat/${newChatId}`);
          if (messagesResponse.ok) {
            const messagesData = await messagesResponse.json();
            const chatMessages = (messagesData.messages || []).map((msg: any) => ({
              role: msg.senderId === session.user.id ? "user" : "assistant",
              content: msg.content,
              timestamp: new Date(msg.createdAt).getTime(),
              id: msg.id || `${msg.senderId === session.user.id ? "user" : "assistant"}-${msg.id || Date.now()}-${Math.random()}`,
            }));
            
            // Заменяем сообщения только если мы не отправляем сообщение сейчас
            if (!isSendingMessageRef.current) {
              setMessages(chatMessages);
              conversationHistoryRef.current = chatMessages;
            } else {
              // Если отправляем, объединяем с существующими, избегая дубликатов
              setMessages((prev) => {
                // Создаем Set для быстрой проверки дубликатов по ID и содержимому
                const existingIds = new Set(prev.map(m => m.id).filter(Boolean));
                const existingContent = new Set(
                  prev.map(m => `${m.role}:${m.content}:${Math.floor(m.timestamp / 1000)}`)
                );
                
                // Добавляем только новые сообщения
                const newMessages = chatMessages.filter(m => {
                  if (m.id && existingIds.has(m.id)) return false;
                  const contentKey = `${m.role}:${m.content}:${Math.floor(m.timestamp / 1000)}`;
                  return !existingContent.has(contentKey);
                });
                
                if (newMessages.length === 0) return prev;
                
                // Объединяем и сортируем по времени
                const merged = [...prev, ...newMessages].sort((a, b) => a.timestamp - b.timestamp);
                conversationHistoryRef.current = merged;
                return merged;
              });
            }
          }
        }
      }
    } catch (error) {
      console.error("[FloatingChatBot] Error loading chat history:", error);
    }
  };

  // Отправка сообщения
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedInput = input.trim();
    if (!trimmedInput || isLoading) return;
    
    // Проверяем сессию перед отправкой
    if (!session?.user?.id) {
      console.error("[FloatingChatBot] No user session");
      alert("Пожалуйста, войдите в систему для использования чата");
      return;
    }

    const userMessage = input.trim();
    setInput("");
    setIsLoading(true);
    setIsUserTyping(false);
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }
    isSendingMessageRef.current = true;

    // Добавляем сообщение пользователя с уникальным ID
    const userMsgId = `user-${Date.now()}-${Math.random()}`;
    const userMsg: ChatMessage = {
      role: "user",
      content: userMessage,
      timestamp: Date.now(),
      id: userMsgId,
    };

    setMessages((prev) => {
      // Проверяем, нет ли уже такого сообщения
      const exists = prev.some(m => m.id === userMsgId || (m.role === "user" && m.content === userMessage && Math.abs(m.timestamp - userMsg.timestamp) < 1000));
      if (exists) {
        return prev; // Не добавляем дубликат
      }
      const newMessages = [...prev, userMsg];
      // Принудительный скролл после добавления сообщения
      setTimeout(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
      }, 100);
      return newMessages;
    });
    conversationHistoryRef.current.push(userMsg);

    try {
      // Если chatId есть, отправляем через /api/chat/[chatId]
      if (chatId) {
        const response = await fetch(`/api/chat/${chatId}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            content: userMessage,
          }),
        });

        if (!response.ok) {
          throw new Error("Ошибка отправки сообщения");
        }

        const data = await response.json();

        // Перезагружаем историю для получения ответа бота
        setTimeout(() => {
          loadChatHistory();
        }, 1000);
      } else if (isDemo) {
        // Демо: только API помощника, история передаётся и сохраняется в localStorage
        const history = conversationHistoryRef.current.map((m) => ({ role: m.role, content: m.content }));
        const response = await fetch("/api/assistant/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            message: userMessage,
            history,
          }),
        });
        if (!response.ok) {
          throw new Error("Ошибка отправки сообщения");
        }
        const data = await response.json();
        const aiMsgId = `ai-${Date.now()}-${Math.random()}`;
        const aiMsg: ChatMessage = {
          role: "assistant",
          content: data.message ?? "Извините, не удалось получить ответ.",
          timestamp: Date.now(),
          id: aiMsgId,
        };
        setMessages((prev) => [...prev, aiMsg]);
        conversationHistoryRef.current = [...conversationHistoryRef.current, aiMsg];
        setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }), 100);
      } else {
        // Если chatId нет, используем старый API
        const response = await fetch("/api/assistant/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            message: userMessage,
          }),
        });

        if (!response.ok) {
          throw new Error("Ошибка отправки сообщения");
        }

        const data = await response.json();

        // Сохраняем chatId если его еще нет
        if (data.chatId && !chatId) {
          setChatId(data.chatId);
        }

        // Добавляем ответ AI с уникальным ID
        const aiMsgId = `ai-${Date.now()}-${Math.random()}`;
        const aiMsg: ChatMessage = {
          role: "assistant",
          content: data.message,
          timestamp: Date.now(),
          id: aiMsgId,
        };

        setMessages((prev) => {
          // Проверяем, нет ли уже такого сообщения
          const exists = prev.some(m => m.id === aiMsgId || (m.role === "assistant" && m.content === data.message && Math.abs(m.timestamp - aiMsg.timestamp) < 2000));
          if (exists) {
            return prev; // Не добавляем дубликат
          }
          const newMessages = [...prev, aiMsg];
          // Принудительный скролл после добавления ответа AI
          setTimeout(() => {
            messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
          }, 100);
          return newMessages;
        });
        conversationHistoryRef.current.push(aiMsg);
      }
    } catch (error) {
      console.error("[FloatingChatBot] Error sending message:", error);
      const errorMsg: ChatMessage = {
        role: "assistant",
        content: "Извините, произошла ошибка. Попробуйте еще раз.",
        timestamp: Date.now(),
      };
      setMessages((prev) => [...prev, errorMsg]);
    } finally {
      setIsLoading(false);
      // Разрешаем загрузку истории через небольшую задержку
      setTimeout(() => {
        isSendingMessageRef.current = false;
        // Принудительный скролл после завершения загрузки
        setTimeout(() => {
          messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
        }, 200);
      }, 1000);
    }
  };

  // Сброс истории при закрытии
  const handleClose = () => {
    setIsOpen(false);
    // Можно сохранить историю в localStorage для следующего открытия
    // или сбросить её
    // conversationHistoryRef.current = [];
  };

  // Не скрываем компонент, если сессия еще загружается
  // Показываем, но блокируем поле ввода до загрузки сессии
  const isSessionReady = !!session?.user?.id;

  return (
    <>
      {/* Плавающая кнопка - показываем всегда, даже если сессия еще загружается */}
      <button
        data-tour="ai-widget-button"
        onClick={() => setIsOpen(!isOpen)}
        className="fixed bottom-6 right-6 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-purple-500 to-blue-600 shadow-lg transition-all hover:from-purple-600 hover:to-blue-700 hover:shadow-xl focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-offset-2 dark:from-purple-600 dark:to-blue-700 dark:hover:from-purple-700 dark:hover:to-blue-800"
        aria-label="Открыть чат с ИИ помощником"
        disabled={!isSessionReady}
      >
        {/* Иконка ИИ */}
        <img
          src="/icon-512x512.png"
          alt="AI Помощник"
          className="h-7 w-7 object-cover rounded-full"
        />
      </button>

      {/* Чат виджет */}
      {isOpen && (
        <div className="fixed bottom-24 right-6 z-50 flex h-[600px] w-[400px] flex-col rounded-lg border border-gray-200 bg-white shadow-2xl dark:border-gray-700 dark:bg-gray-800">
          {/* Заголовок */}
          <div className="flex items-center justify-between rounded-t-lg bg-blue-600 px-4 py-3 dark:bg-blue-700">
            <div className="flex items-center gap-2">
              <div className="h-8 w-8 rounded-full bg-gradient-to-br from-purple-500 to-purple-600 flex items-center justify-center text-white shadow-md overflow-hidden">
                <img
                  src="/icon-512x512.png"
                  alt="AI Помощник"
                  className="h-full w-full object-cover"
                />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-white">Помощник</h3>
                <p className="text-xs text-blue-100">AI Ассистент</p>
              </div>
              {isDemo && (
                <button
                  type="button"
                  onClick={() => {
                    try {
                      localStorage.removeItem(DEMO_ASSISTANT_STORAGE_KEY);
                    } catch {
                      // ignore
                    }
                    setMessages([]);
                    conversationHistoryRef.current = [];
                  }}
                  className="ml-2 text-xs text-blue-100 hover:text-white underline"
                  title="Очистить историю до начального состояния"
                >
                  Очистить историю
                </button>
              )}
              {!isDemo && chatId && (
                <a
                  href={`/dashboard/chat?botChatId=${chatId}`}
                  className="ml-2 text-xs text-blue-100 hover:text-white underline"
                  onClick={(e) => {
                    e.stopPropagation();
                    window.location.href = `/dashboard/chat?botChatId=${chatId}`;
                  }}
                >
                  Открыть в чате
                </a>
              )}
            </div>
            <button
              onClick={handleClose}
              className="text-white/80 hover:text-white transition-colors"
              aria-label="Закрыть чат"
            >
              <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Сообщения */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {messages.length === 0 ? (
              <div className="flex flex-col h-full">
                {/* Приветствие */}
                <div className="text-center mb-4">
                  <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-gradient-to-br from-purple-500 to-blue-600 mb-3 shadow-lg overflow-hidden">
                    <img
                      src="/icon-512x512.png"
                      alt="AI Помощник"
                      className="w-full h-full object-cover"
                    />
                  </div>
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-1">Привет! Я ваш AI-помощник</h3>
                  <p className="text-sm text-gray-500 dark:text-gray-400">Чем могу помочь сегодня?</p>
                </div>

                {/* Подсказки с примерами вопросов */}
                <div className="flex-1 space-y-2">
                  <p className="text-xs text-gray-400 dark:text-gray-500 uppercase tracking-wide font-medium px-1">Популярные вопросы:</p>
                  
                  {/* Карточка: Профсоюз */}
                  <button
                    onClick={() => setInput("Для чего нужен профсоюз и какие преимущества даёт членство?")}
                    className="w-full text-left p-3 rounded-xl bg-gradient-to-r from-blue-50 to-purple-50 dark:from-blue-900/20 dark:to-purple-900/20 border border-blue-100 dark:border-blue-800/30 hover:shadow-md transition-all group"
                  >
                    <div className="flex items-start gap-3">
                      <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-blue-500 flex items-center justify-center">
                        <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                        </svg>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900 dark:text-white group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">Зачем нужен профсоюз?</p>
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Узнать о преимуществах членства</p>
                      </div>
                      <svg className="w-4 h-4 text-gray-400 group-hover:text-blue-500 transition-colors flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                    </div>
                  </button>

                  {/* Карточка: Обращение */}
                  <button
                    onClick={() => setInput("Как создать обращение к председателю профсоюза?")}
                    className="w-full text-left p-3 rounded-xl bg-gradient-to-r from-green-50 to-teal-50 dark:from-green-900/20 dark:to-teal-900/20 border border-green-100 dark:border-green-800/30 hover:shadow-md transition-all group"
                  >
                    <div className="flex items-start gap-3">
                      <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-green-500 flex items-center justify-center">
                        <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
                        </svg>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900 dark:text-white group-hover:text-green-600 dark:group-hover:text-green-400 transition-colors">Как создать обращение?</p>
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Связаться с председателем</p>
                      </div>
                      <svg className="w-4 h-4 text-gray-400 group-hover:text-green-500 transition-colors flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                    </div>
                  </button>

                  {/* Карточка: Скидки */}
                  <button
                    onClick={() => setInput("Как использовать скидки от партнёров профсоюза?")}
                    className="w-full text-left p-3 rounded-xl bg-gradient-to-r from-orange-50 to-amber-50 dark:from-orange-900/20 dark:to-amber-900/20 border border-orange-100 dark:border-orange-800/30 hover:shadow-md transition-all group"
                  >
                    <div className="flex items-start gap-3">
                      <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-orange-500 flex items-center justify-center">
                        <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900 dark:text-white group-hover:text-orange-600 dark:group-hover:text-orange-400 transition-colors">Как получить скидки?</p>
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Скидки до 50% от партнёров</p>
                      </div>
                      <svg className="w-4 h-4 text-gray-400 group-hover:text-orange-500 transition-colors flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                    </div>
                  </button>

                  {/* Карточка: Документы */}
                  <button
                    onClick={() => setInput("Какие документы я могу получить в профсоюзе?")}
                    className="w-full text-left p-3 rounded-xl bg-gradient-to-r from-violet-50 to-pink-50 dark:from-violet-900/20 dark:to-pink-900/20 border border-violet-100 dark:border-violet-800/30 hover:shadow-md transition-all group"
                  >
                    <div className="flex items-start gap-3">
                      <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-violet-500 flex items-center justify-center">
                        <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                        </svg>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900 dark:text-white group-hover:text-violet-600 dark:group-hover:text-violet-400 transition-colors">Документы профсоюза</p>
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Справки, заявления, членство</p>
                      </div>
                      <svg className="w-4 h-4 text-gray-400 group-hover:text-violet-500 transition-colors flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                    </div>
                  </button>
                </div>
              </div>
            ) : (
              messages.map((message, index) => (
                <div
                  key={message.id || `${message.role}-${message.timestamp}-${index}`}
                  className={`flex gap-2 ${
                    message.role === "user" ? "justify-end" : "justify-start"
                  }`}
                >
                  {message.role === "assistant" && (
                    <div className="flex-shrink-0">
                      <div className="h-8 w-8 rounded-full bg-gradient-to-br from-purple-500 to-purple-600 flex items-center justify-center text-white shadow-sm overflow-hidden">
                        <img
                          src="/icon-512x512.png"
                          alt="AI Помощник"
                          className="h-full w-full object-cover"
                        />
                      </div>
                    </div>
                  )}
                  <div
                    className={`max-w-[80%] rounded-2xl px-4 py-2 shadow-sm ${
                      message.role === "user"
                        ? "bg-blue-600 rounded-br-md"
                        : "bg-gray-200 dark:bg-gray-700 rounded-bl-md"
                    }`}
                  >
                    <div 
                      className={`text-sm leading-relaxed ${
                        message.role === "user" 
                          ? "text-white" 
                          : "text-gray-900 dark:text-gray-100"
                      }`}
                      style={{ wordBreak: "normal", overflowWrap: "break-word", hyphens: "auto" }}
                    >
                      <ReactMarkdown 
                        remarkPlugins={[remarkGfm]}
                        components={{
                          p: ({children}) => <p className="my-1">{children}</p>,
                          ul: ({children}) => <ul className="my-1 list-disc pl-4">{children}</ul>,
                          ol: ({children}) => <ol className="my-1 list-decimal pl-4">{children}</ol>,
                          li: ({children}) => <li className="my-0.5">{children}</li>,
                          strong: ({children}) => <strong className="font-semibold">{children}</strong>,
                        }}
                      >
                        {message.content}
                      </ReactMarkdown>
                    </div>
                  </div>
                  {message.role === "user" && (
                    <div className="flex-shrink-0">
                      {userAvatar ? (
                        <img
                          src={userAvatar}
                          alt="User Avatar"
                          className="h-8 w-8 rounded-full object-cover shadow-sm"
                        />
                      ) : (
                        <div className="h-8 w-8 rounded-full bg-blue-600 flex items-center justify-center text-white text-xs font-semibold shadow-sm">
                          {session?.user?.name?.charAt(0).toUpperCase() || "U"}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))
            )}
            {/* Индикатор "Бот печатает" */}
            {isLoading && (
              <div className="flex justify-start gap-2">
                <div className="flex-shrink-0">
                  <div className="h-8 w-8 rounded-full bg-gradient-to-br from-purple-500 to-purple-600 flex items-center justify-center text-white shadow-sm overflow-hidden">
                    <img
                      src="/icon-512x512.png"
                      alt="AI Помощник"
                      className="h-full w-full object-cover"
                    />
                  </div>
                </div>
                <div className="bg-gray-100 dark:bg-gray-700 rounded-2xl rounded-bl-md px-4 py-3">
                  <div className="flex items-center gap-1">
                    <span className="text-xs text-gray-500 dark:text-gray-400 mr-2">Печатает</span>
                    <div className="flex gap-1">
                      <div className="h-2 w-2 bg-gray-500 dark:bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: "0ms" }}></div>
                      <div className="h-2 w-2 bg-gray-500 dark:bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: "150ms" }}></div>
                      <div className="h-2 w-2 bg-gray-500 dark:bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: "300ms" }}></div>
                    </div>
                  </div>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Форма ввода */}
          <div className="border-t border-gray-200 dark:border-gray-700 p-4">
            {!isSessionReady && (
              <div className="mb-2 text-xs text-gray-500 dark:text-gray-400 text-center">
                Загрузка сессии...
              </div>
            )}
            <form onSubmit={handleSubmit} className="flex gap-2 items-end">
              <textarea
                ref={textareaRef}
                value={input}
                onChange={(e) => {
                  setInput(e.target.value);
                  // Показываем индикатор печати пользователя
                  setIsUserTyping(true);
                  // Очищаем предыдущий таймаут
                  if (typingTimeoutRef.current) {
                    clearTimeout(typingTimeoutRef.current);
                  }
                  // Скрываем индикатор через 2 секунды после остановки печати
                  typingTimeoutRef.current = setTimeout(() => {
                    setIsUserTyping(false);
                  }, 2000);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    if (canSend) {
                      setIsUserTyping(false);
                      if (typingTimeoutRef.current) {
                        clearTimeout(typingTimeoutRef.current);
                      }
                      handleSubmit(e);
                    }
                  }
                }}
                placeholder="Задайте вопрос..."
                rows={1}
                className="flex-1 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 disabled:opacity-50 disabled:cursor-not-allowed dark:border-gray-600 dark:bg-gray-700 dark:text-white dark:placeholder-gray-400 resize-none overflow-hidden"
                style={{ minHeight: "40px", maxHeight: "120px" }}
                disabled={isLoading}
              />
              <button
                type="submit"
                disabled={!canSend}
                className={`rounded-lg px-4 py-2 text-white transition focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 ${
                  canSend
                    ? "bg-blue-600 hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600 cursor-pointer"
                    : "bg-gray-400 dark:bg-gray-600 opacity-50 cursor-not-allowed"
                }`}
                aria-label="Отправить сообщение"
              >
                {isLoading ? (
                  <div className="h-5 w-5 animate-spin rounded-full border-2 border-white border-t-transparent"></div>
                ) : (
                  <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                  </svg>
                )}
              </button>
            </form>
          </div>
        </div>
      )}
    </>
  );
}

