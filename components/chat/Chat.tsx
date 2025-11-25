"use client";

import React, { useState, useEffect, useRef, useCallback, Suspense } from "react";
import { useSession } from "next-auth/react";
import { useSearchParams } from "next/navigation";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { trackAppealQuestion, detectAppealType, extractKeywords } from "@/lib/analytics";
import { notifyBotResponse, requestNotificationPermission, markUserInteracted } from "@/lib/chat-notifications";
import { ProfileSelfFillModal } from "./ProfileSelfFillModal";

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: Date;
}

function ChatContent() {
  const { data: session } = useSession();
  const searchParams = useSearchParams();
  const mode = searchParams?.get("mode"); // 'appeal' for Appeal Bot
  const sessionId = searchParams?.get("session"); // Specific chat session to load
  const [chatBotId, setChatBotId] = useState<string | null>(null);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(sessionId || null);
  const [sessionType, setSessionType] = useState<"STATEMENT" | "APPEAL" | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingHistory, setIsLoadingHistory] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [userAvatarUrl, setUserAvatarUrl] = useState<string | null>(null);
  const [uploadingFile, setUploadingFile] = useState(false);
  const [showSelfFillModal, setShowSelfFillModal] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const shouldAutoScrollRef = useRef(false); // Флаг для контроля автоскролла
  const isInitialLoadRef = useRef(true); // Флаг для первой загрузки
  const lastNotifiedMessageIdRef = useRef<string | null>(null); // ID последнего сообщения, для которого было показано уведомление
  const loadMessagesRef = useRef<(() => Promise<void>) | null>(null);
  const isLoadingMessagesRef = useRef(false);
  const messagesContainerRef = useRef<HTMLDivElement>(null);

  const loadMessages = useCallback(async () => {
    // Защита от дублирующихся запросов
    if (isLoadingMessagesRef.current) {
      console.log("[chat] Already loading messages, skipping...");
      return;
    }
    
    isLoadingMessagesRef.current = true;
    
    try {
      setIsLoadingHistory(true);
      setError(null);
      
      // If sessionId is provided, load that specific session
      const url = sessionId ? `/api/chat/session/${sessionId}` : "/api/chat";
      console.log("[chat] Loading messages from:", url);
      const response = await fetch(url);
      console.log("[chat] Response status:", response.status);
      
      if (!response.ok) {
        // Проверяем, что это JSON
        const contentType = response.headers.get("content-type");
        console.log("[chat] Error response, content-type:", contentType);
        if (contentType && contentType.includes("application/json")) {
          const errorData = await response.json();
          console.log("[chat] Error data:", errorData);
          // If session not found (404), just load empty chat - user can start new conversation
          if (response.status === 404) {
            console.log("[chat] Session not found (404), starting new chat");
            setMessages([]);
            setError(null);
            return;
          }
          // For 500 errors, log and throw to see actual error
          if (response.status === 500) {
            console.error("[chat] Server error (500):", errorData);
            setMessages([]);
            setError(null);
            return;
          }
          console.error("[chat] Throwing error:", errorData.error);
          throw new Error(errorData.error || `Ошибка сервера: ${response.status}`);
        } else {
          // Если HTML - значит редирект на логин
          console.log("[chat] Non-JSON response, likely redirect");
          throw new Error("Сессия истекла. Пожалуйста, войдите в систему заново.");
        }
      }
      
      const data = await response.json();
      setMessages(data.messages || []);
      
      // Обновляем sessionId и тип сессии если они были возвращены
      if (data.session?.id) {
        setCurrentSessionId(data.session.id);
      }
      if (data.session?.type) {
        setSessionType(data.session.type);
      } else if (!sessionId) {
        // Если загружаем без sessionId, это STATEMENT по умолчанию
        setSessionType("STATEMENT");
      }
      
      // Явно очищаем ошибку при успешной загрузке
      setError(null);
      
      // ВСЕГДА скроллим вниз при загрузке чата (первый раз или переключение между сессиями)
      // Пользователь ожидает увидеть последние сообщения
      shouldAutoScrollRef.current = true;
    } catch (error) {
      console.error("Ошибка загрузки сообщений:", error);
      setError(error instanceof Error ? error.message : "Не удалось загрузить историю чата");
    } finally {
      setIsLoadingHistory(false);
      isLoadingMessagesRef.current = false;
    }
  }, [sessionId]);

  // Load Appeal Bot ID if in appeal mode
  useEffect(() => {
    if (mode === "appeal") {
      const loadAppealBot = async () => {
        try {
          const response = await fetch("/api/chat/appeal-bot");
          if (response.ok) {
            const data = await response.json();
            setChatBotId(data.chatBotId);
            // Clear messages when switching to appeal bot
            setMessages([]);
          }
        } catch (error) {
          console.error("Error loading Appeal Bot:", error);
        }
      };
      loadAppealBot();
    }
  }, [mode]);

  // Запрос разрешения на уведомления при первой загрузке
  useEffect(() => {
    requestNotificationPermission().then((granted) => {
      if (granted) {
        console.log("[Chat] Notification permission granted");
      } else {
        console.log("[Chat] Notification permission not granted");
      }
    });
  }, []);

  // Сохраняем loadMessages в ref
  useEffect(() => {
    loadMessagesRef.current = loadMessages;
  }, [loadMessages]);

  // Сброс refs при смене сессии (переключение между чатами)
  useEffect(() => {
    // Сбрасываем счетчики при смене сессии
    lastNotifiedMessageIdRef.current = null;
    isInitialLoadRef.current = true;
    console.log("[Chat] Session changed, reset refs for session:", sessionId);
  }, [sessionId]);

  // Load message history ТОЛЬКО ОДИН РАЗ при монтировании или смене sessionId
  useEffect(() => {
    if (session?.user?.id && loadMessagesRef.current) {
      if (sessionId) {
        setCurrentSessionId(sessionId);
      }
      // Очищаем тип сессии при смене sessionId
      setSessionType(null);
      loadMessagesRef.current();
    }
  }, [session?.user?.id, sessionId]); // Убрали loadMessages, mode из зависимостей

  // Load user avatar ТОЛЬКО ОДИН РАЗ
  const avatarLoadedRef = useRef(false);
  useEffect(() => {
    if (session?.user?.id && !avatarLoadedRef.current) {
      avatarLoadedRef.current = true;
      fetch("/api/profile")
        .then((res) => res.json())
        .then((data) => {
          if (data.user?.avatarUrl) {
            setUserAvatarUrl(data.user.avatarUrl);
          }
        })
        .catch((error) => {
          console.error("[chat] Failed to load user avatar:", error);
        });
    }
  }, [session?.user?.id]);

  // Проверяем статус профиля и генерируем заявления если нужно
  const checkAndGenerateDocuments = useCallback(async () => {
    try {
      console.log("[chat] Checking profile and generating documents...");
      const response = await fetch("/api/chat/extract-profile", {
        method: "POST",
      });

      let data: any = null;
      let responseText = '';
      
      try {
        responseText = await response.text();
        if (responseText) {
          data = JSON.parse(responseText);
        }
      } catch (jsonError) {
        console.warn("[chat] Response parsing error:", {
          error: jsonError,
          status: response.status,
          statusText: response.statusText,
          responseText: responseText.substring(0, 200) // Первые 200 символов
        });
      }
      
      if (response.ok) {
        console.log("[chat] ✅ Documents generated successfully", data);
        // Обновляем сообщения чтобы показать кнопку скачивания
        if (sessionId || currentSessionId) {
          const url = (sessionId || currentSessionId) ? `/api/chat/session/${sessionId || currentSessionId}` : "/api/chat";
          const messagesResponse = await fetch(url);
          if (messagesResponse.ok) {
            const messagesData = await messagesResponse.json();
            setMessages(messagesData.messages || []);
          }
        }
      } else if (response.status === 400) {
        console.log("[chat] ⚠️ Profile not yet complete", data?.missingFields || [], data?.error);
        // Это нормально - профиль еще не заполнен
      } else if (response.status === 401) {
        console.warn("[chat] ⚠️ Not authenticated - skipping document generation");
        // Пользователь не авторизован - это может быть нормально при первой загрузке
      } else {
        // Другие ошибки - логируем подробнее, но НЕ как error (это может быть нормально)
        console.warn("[chat] ⚠️ Document generation check failed:", {
          status: response.status,
          statusText: response.statusText,
          error: data?.error || 'Unknown error',
          responsePreview: responseText ? responseText.substring(0, 200) : 'No response text'
        });
        // Не показываем ошибку пользователю - документы генерируются автоматически на сервере
        // Этот запрос - просто дополнительная проверка
      }
    } catch (error) {
      console.error("[chat] ❌ Error checking profile:", error);
      if (error instanceof Error) {
        console.error("[chat] Error details:", {
          message: error.message,
          stack: error.stack
        });
      }
      // Не показываем ошибку пользователю
    }
  }, [sessionId, currentSessionId]);

  // Auto-run document generation check after chat is loaded (только для STATEMENT)
  // Проверяем только если есть маркер [PROFILE_COMPLETE] но документы могут быть не сгенерированы
  useEffect(() => {
    if (messages.length > 0 && sessionType === "STATEMENT" && mode !== "appeal" && session?.user?.id) {
      const lastMessage = messages[messages.length - 1];
      const hasProfileCompleteMarker = lastMessage?.content?.includes("[PROFILE_COMPLETE]");
      
      // Проверяем кнопку скачивания документов
      const hasDownloadButton = messages.some(msg => 
        msg.content?.includes("Скачать документы") || 
        msg.content?.includes("[DOCUMENTS_READY]")
      );
      
      // Проверяем документы только если:
      // 1. Есть маркер завершения профиля
      // 2. НЕТ кнопки скачивания (документы не были сгенерированы)
      if (hasProfileCompleteMarker && !hasDownloadButton) {
        console.log("[chat] Profile complete marker found, checking if documents need generation...");
        
        // Небольшая задержка чтобы дать время серверу сгенерировать документы
        const timeoutId = setTimeout(() => {
          checkAndGenerateDocuments();
        }, 3000);
        
        return () => clearTimeout(timeoutId);
      } else if (hasProfileCompleteMarker && hasDownloadButton) {
        console.log("[chat] Documents already generated, skipping check");
      }
    }
  }, [messages, mode, sessionType, session, checkAndGenerateDocuments]);

  // Проверяем, находится ли пользователь внизу чата
  const isUserAtBottom = useCallback(() => {
    if (!messagesContainerRef.current) return false;
    
    const container = messagesContainerRef.current;
    const threshold = 100; // Пикселей от низа
    const distanceFromBottom = container.scrollHeight - container.scrollTop - container.clientHeight;
    
    return distanceFromBottom < threshold;
  }, []);

  // Прокрутка вниз при загрузке истории чата или новых сообщениях
  useEffect(() => {
    if (shouldAutoScrollRef.current && messages.length > 0) {
      // Проверяем: либо пользователь уже внизу, либо это первая загрузка сессии
      const wasAtBottom = isUserAtBottom();
      const isFirstLoad = isInitialLoadRef.current;
      
      // Проверяем тип последнего сообщения
      const lastMessage = messages[messages.length - 1];
      const isBotResponse = lastMessage?.role === "assistant";
      const isUserMessage = lastMessage?.role === "user";
      
      // Скроллим если:
      // 1. Первая загрузка приложения (isFirstLoad = true)
      // 2. Пользователь уже был внизу (wasAtBottom = true) - natural flow при получении новых сообщений
      // 3. Это ответ бота (isBotResponse = true) - ВСЕГДА скроллим к ответу бота
      // 4. Это сообщение пользователя (isUserMessage = true) - ВСЕГДА скроллим к своему сообщению
      if (isFirstLoad || wasAtBottom || isBotResponse || isUserMessage) {
        // Используем requestAnimationFrame чтобы убедиться, что DOM обновился
        requestAnimationFrame(() => {
          // Дополнительная задержка для гарантии отрисовки
          setTimeout(() => {
            if (messagesEndRef.current) {
              messagesEndRef.current.scrollIntoView({ behavior: "smooth" });
            }
            // Возвращаем фокус в поле ввода после скролла (только для новых сообщений, не при загрузке истории)
            if (!isFirstLoad && (isBotResponse || isUserMessage)) {
              textareaRef.current?.focus();
            }
          }, 50);
        });
        
        // После первого скролла сбрасываем флаг первой загрузки
        if (isFirstLoad) {
          isInitialLoadRef.current = false;
        }
      }
      
      // Сбрасываем флаг автоскролла после проверки
      shouldAutoScrollRef.current = false;
    }
  }, [messages, isUserAtBottom]);

  // Отслеживание новых сообщений от бота для показа уведомлений
  useEffect(() => {
    // Находим последнее сообщение от бота
    const lastBotMessage = [...messages]
      .reverse()
      .find((msg) => msg.role === "assistant");

    if (!lastBotMessage) {
      return;
    }

    // Проверяем, было ли уже показано уведомление для этого сообщения
    if (lastBotMessage.id === lastNotifiedMessageIdRef.current) {
      return;
    }

    // При первой загрузке показываем уведомление только если сообщение свежее (менее 5 минут назад)
    if (isInitialLoadRef.current) {
      const messageAge = Date.now() - new Date(lastBotMessage.createdAt).getTime();
      const fiveMinutesInMs = 5 * 60 * 1000;
      
      if (messageAge <= fiveMinutesInMs) {
        // Свежее сообщение - показываем уведомление
        console.log(`[Chat] Showing notification for fresh message (${Math.round(messageAge / 1000)}s old) in session ${currentSessionId || 'none'}, type: ${sessionType || 'none'}`);
        lastNotifiedMessageIdRef.current = lastBotMessage.id;
        notifyBotResponse(lastBotMessage.content, sessionType || null).catch(err => {
          console.error("[Chat] Error showing notification:", err);
        });
      } else {
        console.log(`[Chat] Skipping notification for old message (${Math.round(messageAge / 1000)}s old) on initial load`);
      }
      // Для старых сообщений не показываем уведомление при первой загрузке
      return;
    }

    // Для новых сообщений (после первой загрузки) всегда показываем уведомление
    console.log(`[Chat] Showing notification for new bot message in session ${currentSessionId || 'none'}, type: ${sessionType || 'none'}`);
    lastNotifiedMessageIdRef.current = lastBotMessage.id;
    notifyBotResponse(lastBotMessage.content, sessionType || null).catch(err => {
      console.error("[Chat] Error showing notification:", err);
    });
  }, [messages, sessionType]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Гарантируем, что флаг взаимодействия установлен при отправке формы
    markUserInteracted();
    
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
      const body: { message: string; chatBotId?: string; sessionId?: string } = { message: userMessage };
      if (chatBotId) {
        body.chatBotId = chatBotId;
      }
      if (currentSessionId) {
        body.sessionId = currentSessionId;
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

      // Обновляем sessionId и тип сессии если они были возвращены
      if (data.sessionId) {
        setCurrentSessionId(data.sessionId);
        // Обновляем URL с sessionId
        if (typeof window !== "undefined") {
          const url = new URL(window.location.href);
          url.searchParams.set("session", data.sessionId);
          window.history.replaceState({}, "", url.toString());
        }
      }
      if (data.sessionType) {
        setSessionType(data.sessionType);
      }

      // Enable autoscroll for AI response
      shouldAutoScrollRef.current = true;
      
      setMessages((prev) => {
        const filtered = prev.filter((msg) => msg.id !== tempUserMessage.id);
        return [...filtered, realUserMessage, aiMessage];
      });

      // If AI signals profile completion, save data and generate documents
      if (data.message.includes("[PROFILE_COMPLETE]")) {
        checkAndGenerateDocuments();
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
      // Возвращаем фокус в поле ввода после отправки (с небольшой задержкой для обновления DOM)
      setTimeout(() => {
        textareaRef.current?.focus();
      }, 0);
    }
  };

  // Автоматическое изменение высоты textarea
  useEffect(() => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = "52px"; // Сброс высоты
      const scrollHeight = textarea.scrollHeight;
      const maxHeight = 200; // Максимальная высота
      textarea.style.height = `${Math.min(scrollHeight, maxHeight)}px`;
      if (scrollHeight > maxHeight) {
        textarea.style.overflowY = "auto";
      } else {
        textarea.style.overflowY = "hidden";
      }
    }
  }, [input]);

  // Агрессивное поддержание фокуса в поле ввода
  useEffect(() => {
    // Возвращаем фокус после завершения загрузки
    if (!isLoading && !isLoadingHistory) {
      const timer = setTimeout(() => {
        // Проверяем, что фокус не в другом input элементе
        const activeElement = document.activeElement;
        const isInputFocused = activeElement?.tagName === 'INPUT' || 
                               activeElement?.tagName === 'TEXTAREA';
        
        // Если фокус не в поле ввода чата, возвращаем его туда
        if (textareaRef.current && activeElement !== textareaRef.current && !isInputFocused) {
          textareaRef.current.focus();
        }
      }, 100);
      
      return () => clearTimeout(timer);
    }
  }, [isLoading, isLoadingHistory]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      const form = e.currentTarget.form;
      if (form) {
        form.requestSubmit();
      }
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Ограничиваем размер файла до 10MB
    if (file.size > 10 * 1024 * 1024) {
      setError("Файл слишком большой. Максимальный размер: 10MB");
      setTimeout(() => setError(null), 5000);
      return;
    }

    setUploadingFile(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("sessionId", currentSessionId || "");

      const response = await fetch("/api/documents/upload", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || "Ошибка загрузки файла");
      }

      const data = await response.json();
      
      // Добавляем сообщение о загруженном файле
      const fileMessage: ChatMessage = {
        id: `file-${Date.now()}`,
        role: "user",
        content: `📎 Загружен файл: ${file.name}`,
        createdAt: new Date(),
      };

      setMessages((prev) => [...prev, fileMessage]);

      // Отправляем сообщение боту о загруженном файле с информацией о документе
      if (currentSessionId) {
        const chatResponse = await fetch("/api/chat", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            message: `Я загрузил файл: ${file.name}. Это мое подписанное заявление. Пожалуйста, проверь его правильность заполнения.`,
            sessionId: currentSessionId,
            uploadedDocument: {
              fileName: data.fileName,
              documentId: data.documentId,
              type: data.documentType,
            },
          }),
        });

        if (chatResponse.ok) {
          const chatData = await chatResponse.json();
          const aiMessage: ChatMessage = {
            id: `ai-${Date.now()}`,
            role: "assistant",
            content: chatData.message,
            createdAt: new Date(),
          };
          
          setMessages((prev) => [...prev, aiMessage]);
          shouldAutoScrollRef.current = true;
        }
      }

      // Очищаем input
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    } catch (error) {
      console.error("Ошибка загрузки файла:", error);
      setError(error instanceof Error ? error.message : "Не удалось загрузить файл");
      setTimeout(() => setError(null), 5000);
    } finally {
      setUploadingFile(false);
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
      <div ref={messagesContainerRef} className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-4xl px-4 py-6">
          {messages.length === 0 ? (
            <div className="flex h-full min-h-[60vh] items-center justify-center">
              <div className="text-center">
                <div className="mb-4 text-5xl">{mode === "appeal" ? "📝" : "👋"}</div>
                <h3 className="mb-2 text-2xl font-semibold text-gray-900 dark:text-white">
                  {mode === "appeal" ? "Создание обращения" : "Добро пожаловать!"}
                </h3>
                <p className="text-lg text-gray-600 dark:text-gray-400">
                  {mode === "appeal" 
                    ? "Опишите вашу проблему или вопрос. Я помогу вам составить обращение к профсоюзу."
                    : "Начните диалог, чтобы заполнить свой профиль"}
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
                      <div className="text-[15px] leading-relaxed">
                        <ReactMarkdown
                          remarkPlugins={[remarkGfm]}
                          components={{
                            p: ({ children }) => (
                              <p className={`mb-2 last:mb-0 ${
                                message.role === "user" ? "text-white" : "text-gray-900 dark:text-gray-100"
                              }`}>
                                {children}
                              </p>
                            ),
                            ul: ({ children }) => (
                              <ul className={`mb-2 ml-4 list-disc ${
                                message.role === "user" ? "text-white" : "text-gray-900 dark:text-gray-100"
                              }`}>
                                {children}
                              </ul>
                            ),
                            ol: ({ children }) => (
                              <ol className={`mb-2 ml-4 list-decimal ${
                                message.role === "user" ? "text-white" : "text-gray-900 dark:text-gray-100"
                              }`}>
                                {children}
                              </ol>
                            ),
                            li: ({ children }) => (
                              <li className={`mb-1 ${
                                message.role === "user" ? "text-white" : "text-gray-900 dark:text-gray-100"
                              }`}>
                                {children}
                              </li>
                            ),
                            strong: ({ children }) => (
                              <strong className={`font-semibold ${
                                message.role === "user" ? "text-white" : "text-gray-900 dark:text-gray-100"
                              }`}>
                                {children}
                              </strong>
                            ),
                            em: ({ children }) => (
                              <em className={`italic ${
                                message.role === "user" ? "text-white" : "text-gray-900 dark:text-gray-100"
                              }`}>
                                {children}
                              </em>
                            ),
                            code: ({ children, className }) => {
                              const isInline = !className;
                              return isInline ? (
                                <code className={`rounded px-1.5 py-0.5 text-sm font-mono ${
                                  message.role === "user"
                                    ? "bg-white/20 text-white"
                                    : "bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                                }`}>
                                  {children}
                                </code>
                              ) : (
                                <code className={className}>{children}</code>
                              );
                            },
                            pre: ({ children }) => (
                              <pre className={`mb-2 overflow-x-auto rounded-lg p-3 text-sm ${
                                message.role === "user"
                                  ? "bg-white/10 text-white"
                                  : "bg-gray-900 text-gray-100"
                              }`}>
                                {children}
                              </pre>
                            ),
                            a: ({ href, children }) => (
                              <a
                                href={href}
                                target="_blank"
                                rel="noopener noreferrer"
                                className={`underline hover:no-underline ${
                                  message.role === "user"
                                    ? "text-blue-200 hover:text-blue-100"
                                    : "text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300"
                                }`}
                              >
                                {children}
                              </a>
                            ),
                            blockquote: ({ children }) => (
                              <blockquote className={`my-2 border-l-4 pl-4 italic ${
                                message.role === "user"
                                  ? "border-white/30 text-white"
                                  : "border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300"
                              }`}>
                                {children}
                              </blockquote>
                            ),
                            h1: ({ children }) => (
                              <h1 className={`mb-2 text-2xl font-bold ${
                                message.role === "user" ? "text-white" : "text-gray-900 dark:text-gray-100"
                              }`}>
                                {children}
                              </h1>
                            ),
                            h2: ({ children }) => (
                              <h2 className={`mb-2 text-xl font-bold ${
                                message.role === "user" ? "text-white" : "text-gray-900 dark:text-gray-100"
                              }`}>
                                {children}
                              </h2>
                            ),
                            h3: ({ children }) => (
                              <h3 className={`mb-2 text-lg font-semibold ${
                                message.role === "user" ? "text-white" : "text-gray-900 dark:text-gray-100"
                              }`}>
                                {children}
                              </h3>
                            ),
                          }}
                        >
                          {message.content
                            .replace(/\[PROFILE_COMPLETE\]/g, "")
                            .replace(/\[PROFILE_AWAITING_CONFIRMATION\]/g, "")
                            .replace(/\[SHOW_SELF_FILL_BUTTON\]/g, "")
                          }
                        </ReactMarkdown>

                        {/* Кнопка "Я заполню сам" - показываем в первом сообщении бота для STATEMENT */}
                        {message.role === "assistant" && 
                         message.content.includes("[SHOW_SELF_FILL_BUTTON]") && 
                         sessionType === "STATEMENT" && (
                          <div className="mt-4">
                            <button
                              onClick={() => setShowSelfFillModal(true)}
                              className="inline-flex items-center gap-2 rounded-lg border-2 border-blue-600 bg-transparent px-4 py-2 text-sm font-medium text-blue-600 dark:text-blue-400 transition-colors hover:bg-blue-50 dark:hover:bg-blue-900/20"
                            >
                              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                              </svg>
                              Я заполню сам
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {message.role === "user" && (
                    <div className="flex-shrink-0">
                      {userAvatarUrl ? (
                        <img 
                          src={userAvatarUrl} 
                          alt="Avatar" 
                          className="h-8 w-8 rounded-full object-cover shadow-sm"
                        />
                      ) : (
                        <div className="h-8 w-8 rounded-full bg-blue-500 flex items-center justify-center text-white font-semibold text-sm shadow-sm">
                          {session?.user?.name?.charAt(0).toUpperCase() || "U"}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}

              {/* Download Documents Button - показываем только для STATEMENT сессий после завершения профиля */}
              {sessionType === "STATEMENT" && messages.length > 0 && messages[messages.length - 1].content.includes("[PROFILE_COMPLETE]") && !isLoading && (
                <div className="flex items-center justify-center px-4 py-6">
                  <div className="text-center max-w-2xl">
                    <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-full bg-green-100 dark:bg-green-900/30">
                      <svg className="h-6 w-6 text-green-600 dark:text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                    </div>
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
                      Профиль заполнен!
                    </h3>
                    <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                      Ваши документы готовы к скачиванию. Проверьте правильность данных перед печатью.
                    </p>
                    <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
                    <button
                      onClick={() => window.open("/dashboard/documents", "_blank")}
                        className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-6 py-2.5 text-sm font-medium text-white transition-colors hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
                    >
                      <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                      </svg>
                      Скачать документы
                    </button>
                      <button
                        onClick={() => window.open("/dashboard/profile", "_blank")}
                        className="inline-flex items-center gap-2 rounded-lg bg-gray-100 dark:bg-gray-700 px-6 py-2.5 text-sm font-medium text-gray-900 dark:text-white transition-colors hover:bg-gray-200 dark:hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2"
                      >
                        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                        </svg>
                        Проверить профиль
                      </button>
                    </div>
                  </div>
                </div>
              )}
              
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
              {/* Кнопка загрузки файла */}
              <input
                ref={fileInputRef}
                type="file"
                id="file-upload"
                className="hidden"
                accept=".pdf,.doc,.docx,.jpg,.jpeg,.png"
                onChange={handleFileUpload}
                disabled={isLoading || uploadingFile}
              />
              <label
                htmlFor="file-upload"
                className="m-2 flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-full text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-700 disabled:opacity-50 disabled:cursor-not-allowed dark:text-gray-400 dark:hover:bg-gray-600 dark:hover:text-gray-200"
                title="Прикрепить файл"
              >
                {uploadingFile ? (
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-gray-400 border-t-transparent"></div>
                ) : (
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
                      d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13"
                    />
                  </svg>
                )}
              </label>
              <textarea
                ref={textareaRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={
                  sessionType === "APPEAL" 
                    ? "Опишите ваше обращение или задайте вопрос..." 
                    : "Введите ваше сообщение..."
                }
                rows={1}
                disabled={isLoading || uploadingFile}
                className="flex-1 resize-none border-0 bg-transparent px-4 py-3 text-[15px] text-gray-900 placeholder-gray-500 focus:outline-none focus:ring-0 dark:text-gray-100 dark:placeholder-gray-400"
                style={{
                  minHeight: "52px",
                  maxHeight: "200px",
                  overflowY: "auto",
                }}
              />
              <button
                type="submit"
                disabled={(!input.trim() && !uploadingFile) || isLoading || uploadingFile}
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
            {mode === "appeal" && messages.length === 0 && (
              <div className="mt-3 flex flex-wrap gap-2 justify-center">
                <button
                  type="button"
                  onClick={() => setInput("Мне нужна помощь с трудовым спором")}
                  className="inline-block rounded-full bg-blue-100 px-3 py-1 text-xs text-blue-700 hover:bg-blue-200 dark:bg-blue-900/30 dark:text-blue-300 dark:hover:bg-blue-900/50 transition-colors"
                >
                  💼 Трудовой спор
                </button>
                <button
                  type="button"
                  onClick={() => setInput("Как оформить жалобу?")}
                  className="inline-block rounded-full bg-purple-100 px-3 py-1 text-xs text-purple-700 hover:bg-purple-200 dark:bg-purple-900/30 dark:text-purple-300 dark:hover:bg-purple-900/50 transition-colors"
                >
                  📋 Жалоба
                </button>
                <button
                  type="button"
                  onClick={() => setInput("Консультация по правовым вопросам")}
                  className="inline-block rounded-full bg-green-100 px-3 py-1 text-xs text-green-700 hover:bg-green-200 dark:bg-green-900/30 dark:text-green-300 dark:hover:bg-green-900/50 transition-colors"
                >
                  ⚖️ Консультация
                </button>
                <button
                  type="button"
                  onClick={() => setInput("Вопрос по социальным льготам")}
                  className="inline-block rounded-full bg-orange-100 px-3 py-1 text-xs text-orange-700 hover:bg-orange-200 dark:bg-orange-900/30 dark:text-orange-300 dark:hover:bg-orange-900/50 transition-colors"
                >
                  🛡️ Льготы
                </button>
              </div>
            )}
            <p className="mt-2 text-center text-xs text-gray-500 dark:text-gray-400">
              Нажмите Enter для отправки, Shift+Enter для новой строки
            </p>
          </form>
        </div>
      </div>

      {/* Modal для самостоятельного заполнения */}
      {showSelfFillModal && currentSessionId && (
        <ProfileSelfFillModal
          isOpen={showSelfFillModal}
          onClose={() => {
            setShowSelfFillModal(false);
            // Перезагружаем чат после закрытия модалки
            loadMessages();
          }}
          sessionId={currentSessionId}
        />
      )}
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
