"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { redirect } from "next/navigation";

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
}

interface ChatSession {
  id: string;
  type: string;
  createdAt: string;
  user: {
    email: string;
    firstName?: string;
    lastName: string;
  };
  messages: ChatMessage[];
}

interface ProfileData {
  firstName?: string;
  lastName?: string;
  middleName?: string;
  dateOfBirth?: string;
  phone?: string;
  address?: string;
  region?: string;
  organizationName?: string;
  jobTitle?: string;
  profession?: string;
  education?: string;
}

export default function ChatDebugPage() {
  const { data: session, status } = useSession();
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [selectedSession, setSelectedSession] = useState<ChatSession | null>(null);
  const [extractedData, setExtractedData] = useState<ProfileData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isExtracting, setIsExtracting] = useState(false);

  // Проверка прав доступа
  useEffect(() => {
    if (status === "unauthenticated") {
      redirect("/api/auth/signin");
    }
    if (session?.user?.role !== "SUPER_ADMIN") {
      redirect("/dashboard");
    }
  }, [session, status]);

  // Загрузка сессий
  useEffect(() => {
    if (session?.user?.role === "SUPER_ADMIN") {
      loadSessions();
    }
  }, [session]);

  const loadSessions = async () => {
    try {
      setIsLoading(true);
      const response = await fetch("/api/admin/chat-sessions");
      if (response.ok) {
        const data = await response.json();
        setSessions(data.sessions);
      }
    } catch (error) {
      console.error("Error loading sessions:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const loadSessionDetails = async (sessionId: string) => {
    try {
      const response = await fetch(`/api/admin/chat-sessions/${sessionId}`);
      if (response.ok) {
        const data = await response.json();
        setSelectedSession(data.session);
        setExtractedData(null);
      }
    } catch (error) {
      console.error("Error loading session:", error);
    }
  };

  const extractProfileData = async () => {
    if (!selectedSession) return;

    try {
      setIsExtracting(true);
      const response = await fetch("/api/admin/extract-profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: selectedSession.id }),
      });

      if (response.ok) {
        const data = await response.json();
        setExtractedData(data.profileData);
      }
    } catch (error) {
      console.error("Error extracting profile:", error);
    } finally {
      setIsExtracting(false);
    }
  };

  if (status === "loading" || isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center">
          <div className="mb-4 text-2xl">⏳</div>
          <p>Загрузка...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-8">
      <div className="mx-auto max-w-7xl">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
            🔍 Отладка чат-бота
          </h1>
          <p className="mt-2 text-gray-600 dark:text-gray-400">
            Анализ диалогов и экстракция данных
          </p>
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          {/* Список сессий */}
          <div className="lg:col-span-1">
            <div className="rounded-lg bg-white dark:bg-gray-800 p-6 shadow">
              <h2 className="mb-4 text-xl font-semibold text-gray-900 dark:text-white">
                Сессии ({sessions.length})
              </h2>
              <div className="space-y-2 max-h-[600px] overflow-y-auto">
                {sessions.map((session) => (
                  <button
                    key={session.id}
                    onClick={() => loadSessionDetails(session.id)}
                    className={`w-full rounded-lg border p-3 text-left transition-colors ${
                      selectedSession?.id === session.id
                        ? "border-blue-500 bg-blue-50 dark:bg-blue-900/20"
                        : "border-gray-200 hover:border-gray-300 dark:border-gray-700 dark:hover:border-gray-600"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-medium text-gray-900 dark:text-white">
                          {session.user.email}
                        </p>
                        <p className="text-sm text-gray-500 dark:text-gray-400">
                          {session.messages.length} сообщений
                        </p>
                      </div>
                      <span className="text-xs text-gray-400">
                        {new Date(session.createdAt).toLocaleDateString("ru-RU")}
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Детали сессии */}
          <div className="lg:col-span-2">
            {selectedSession ? (
              <div className="space-y-6">
                {/* Информация о сессии */}
                <div className="rounded-lg bg-white dark:bg-gray-800 p-6 shadow">
                  <h2 className="mb-4 text-xl font-semibold text-gray-900 dark:text-white">
                    Информация о сессии
                  </h2>
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <span className="font-medium text-gray-500 dark:text-gray-400">
                        ID:
                      </span>
                      <p className="mt-1 font-mono text-xs text-gray-900 dark:text-white">
                        {selectedSession.id}
                      </p>
                    </div>
                    <div>
                      <span className="font-medium text-gray-500 dark:text-gray-400">
                        Тип:
                      </span>
                      <p className="mt-1 text-gray-900 dark:text-white">
                        {selectedSession.type}
                      </p>
                    </div>
                    <div>
                      <span className="font-medium text-gray-500 dark:text-gray-400">
                        Пользователь:
                      </span>
                      <p className="mt-1 text-gray-900 dark:text-white">
                        {selectedSession.user.email}
                      </p>
                    </div>
                    <div>
                      <span className="font-medium text-gray-500 dark:text-gray-400">
                        Сообщений:
                      </span>
                      <p className="mt-1 text-gray-900 dark:text-white">
                        {selectedSession.messages.length}
                      </p>
                    </div>
                  </div>

                  <button
                    onClick={extractProfileData}
                    disabled={isExtracting}
                    className="mt-4 rounded-lg bg-blue-600 px-4 py-2 text-white hover:bg-blue-700 disabled:opacity-50"
                  >
                    {isExtracting ? "Извлечение..." : "🔬 Извлечь данные профиля"}
                  </button>
                </div>

                {/* Извлечённые данные */}
                {extractedData && (
                  <div className="rounded-lg bg-green-50 dark:bg-green-900/20 p-6 shadow">
                    <h2 className="mb-4 text-xl font-semibold text-green-900 dark:text-green-100">
                      ✅ Извлечённые данные
                    </h2>
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      {Object.entries(extractedData).map(([key, value]) => (
                        <div key={key}>
                          <span className="font-medium text-green-700 dark:text-green-300">
                            {key}:
                          </span>
                          <p className="mt-1 text-green-900 dark:text-green-100">
                            {value || "—"}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* История сообщений */}
                <div className="rounded-lg bg-white dark:bg-gray-800 p-6 shadow">
                  <h2 className="mb-4 text-xl font-semibold text-gray-900 dark:text-white">
                    История диалога
                  </h2>
                  <div className="space-y-4 max-h-[600px] overflow-y-auto">
                    {selectedSession.messages.map((msg, idx) => (
                      <div
                        key={msg.id}
                        className={`rounded-lg p-4 ${
                          msg.role === "user"
                            ? "bg-blue-50 dark:bg-blue-900/20"
                            : "bg-gray-50 dark:bg-gray-700/50"
                        }`}
                      >
                        <div className="mb-2 flex items-center justify-between">
                          <span className="text-sm font-medium">
                            {msg.role === "user" ? "👤 Пользователь" : "🤖 Бот"}
                          </span>
                          <span className="text-xs text-gray-500">#{idx + 1}</span>
                        </div>
                        <p className="whitespace-pre-wrap text-sm text-gray-900 dark:text-white">
                          {msg.content}
                        </p>
                        <div className="mt-2 text-xs text-gray-400">
                          {new Date(msg.createdAt).toLocaleString("ru-RU")}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex h-full items-center justify-center rounded-lg bg-white dark:bg-gray-800 p-12 shadow">
                <div className="text-center text-gray-500 dark:text-gray-400">
                  <div className="mb-4 text-4xl">💬</div>
                  <p>Выберите сессию для просмотра</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

