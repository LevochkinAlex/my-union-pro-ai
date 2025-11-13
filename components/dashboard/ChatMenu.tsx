"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

interface ChatSession {
  id: string;
  title: string;
  createdAt: string;
  messageCount: number;
}

interface ChatMenuProps {
  isCollapsed: boolean;
}

export default function ChatMenu({ isCollapsed }: ChatMenuProps) {
  const [isExpanded, setIsExpanded] = useState(true); // Keep expanded by default
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const router = useRouter();
  const menuRef = useRef<HTMLDivElement>(null);

  const loadSessions = useCallback(async () => {
    try {
      setIsLoading(true);
      const response = await fetch("/api/chat/sessions");
      if (response.ok) {
        const data = await response.json();
        setSessions(data.sessions || []);
      }
    } catch (error) {
      console.error("Error loading chat sessions:", error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isExpanded) {
      loadSessions();
    }
  }, [isExpanded, loadSessions]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setOpenMenuId(null);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [menuRef]);

  // Close menu when pressing Escape
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape" && openMenuId) {
        setOpenMenuId(null);
      }
    };

    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [openMenuId]);


  const handleNewChat = () => {
    // This is for "appeals"
    router.push("/dashboard?mode=appeal");
  };

  const handleOpenSession = (sessionId: string) => {
    router.push(`/dashboard?session=${sessionId}`);
  };

  const handleDeleteSession = async (e: React.MouseEvent, sessionId: string) => {
    e.stopPropagation();
    if (!confirm("Вы уверены, что хотите удалить этот чат?")) return;

    try {
      const response = await fetch(`/api/chat/sessions?id=${sessionId}`, {
        method: "DELETE",
      });
      if (response.ok) {
        setOpenMenuId(null);
        await loadSessions();
        const currentSessionId = new URLSearchParams(window.location.search).get("session");
        if (currentSessionId === sessionId) {
          router.push("/dashboard");
        }
      } else {
        alert("Ошибка при удалении чата");
      }
    } catch (error) {
      console.error("Error deleting chat session:", error);
      alert("Ошибка при удалении чата");
    }
  };

  const handleClearAll = async () => {
    if (!confirm("Вы уверены, что хотите очистить всю историю чата? Это действие нельзя отменить.")) {
      return;
    }

    try {
      const response = await fetch("/api/chat/sessions", {
        method: "DELETE",
      });

      if (response.ok) {
        await loadSessions();
        router.push("/dashboard");
      } else {
        alert("Ошибка при удалении истории");
      }
    } catch (error) {
      console.error("Error clearing all chats:", error);
      alert("Ошибка при удалении истории");
    }
  };

  return (
    <div className={`space-y-2 ${isCollapsed ? "" : ""}`}>
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className={`w-full flex items-center gap-3 rounded-lg text-sm font-medium transition-colors ${
          isExpanded
            ? "bg-blue-600 text-white shadow-sm"
            : "text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700"
        } ${isCollapsed ? "h-10 w-10 justify-center" : "px-3 py-2.5"}`}
      >
        <svg className="h-5 w-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
          />
        </svg>
        {!isCollapsed && (
          <>
            <span className="flex-1 text-left">AI Чат</span>
            <svg
              className={`h-4 w-4 transition-transform ${isExpanded ? "rotate-180" : ""}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
            </svg>
          </>
        )}
      </button>

      {/* Expanded menu */}
      {isExpanded && !isCollapsed && (
        <div ref={menuRef} className="ml-4 space-y-1 rounded-lg border border-gray-200 bg-gray-50 p-2 dark:border-gray-700 dark:bg-gray-800 relative z-0">
          {/* SINGLE New Chat Button */}
          <button onClick={handleNewChat} className="w-full flex items-center gap-2 rounded px-2 py-2 text-sm text-purple-700 hover:bg-purple-100 dark:text-purple-400 dark:hover:bg-purple-900/20 font-medium">
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            <span>Новый чат</span>
          </button>

          {/* Sessions list */}
          {isLoading ? (
            <div className="px-2 py-2 text-xs text-gray-500">Загрузка...</div>
          ) : sessions.length === 0 ? (
            <div className="px-2 py-2 text-xs text-gray-500">История пуста</div>
          ) : (
            <div className="space-y-1 max-h-48 overflow-y-auto">
              {sessions.map((session) => (
                <div
                  key={session.id}
                  onClick={() => handleOpenSession(session.id)}
                  className="group relative flex items-center justify-between gap-2 rounded px-2 py-1.5 text-xs text-gray-700 hover:bg-gray-200 dark:text-gray-300 dark:hover:bg-gray-700 cursor-pointer"
                >
                  <div className="flex items-center gap-2 truncate">
                    <svg className="h-3 w-3 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v12a2 2 0 01-2 2h-3l-4 4z"
                      />
                    </svg>
                    <span className="flex-1 truncate">{session.title}</span>
                  </div>

                  {/* Dropdown menu button */}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setOpenMenuId(openMenuId === session.id ? null : session.id);
                    }}
                    className="h-5 w-5 rounded hover:bg-gray-300 dark:hover:bg-gray-600 flex items-center justify-center flex-shrink-0"
                    title="Опции"
                  >
                    <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 20 20">
                      <path d="M10 6a2 2 0 110-4 2 2 0 010 4zM10 12a2 2 0 110-4 2 2 0 010 4zM10 18a2 2 0 110-4 2 2 0 010 4z" />
                    </svg>
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Dropdown menu - outside overflow container */}
          {openMenuId && (
            <div className="fixed top-20 left-56 w-56 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg z-[9999]">
              <button
                onClick={(e) => handleDeleteSession(e, openMenuId)}
                className="w-full px-4 py-2 text-left text-sm text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-900/20 flex items-center gap-2 border-b border-gray-100 dark:border-gray-700"
              >
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                  />
                </svg>
                Удалить чат
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  alert("Функция переименования ещё не реализована");
                  setOpenMenuId(null);
                }}
                className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-gray-700 flex items-center gap-2 border-b border-gray-100 dark:border-gray-700"
              >
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                  />
                </svg>
                Переименовать
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  if (confirm("Вы уверены, что хотите очистить этот чат?")) {
                    alert("Функция очистки чата ещё не реализована");
                  }
                  setOpenMenuId(null);
                }}
                className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-gray-700 flex items-center gap-2"
              >
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
                Очистить чат
              </button>
            </div>
          )}

          {/* Clear all button */}
          {sessions.length > 0 && (
            <button
              onClick={handleClearAll}
              className="w-full mt-2 pt-2 border-t border-gray-200 dark:border-gray-700 flex items-center gap-2 rounded px-2 py-2 text-xs text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-900/20"
            >
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                />
              </svg>
              <span>Очистить все</span>
            </button>
          )}
        </div>
      )}
    </div>
  );
}

