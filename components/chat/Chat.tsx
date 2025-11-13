"use client";

import React, { useState, useEffect, useRef, useCallback, Suspense } from "react";
import { useSession } from "next-auth/react";
import { useSearchParams } from "next/navigation";
import { trackAppealQuestion, detectAppealType, extractKeywords } from "@/lib/analytics";

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: Date;
}

function ChatContent() {
  const { data: session } = useSession();
  const searchParams = useSearchParams();
  const mode = searchParams?.get("mode"); // Can be "appeal" for Appeal Bot
  const [chatBotId, setChatBotId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingHistory, setIsLoadingHistory] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const shouldAutoScrollRef = useRef(false); // Флаг для контроля автоскролла
  const isInitialLoadRef = useRef(true); // Флаг для первой загрузки

  const loadMessages = useCallback(async () => {
    try {
      setIsLoadingHistory(true);
      setError(null);
      
      const response = await fetch("/api/chat");
      
      if (!response.ok) {
        // Проверяем, что это JSON
        const contentType = response.headers.get("content-type");
        if (contentType && contentType.includes("application/json")) {
          const errorData = await response.json();
          throw new Error(errorData.error || `Ошибка сервера: ${response.status}`);
        } else {
          // Если HTML - значит редирект на логин
          throw new Error("Сессия истекла. Пожалуйста, войдите в систему заново.");
        }
      }
      
      const data = await response.json();
      setMessages(data.messages || []);
      
      // Скроллим вниз только при первой загрузке
      if (isInitialLoadRef.current) {
        shouldAutoScrollRef.current = true;
        isInitialLoadRef.current = false;
      }
    } catch (error) {
      console.error("Ошибка загрузки сообщений:", error);
      setError(error instanceof Error ? error.message : "Не удалось загрузить историю чата");
    } finally {
      setIsLoadingHistory(false);
    }
  }, []);

  // Автоматическое изменение высоты textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
    }
  }, [input]);

  // Load Appeal Bot if mode is "appeal"
  useEffect(() => {
    if (mode === "appeal") {
      const loadAppealBot = async () => {
        try {
          const response = await fetch("/api/chat/appeal-bot");
          if (response.ok) {
            const data = await response.json();
            setChatBotId(data.chatBotId);
          }
        } catch (error) {
          console.error("Error loading Appeal Bot:", error);
        }
      };
      loadAppealBot();
    }
  }, [mode]);

  // Загружаем историю сообщений и проверяем генерацию заявлений
  useEffect(() => {
    if (session?.user?.id) {
      loadMessages();
      // Проверяем, есть ли полный профиль и нужно ли генерировать заявления
      if (mode !== "appeal") {
        checkAndGenerateDocuments();
      }
    }
  }, [session, loadMessages, mode]);

  // Проверяем статус профиля и генерируем заявления если нужно
  const checkAndGenerateDocuments = useCallback(async () => {
    try {
      const response = await fetch("/api/chat/extract-profile", {
        method: "POST",
      });
      
      if (response.ok) {
        // Профиль был успешно обработан и заявления сгенерированы
        console.log("Documents generated successfully");
      } else if (response.status === 400) {
        // Профиль еще не заполнен полностью
        console.log("Profile not yet complete");
      }
    } catch (error) {
      // Ошибка при проверке - это нормально
      console.error("Error checking profile:", error);
    }
  }, []);

  // Прокрутка вниз только при новых сообщениях от пользователя или бота
  useEffect(() => {
    if (shouldAutoScrollRef.current) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
      shouldAutoScrollRef.current = false;
    }
  }, [messages]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!input.trim() || isLoading) return;

    const userMessage = input.trim();
    setInput("");
    setIsLoading(true);

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
      setError(null);
      const body: any = { message: userMessage };
      if (chatBotId) {
        body.chatBotId = chatBotId;
      }
      
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });

      let data;
      try {
        data = await response.json();
      } catch (jsonError) {
        // Если ответ не является валидным JSON
        if (response.status === 401) {
          throw new Error("Сессия истекла. Пожалуйста, войдите в систему снова.");
        }
        throw new Error(
          response.status === 503
            ? "AI бот не настроен. Обратитесь к администратору."
            : `Ошибка сервера (${response.status}). Попробуйте перезагрузить страницу.`
        );
      }

      if (!response.ok) {
        if (response.status === 401) {
          throw new Error("Необходима авторизация. Пожалуйста, войдите в систему.");
        }
        throw new Error(data.error || `Ошибка отправки сообщения (${response.status})`);
      }
      
      // Добавляем ответ AI (с серверными ID если есть)
      const aiMessage: ChatMessage = {
        id: data.id || `ai-${Date.now()}`,
        role: "assistant",
        content: data.message,
        createdAt: new Date(),
      };
      
      // Заменяем временное сообщение пользователя на настоящее если есть userId
      const realUserMessage: ChatMessage = data.userId ? {
        id: data.userId,
        role: "user",
        content: userMessage,
        createdAt: new Date(),
      } : tempUserMessage;
      
      // Track analytics if using Appeal Bot
      if (mode === "appeal" && chatBotId) {
        const appealType = detectAppealType(userMessage);
        const keywords = extractKeywords(userMessage);
        trackAppealQuestion({
          appealType,
          question: userMessage,
          keywords,
        });
      }

      // Включаем автоскролл для ответа AI
      shouldAutoScrollRef.current = true;
      
      setMessages((prev) => {
        const filtered = prev.filter((msg) => msg.id !== tempUserMessage.id);
        return [...filtered, realUserMessage, aiMessage];
      });

      // Если AI сообщил о завершении профиля, сохраняем данные и генерируем документы
      if (data.message.includes("[PROFILE_COMPLETE]")) {
        try {
          // Сохраняем профиль
          const extractResponse = await fetch("/api/chat/extract-profile", {
            method: "POST",
          });
          
          if (extractResponse.ok) {
            const extractData = await extractResponse.json();
            console.log("Профиль сохранен:", extractData);
            
            // Генерируем документы
            const generateResponse = await fetch("/api/documents/generate", {
              method: "POST",
            });
            
            if (generateResponse.ok) {
              const generateData = await generateResponse.json();
              console.log("Документы сгенерированы:", generateData);
              
              // Добавляем сообщение с кнопками скачивания
              const documentsMessage: ChatMessage = {
                id: `docs-${Date.now()}`,
                role: "assistant",
                content: `✅ Документы успешно сгенерированы!\n\nВы можете скачать:\n1. Заявление о вступлении в профсоюз\n2. Заявление о перечислении членских взносов\n\nПерейдите в раздел "Документы" для просмотра и скачивания.`,
                createdAt: new Date(),
              };
              
              shouldAutoScrollRef.current = true;
              setMessages((prev) => [...prev, documentsMessage]);
            }
          }
        } catch (error) {
          console.error("Ошибка обработки профиля:", error);
          setError("Профиль сохранен, но возникла ошибка при генерации документов.");
        }
      }
    } catch (error) {
      console.error("Ошибка отправки сообщения:", error);
      setMessages((prev) => prev.filter((msg) => msg.id !== tempUserMessage.id));
      setError(
        error instanceof Error
          ? error.message
          : "Не удалось отправить сообщение. Попробуйте еще раз."
      );
      // Автоматически скрываем ошибку через 5 секунд
      setTimeout(() => setError(null), 5000);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      const form = e.currentTarget.form;
      if (form) {
        form.requestSubmit();
      }
    }
  };

  if (isLoadingHistory) {
    return (
      <div className="flex h-full items-center justify-center bg-white dark:bg-gray-900">
        <div className="text-center">
          <div className="mb-4 inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-blue-500 border-r-transparent"></div>
          <p className="text-gray-600 dark:text-gray-400">Загрузка истории чата...</p>
        </div>
      </div>
    );
  }

  // Проверка авторизации
  if (!session) {
    return (
      <div className="flex h-full items-center justify-center bg-white dark:bg-gray-900">
        <div className="text-center max-w-md px-6">
          <div className="mb-4 text-6xl">🔒</div>
          <h2 className="mb-2 text-2xl font-bold text-gray-900 dark:text-white">
            Требуется авторизация
          </h2>
          <p className="mb-6 text-gray-600 dark:text-gray-400">
            Пожалуйста, войдите в систему, чтобы использовать AI чат
          </p>
          <a
            href="/login"
            className="inline-block rounded-lg bg-blue-600 px-6 py-3 text-white hover:bg-blue-700 transition-colors"
          >
            Войти в систему
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
      {/* Сообщение об ошибке */}
      {error && (
        <div className="mx-auto w-full max-w-4xl px-4 pt-4">
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 shadow-sm dark:border-red-900/40 dark:bg-red-900/20 dark:text-red-200">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <svg
                  className="h-5 w-5"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
                <span>{error}</span>
              </div>
              <button
                onClick={() => setError(null)}
                className="text-red-600 hover:text-red-800 dark:text-red-400 dark:hover:text-red-200"
              >
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Область сообщений */}
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-4xl px-4 py-6">
          {messages.length === 0 ? (
            <div className="flex h-full min-h-[60vh] items-center justify-center">
              <div className="text-center">
                <div className="mb-4 text-5xl">👋</div>
                <h3 className="mb-2 text-2xl font-semibold text-gray-900 dark:text-white">
                  Добро пожаловать!
                </h3>
                <p className="text-lg text-gray-600 dark:text-gray-400">
                  Начните диалог, чтобы заполнить свой профиль
                </p>
              </div>
            </div>
          ) : (
            <div className="space-y-0">
              {messages.map((message) => (
                <div
                  key={message.id}
                  className={`group flex gap-4 px-4 py-4 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors ${
                    message.role === "user" ? "justify-end" : "justify-start"
                  }`}
                >
                  {message.role === "assistant" && (
                    <div className="flex-shrink-0">
                      <div className="h-8 w-8 rounded-full bg-gradient-to-br from-purple-500 to-purple-600 flex items-center justify-center text-white font-semibold text-xs shadow-sm">
                        AI
                      </div>
                    </div>
                  )}
                  
                  <div
                    className={`flex flex-col gap-2 min-w-0 flex-1 ${
                      message.role === "user" ? "items-end max-w-[85%]" : "items-start max-w-[85%]"
                    }`}
                  >
                    <div
                      className={`rounded-2xl px-4 py-3 shadow-sm ${
                        message.role === "user"
                          ? "bg-blue-600 text-white rounded-br-md"
                          : "bg-gray-100 text-gray-900 dark:bg-gray-800 dark:text-gray-100 rounded-bl-md"
                      }`}
                    >
                      <p className="whitespace-pre-wrap text-[15px] leading-relaxed">
                        {message.content.replace(/\[PROFILE_COMPLETE\]/g, "")}
                      </p>
                    </div>
                  </div>

                  {message.role === "user" && (
                    <div className="flex-shrink-0">
                      <div className="h-8 w-8 rounded-full bg-blue-500 flex items-center justify-center text-white font-semibold text-sm shadow-sm">
                        {session?.user?.name?.charAt(0).toUpperCase() || "U"}
                      </div>
                    </div>
                  )}
                </div>
              ))}
              
              {isLoading && (
                <div className="flex items-start gap-4 px-4 py-4">
                  <div className="flex-shrink-0">
                    <div className="h-8 w-8 rounded-full bg-gradient-to-br from-purple-500 to-purple-600 flex items-center justify-center text-white font-semibold text-xs shadow-sm">
                      AI
                    </div>
                  </div>
                  <div className="rounded-2xl rounded-bl-md bg-gray-100 px-4 py-3 dark:bg-gray-800 shadow-sm">
                    <div className="flex items-center gap-1.5">
                      <div className="h-2 w-2 animate-bounce rounded-full bg-gray-400 dark:bg-gray-500"></div>
                      <div className="h-2 w-2 animate-bounce rounded-full bg-gray-400 dark:bg-gray-500 [animation-delay:0.2s]"></div>
                      <div className="h-2 w-2 animate-bounce rounded-full bg-gray-400 dark:bg-gray-500 [animation-delay:0.4s]"></div>
                    </div>
                  </div>
                </div>
              )}
              
              <div ref={messagesEndRef} />
            </div>
          )}
        </div>
      </div>

      {/* Форма ввода - фиксированная */}
      <div className="shrink-0 border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-4 py-4">
        <div className="mx-auto max-w-4xl">
          <form onSubmit={handleSubmit} className="relative">
            <div className="relative flex items-end rounded-2xl border-2 border-gray-300 bg-white dark:border-gray-600 dark:bg-gray-700 focus-within:border-blue-500 dark:focus-within:border-blue-500 transition-colors hover:border-gray-400 dark:hover:border-gray-500">
              <textarea
                ref={textareaRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Введите ваше сообщение..."
                rows={1}
                disabled={isLoading}
                className="flex-1 resize-none border-0 bg-transparent px-4 py-3 text-[15px] text-gray-900 placeholder-gray-500 focus:outline-none focus:ring-0 dark:text-gray-100 dark:placeholder-gray-400"
                style={{
                  minHeight: "52px",
                  maxHeight: "200px",
                }}
              />
              <button
                type="submit"
                disabled={!input.trim() || isLoading}
                className="m-2 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-blue-600 text-white transition-colors hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed dark:bg-blue-500 dark:hover:bg-blue-600"
                aria-label="Отправить сообщение"
              >
                {isLoading ? (
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent"></div>
                ) : (
                  <svg
                    className="h-4 w-4"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"
                    />
                  </svg>
                )}
              </button>
            </div>
            <p className="mt-2 text-center text-xs text-gray-500 dark:text-gray-400">
              Нажмите Enter для отправки, Shift+Enter для новой строки
            </p>
          </form>
        </div>
      </div>
    </div>
  );
}

// Loading fallback for Suspense
function ChatLoading() {
  return (
    <div className="flex h-full items-center justify-center">
      <div className="text-center">
        <div className="inline-flex h-12 w-12 animate-spin rounded-full border-4 border-gray-300 border-t-blue-600"></div>
        <p className="mt-4 text-gray-600 dark:text-gray-400">Загрузка чата...</p>
      </div>
    </div>
  );
}

// Default export with Suspense
export default function Chat() {
  return (
    <Suspense fallback={<ChatLoading />}>
      <ChatContent />
    </Suspense>
  );
}
