"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import { useSession } from "next-auth/react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

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

  // Загружаем аватарку пользователя
  useEffect(() => {
    if (!session?.user?.id) return;

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
  }, [session?.user?.id]);

  // Загружаем историю чата с ботом при открытии
  useEffect(() => {
    if (isOpen && session?.user?.id && !isSendingMessageRef.current && messages.length === 0) {
      loadChatHistory();
    }
  }, [isOpen, session?.user?.id]);

  // Автоскролл к последнему сообщению
  useEffect(() => {
    if (isOpen && messages.length > 0) {
      setTimeout(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
      }, 100);
    }
  }, [messages, isOpen]);

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
      // Получаем список чатов и ищем чат с ботом
      const chatsResponse = await fetch("/api/chat");
      if (chatsResponse.ok) {
        const chatsData = await chatsResponse.json();
        const botChat = chatsData.chats?.find((chat: any) => 
          chat.otherUser?.email === "ai-assistant@myunion.pro" ||
          (chat.otherUser?.firstName === "AI" && chat.otherUser?.lastName === "Помощник")
        );

        if (botChat) {
          const newChatId = botChat.id;
          // Обновляем chatId только если он изменился
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
                
                return newMessages.length > 0 ? [...prev, ...newMessages] : prev;
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
      return [...prev, userMsg];
    });
    conversationHistoryRef.current.push(userMsg);

    try {
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
        return [...prev, aiMsg];
      });
      conversationHistoryRef.current.push(aiMsg);

      // Сохраняем chatId если его еще нет
      // Не перезагружаем историю, так как уже добавили сообщения оптимистично
      // loadChatHistory вызовется только при следующем открытии чата
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
        onClick={() => setIsOpen(!isOpen)}
        className="fixed bottom-6 right-6 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-blue-600 shadow-lg transition-all hover:bg-blue-700 hover:shadow-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 dark:bg-blue-500 dark:hover:bg-blue-600"
        aria-label="Открыть чат"
        disabled={!isSessionReady}
      >
        <svg
          className="h-7 w-7 text-white"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
          />
        </svg>
      </button>

      {/* Чат виджет */}
      {isOpen && (
        <div className="fixed bottom-24 right-6 z-50 flex h-[600px] w-[400px] flex-col rounded-lg border border-gray-200 bg-white shadow-2xl dark:border-gray-700 dark:bg-gray-800">
          {/* Заголовок */}
          <div className="flex items-center justify-between rounded-t-lg bg-blue-600 px-4 py-3 dark:bg-blue-700">
            <div className="flex items-center gap-2">
              <div className="h-8 w-8 rounded-full bg-gradient-to-br from-purple-500 to-purple-600 flex items-center justify-center text-white font-semibold text-xs shadow-md">
                AI
              </div>
              <div>
                <h3 className="text-sm font-semibold text-white">Помощник</h3>
                <p className="text-xs text-blue-100">AI Ассистент</p>
              </div>
              {chatId && (
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
              <div className="flex items-center justify-center h-full text-gray-500 dark:text-gray-400 text-sm text-center px-4">
                Привет! Я могу помочь с вопросами о системе MyUnion, навигации по сайту, скидках и документах. Задайте вопрос!
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
                      <div className="h-8 w-8 rounded-full bg-gradient-to-br from-purple-500 to-purple-600 flex items-center justify-center text-white text-xs font-semibold shadow-sm">
                        AI
                      </div>
                    </div>
                  )}
                  <div
                    className={`max-w-[80%] rounded-2xl px-4 py-2 shadow-sm ${
                      message.role === "user"
                        ? "bg-blue-600 text-white rounded-br-md"
                        : "bg-gray-100 text-gray-900 dark:bg-gray-700 dark:text-gray-100 rounded-bl-md"
                    }`}
                  >
                    <div className="text-sm leading-relaxed">
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>
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
                  <div className="h-8 w-8 rounded-full bg-gradient-to-br from-purple-500 to-purple-600 flex items-center justify-center text-white text-xs font-semibold shadow-sm">
                    AI
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

