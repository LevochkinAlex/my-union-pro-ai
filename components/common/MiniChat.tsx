"use client";

import React, { useState, useEffect, useRef } from "react";
import { useSession } from "next-auth/react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { markUserInteracted } from "@/lib/chat-notifications";

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: Date;
}

export default function MiniChat() {
  const { data: session } = useSession();
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingHistory, setIsLoadingHistory] = useState(true);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const shouldAutoScrollRef = useRef(false); // Флаг для контроля автоскролла
  const isInitialLoadRef = useRef(true); // Флаг первой загрузки

  // Загружаем сессию "Мой чат" (STATEMENT)
  useEffect(() => {
    if (!session?.user?.id) return;

    const loadStatementSession = async () => {
      try {
        const response = await fetch("/api/chat/sessions");
        if (response.ok) {
          const data = await response.json();
          const statementSession = data.sessions?.find(
            (s: any) => s.type === "STATEMENT"
          );
          if (statementSession) {
            setSessionId(statementSession.id);
            loadMessages(statementSession.id);
          } else {
            // Если сессии нет, создаем новую
            const createResponse = await fetch("/api/chat/sessions", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ type: "STATEMENT" }),
            });
            if (createResponse.ok) {
              const newSession = await createResponse.json();
              setSessionId(newSession.session.id);
            }
          }
        }
      } catch (error) {
        console.error("[MiniChat] Error loading session:", error);
        setIsLoadingHistory(false);
      }
    };

    loadStatementSession();
  }, [session]);

  // Загружаем историю сообщений
  const loadMessages = async (sid: string) => {
    try {
      setIsLoadingHistory(true);
      const response = await fetch(`/api/chat/session/${sid}`);
      if (response.ok) {
        const data = await response.json();
        setMessages(data.messages || []);
        // Скроллим только при первой загрузке, чтобы показать последние сообщения
        if (isInitialLoadRef.current) {
          shouldAutoScrollRef.current = true;
          isInitialLoadRef.current = false;
        }
      }
    } catch (error) {
      console.error("[MiniChat] Error loading messages:", error);
    } finally {
      setIsLoadingHistory(false);
    }
  };

  // Скролл при открытии виджета (чтобы показать последние сообщения)
  useEffect(() => {
    if (isOpen && messages.length > 0 && !isLoadingHistory) {
      // Скроллим при открытии, чтобы показать последние сообщения
      requestAnimationFrame(() => {
        setTimeout(() => {
          if (messagesEndRef.current) {
            messagesEndRef.current.scrollIntoView({ behavior: "auto" });
          }
        }, 100);
      });
    }
  }, [isOpen, isLoadingHistory]);

  // Автоскролл к последнему сообщению (только когда нужно)
  useEffect(() => {
    if (isOpen && shouldAutoScrollRef.current && messages.length > 0) {
      requestAnimationFrame(() => {
        setTimeout(() => {
          if (messagesEndRef.current) {
            messagesEndRef.current.scrollIntoView({ behavior: "smooth" });
            shouldAutoScrollRef.current = false;
          }
        }, 50);
      });
    }
  }, [messages, isOpen]);

  // Отправка сообщения
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading || !sessionId) return;

    const userMessage = input.trim();
    setInput("");
    setIsLoading(true);
    markUserInteracted(); // Гарантируем user interaction для звука

    // Включаем автоскролл для нового сообщения
    shouldAutoScrollRef.current = true;

    // Оптимистично добавляем сообщение пользователя
    const tempUserMessage: ChatMessage = {
      id: `temp-${Date.now()}`,
      role: "user",
      content: userMessage,
      createdAt: new Date(),
    };
    setMessages((prev) => [...prev, tempUserMessage]);

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: userMessage,
          sessionId: sessionId,
        }),
      });

      if (!response.ok) {
        throw new Error("Ошибка отправки сообщения");
      }

      const data = await response.json();
      
      // Заменяем временное сообщение на настоящее
      const realUserMessage: ChatMessage = data.userId ? {
        id: data.userId,
        role: "user",
        content: userMessage,
        createdAt: new Date(),
      } : tempUserMessage;

      // Добавляем ответ AI
      const aiMessage: ChatMessage = {
        id: data.id || `ai-${Date.now()}`,
        role: "assistant",
        content: data.message,
        createdAt: new Date(),
      };

      // Включаем автоскролл для ответа бота
      shouldAutoScrollRef.current = true;

      setMessages((prev) => {
        const filtered = prev.filter((msg) => msg.id !== tempUserMessage.id);
        return [...filtered, realUserMessage, aiMessage];
      });
    } catch (error) {
      console.error("[MiniChat] Error sending message:", error);
      // Удаляем временное сообщение при ошибке
      setMessages((prev) => prev.filter((msg) => msg.id !== tempUserMessage.id));
      alert("Не удалось отправить сообщение. Попробуйте еще раз.");
    } finally {
      setIsLoading(false);
    }
  };

  if (!session?.user?.id) {
    return null;
  }

  return (
    <>
      {/* Плавающая кнопка */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="fixed bottom-6 right-6 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-blue-600 shadow-lg transition-all hover:bg-blue-700 hover:shadow-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 dark:bg-blue-500 dark:hover:bg-blue-600"
        aria-label="Открыть чат"
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

      {/* Мини-чат виджет */}
      {isOpen && (
        <div className="fixed bottom-24 right-6 z-50 flex h-[600px] w-[400px] flex-col rounded-lg border border-gray-200 bg-white shadow-2xl dark:border-gray-700 dark:bg-gray-800">
          {/* Заголовок */}
          <div className="flex items-center justify-between rounded-t-lg bg-blue-600 px-4 py-3 dark:bg-blue-700">
            <div className="flex items-center gap-2">
              <div className="h-8 w-8 rounded-full bg-white/20 flex items-center justify-center">
                <svg
                  className="h-5 w-5 text-white"
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
              </div>
              <div>
                <h3 className="text-sm font-semibold text-white">Мой бот</h3>
                <p className="text-xs text-blue-100">AI Ассистент</p>
              </div>
            </div>
            <button
              onClick={() => setIsOpen(false)}
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
            {isLoadingHistory ? (
              <div className="flex items-center justify-center h-full">
                <div className="h-8 w-8 animate-spin rounded-full border-2 border-blue-600 border-t-transparent"></div>
              </div>
            ) : messages.length === 0 ? (
              <div className="flex items-center justify-center h-full text-gray-500 dark:text-gray-400 text-sm text-center px-4">
                Привет! Я могу помочь с вопросами о профсоюзе, скидках и структуре организации. Задайте вопрос!
              </div>
            ) : (
              messages.map((message) => (
                <div
                  key={message.id}
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
                      <div className="h-8 w-8 rounded-full bg-blue-600 flex items-center justify-center text-white text-xs font-semibold shadow-sm">
                        {session?.user?.name?.charAt(0).toUpperCase() || "B"}
                      </div>
                    </div>
                  )}
                </div>
              ))
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Форма ввода */}
          <div className="border-t border-gray-200 dark:border-gray-700 p-4">
            <form onSubmit={handleSubmit} className="flex gap-2">
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Задайте вопрос..."
                className="flex-1 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:border-gray-600 dark:bg-gray-700 dark:text-white dark:placeholder-gray-400"
                disabled={isLoading}
              />
              <button
                type="submit"
                disabled={!input.trim() || isLoading}
                className="rounded-lg bg-blue-600 px-4 py-2 text-white transition hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed dark:bg-blue-500 dark:hover:bg-blue-600"
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

