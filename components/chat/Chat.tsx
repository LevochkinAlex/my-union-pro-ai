"use client";

import React, { useState, useEffect, useRef } from "react";
import Button from "@/components/ui/button/Button";
import TextArea from "@/components/form/input/TextArea";
import { useSession } from "next-auth/react";

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: Date;
}

export default function Chat() {
  const { data: session } = useSession();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingHistory, setIsLoadingHistory] = useState(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Загружаем историю сообщений при монтировании
  useEffect(() => {
    if (session?.user?.id) {
      loadMessages();
    }
  }, [session]);

  // Прокрутка вниз при новых сообщениях
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const loadMessages = async () => {
    try {
      setIsLoadingHistory(true);
      const response = await fetch("/api/chat");
      if (response.ok) {
        const data = await response.json();
        setMessages(data.messages || []);
      }
    } catch (error) {
      console.error("Ошибка загрузки сообщений:", error);
    } finally {
      setIsLoadingHistory(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!input.trim() || isLoading) return;

    const userMessage = input.trim();
    setInput("");
    setIsLoading(true);

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
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ message: userMessage }),
      });

      if (!response.ok) {
        throw new Error("Ошибка отправки сообщения");
      }

      const data = await response.json();
      
      // Добавляем ответ AI
      const aiMessage: ChatMessage = {
        id: `ai-${Date.now()}`,
        role: "assistant",
        content: data.message,
        createdAt: new Date(),
      };
      
      setMessages((prev) => {
        // Удаляем временное сообщение и добавляем реальные
        const filtered = prev.filter((msg) => msg.id !== tempUserMessage.id);
        return [...filtered, aiMessage];
      });

      // Перезагружаем историю для получения правильных ID
      await loadMessages();

      // Если AI сообщил о завершении профиля, сохраняем данные
      if (data.message.includes("[PROFILE_COMPLETE]")) {
        try {
          const extractResponse = await fetch("/api/chat/extract-profile", {
            method: "POST",
          });
          
          if (extractResponse.ok) {
            const extractData = await extractResponse.json();
            // Можно показать уведомление или редирект
            console.log("Профиль сохранен:", extractData);
          }
        } catch (error) {
          console.error("Ошибка сохранения профиля:", error);
        }
      }
    } catch (error) {
      console.error("Ошибка отправки сообщения:", error);
      // Удаляем временное сообщение при ошибке
      setMessages((prev) => prev.filter((msg) => msg.id !== tempUserMessage.id));
      alert("Не удалось отправить сообщение. Попробуйте еще раз.");
    } finally {
      setIsLoading(false);
    }
  };

  if (isLoadingHistory) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-center">
          <div className="mb-4 inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-brand-500 border-r-transparent"></div>
          <p className="text-gray-600 dark:text-gray-400">Загрузка истории чата...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      {/* Заголовок */}
      <div className="border-b border-gray-200 bg-white px-6 py-4 dark:border-gray-700 dark:bg-gray-800">
        <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
          Чат с AI-помощником
        </h2>
        <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
          Заполните свой профиль с помощью нашего помощника
        </p>
      </div>

      {/* Область сообщений */}
      <div className="flex-1 overflow-y-auto px-6 py-4">
        {messages.length === 0 ? (
          <div className="flex h-full items-center justify-center">
            <div className="text-center">
              <div className="mb-4 text-4xl">👋</div>
              <h3 className="mb-2 text-lg font-semibold text-gray-900 dark:text-white">
                Добро пожаловать!
              </h3>
              <p className="text-gray-600 dark:text-gray-400">
                Начните диалог, чтобы заполнить свой профиль
              </p>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {messages.map((message) => (
              <div
                key={message.id}
                className={`flex ${
                  message.role === "user" ? "justify-end" : "justify-start"
                }`}
              >
                <div
                  className={`max-w-[80%] rounded-lg px-4 py-3 ${
                    message.role === "user"
                      ? "bg-brand-500 text-white"
                      : "bg-gray-100 text-gray-900 dark:bg-gray-700 dark:text-white"
                  }`}
                >
                  <p className="whitespace-pre-wrap text-sm">
                    {message.content.replace(/\[PROFILE_COMPLETE\]/g, "")}
                  </p>
                  <p
                    className={`mt-1 text-xs ${
                      message.role === "user"
                        ? "text-brand-100"
                        : "text-gray-500 dark:text-gray-400"
                    }`}
                  >
                    {new Date(message.createdAt).toLocaleTimeString("ru-RU", {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </p>
                </div>
              </div>
            ))}
            {isLoading && (
              <div className="flex justify-start">
                <div className="rounded-lg bg-gray-100 px-4 py-3 dark:bg-gray-700">
                  <div className="flex items-center gap-2">
                    <div className="h-2 w-2 animate-bounce rounded-full bg-gray-400"></div>
                    <div className="h-2 w-2 animate-bounce rounded-full bg-gray-400 [animation-delay:0.2s]"></div>
                    <div className="h-2 w-2 animate-bounce rounded-full bg-gray-400 [animation-delay:0.4s]"></div>
                  </div>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {/* Форма ввода */}
      <div className="border-t border-gray-200 bg-white px-6 py-4 dark:border-gray-700 dark:bg-gray-800">
        <form onSubmit={handleSubmit} className="flex gap-3">
          <div className="flex-1">
            <TextArea
              value={input}
              onChange={setInput}
              placeholder="Введите ваше сообщение..."
              rows={2}
              disabled={isLoading}
            />
          </div>
          <div className="flex items-end">
            <Button
              type="submit"
              disabled={!input.trim() || isLoading}
              startIcon={
                isLoading ? (
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
                )
              }
            >
              Отправить
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

