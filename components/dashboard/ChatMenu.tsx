"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import clsx from "clsx";

interface ChatSession {
  id: string;
  title: string;
  type: "STATEMENT" | "APPEAL";
  createdAt: string;
  messageCount: number;
}

interface Appeal {
  id: string;
  publicId: string;
  type: string;
  createdAt: string;
  messageCount?: number;
}

interface ChatMenuProps {
  isCollapsed: boolean;
}

export default function ChatMenu({ isCollapsed }: ChatMenuProps) {
  const [isExpanded, setIsExpanded] = useState(true);
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [appeals, setAppeals] = useState<Appeal[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [renameSessionId, setRenameSessionId] = useState<string | null>(null);
  const [newSessionName, setNewSessionName] = useState("");
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const menuRef = useRef<HTMLDivElement>(null);
  const renameInputRef = useRef<HTMLInputElement>(null);

  // Get active session ID from URL
  const activeSessionId = searchParams.get("session") || searchParams.get("appeal") || null;

  const isLoadingRef = useRef(false);
  const hasLoadedRef = useRef(false);
  const loadSessionsRef = useRef<(() => Promise<void>) | null>(null);

  const loadSessions = useCallback(async () => {
    // Защита от дублирующихся запросов
    if (isLoadingRef.current) return;
    isLoadingRef.current = true;
    
    try {
      setIsLoading(true);
      const [sessionsRes, appealsRes] = await Promise.all([
        fetch("/api/chat/sessions"),
        fetch("/api/appeals"),
      ]);

      if (sessionsRes.ok) {
        const data = await sessionsRes.json();
        setSessions(data.sessions || []);
      }

      if (appealsRes.ok) {
        const data = await appealsRes.json();
        setAppeals(data.appeals || []);
      }
      
      hasLoadedRef.current = true;
    } catch (error) {
      console.error("Error loading chat sessions:", error);
    } finally {
      setIsLoading(false);
      isLoadingRef.current = false;
    }
  }, []);

  // Сохраняем функцию в ref
  useEffect(() => {
    loadSessionsRef.current = loadSessions;
  }, [loadSessions]);

  // Загружаем только ОДИН раз при монтировании
  useEffect(() => {
    if (!hasLoadedRef.current) {
      loadSessions();
    }
  }, [loadSessions]);

  // Перезагружаем при разворачивании меню (но не при первом монтировании)
  useEffect(() => {
    if (isExpanded && hasLoadedRef.current) {
      loadSessions();
    }
  }, [isExpanded, loadSessions]);

  // Обновляем при возврате фокуса на окно
  useEffect(() => {
    const handleFocus = () => {
      if (isExpanded && hasLoadedRef.current) {
        loadSessionsRef.current?.();
      }
    };
    window.addEventListener("focus", handleFocus);
    return () => window.removeEventListener("focus", handleFocus);
  }, [isExpanded]);

  const handleNewAppeal = async () => {
    try {
      const response = await fetch("/api/chat/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "APPEAL" }),
      });

      if (response.ok) {
        const data = await response.json();
        await loadSessions();
        router.push(`/dashboard?session=${data.session.id}`);
      } else {
        const errorData = await response.json().catch(() => ({}));
        alert(errorData.error || "Ошибка при создании нового обращения");
      }
    } catch (error) {
      console.error("Error creating new appeal:", error);
      alert("Ошибка при создании нового обращения");
    }
  };

  const handleOpenSession = (sessionId: string, type: "statement" | "appeal" | "chat" = "chat") => {
    if (type === "appeal") {
      router.push(`/dashboard?appeal=${sessionId}`);
    } else {
      router.push(`/dashboard?session=${sessionId}`);
    }
  };

  const handleDeleteAppeal = async (e: React.MouseEvent | React.KeyboardEvent, appealId: string) => {
    e.stopPropagation();
    if (!confirm("Вы уверены, что хотите удалить это обращение?")) return;

    try {
      const response = await fetch(`/api/appeals/${appealId}`, {
        method: "DELETE",
      });
      if (response.ok) {
        await loadSessions();
        if (activeSessionId === appealId) {
          router.push("/dashboard");
        }
      } else {
        alert("Ошибка при удалении обращения");
      }
    } catch (error) {
      console.error("Error deleting appeal:", error);
    }
  };

  const handleRenameSession = async (sessionId: string, newName: string) => {
    if (!newName.trim()) return;

    try {
      const response = await fetch("/api/chat/sessions/rename", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId, title: newName }),
      });

      if (response.ok) {
        await loadSessions();
        setRenameSessionId(null);
        setNewSessionName("");
      } else {
        alert("Ошибка при переименовании чата");
      }
    } catch (error) {
      console.error("Error renaming session:", error);
    }
  };

  const statementSession = sessions.find(s => s.type === "STATEMENT");

  if (isCollapsed) {
    return (
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex h-10 w-10 items-center justify-center rounded-lg text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700 transition-colors"
        title="AI Чат"
      >
        <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
        </svg>
      </button>
    );
  }

  return (
    <div className="space-y-1" ref={menuRef}>
      {/* Header */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700 transition-colors"
      >
        <svg className="h-5 w-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
        </svg>
        <span className="flex-1 text-left">AI Чат</span>
        <svg
          className={`h-4 w-4 transition-transform ${isExpanded ? "rotate-180" : ""}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {isExpanded && (
        <div className="ml-2 max-h-96 space-y-0.5 overflow-y-auto border-l border-gray-200 dark:border-gray-700 pl-2">
          {/* Statement Session */}
          {statementSession && (
            <button
              onClick={() => handleOpenSession(statementSession.id, "chat")}
              onMouseEnter={() => setHoveredId(statementSession.id)}
              onMouseLeave={() => setHoveredId(null)}
              className={clsx(
                "group relative flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors",
                activeSessionId === statementSession.id
                  ? "bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-300"
                  : "text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700"
              )}
            >
              <svg className="h-4 w-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              <span className="flex-1 truncate text-left">Мой бот</span>
              {hoveredId === statementSession.id && (
                <span className="text-xs text-gray-500 dark:text-gray-400">Постоянный</span>
              )}
            </button>
          )}

          {/* Appeal Sessions from ChatSessions */}
          {sessions.filter(s => s.type === "APPEAL").map((session) => {
            const isActive = activeSessionId === session.id;
            const isHovered = hoveredId === session.id;
            return (
              <div
                key={session.id}
                className="group relative"
                onMouseEnter={() => setHoveredId(session.id)}
                onMouseLeave={() => setHoveredId(null)}
              >
                <button
                  onClick={() => handleOpenSession(session.id, "chat")}
                  className={clsx(
                    "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors",
                    isActive
                      ? "bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-300"
                      : "text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700"
                  )}
                >
                  <svg className="h-4 w-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <span className="flex-1 truncate text-left">{session.title || "Обращение"}</span>
                  {isHovered && (
                    <div
                      onClick={(e) => {
                        e.stopPropagation();
                        if (confirm("Вы уверены, что хотите удалить это обращение?")) {
                          fetch(`/api/chat/sessions/${session.id}`, { method: "DELETE" })
                            .then(() => loadSessions())
                            .catch(console.error);
                        }
                      }}
                      className="flex-shrink-0 cursor-pointer rounded p-0.5 text-gray-400 hover:bg-red-100 hover:text-red-600 dark:hover:bg-red-900/20 dark:hover:text-red-400"
                      title="Удалить"
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          e.stopPropagation();
                          if (confirm("Вы уверены, что хотите удалить это обращение?")) {
                            fetch(`/api/chat/sessions/${session.id}`, { method: "DELETE" })
                              .then(() => loadSessions())
                              .catch(console.error);
                          }
                        }
                      }}
                    >
                      <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </div>
                  )}
                </button>
              </div>
            );
          })}

          {/* New Chat Button */}
          <button
            onClick={handleNewAppeal}
            className="flex w-full items-center gap-2 rounded-md border border-dashed border-gray-300 px-2 py-1.5 text-sm text-gray-600 hover:border-gray-400 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-400 dark:hover:border-gray-500 dark:hover:bg-gray-800 transition-colors"
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            <span className="text-left">Новый чат</span>
          </button>

          {/* Appeals */}
          {appeals.length > 0 && (
            <>
              <div className="px-2 py-1.5 text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                Обращения
              </div>
              {appeals.map((appeal) => {
                const isActive = activeSessionId === appeal.id;
                const isHovered = hoveredId === appeal.id;
                return (
                  <div
                    key={appeal.id}
                    className="group relative"
                    onMouseEnter={() => setHoveredId(appeal.id)}
                    onMouseLeave={() => setHoveredId(null)}
                  >
                    <button
                      onClick={() => handleOpenSession(appeal.id, "appeal")}
                      className={clsx(
                        "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors",
                        isActive
                          ? "bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-300"
                          : "text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700"
                      )}
                    >
                      <svg className="h-4 w-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      <span className="flex-1 truncate text-left">Обращение {appeal.publicId}</span>
                      {isHovered && (
                        <div
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteAppeal(e, appeal.id);
                          }}
                          className="flex-shrink-0 cursor-pointer rounded p-0.5 text-gray-400 hover:bg-red-100 hover:text-red-600 dark:hover:bg-red-900/20 dark:hover:text-red-400"
                          title="Удалить"
                          role="button"
                          tabIndex={0}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault();
                              e.stopPropagation();
                              // Create a synthetic mouse event for handleDeleteAppeal
                              const syntheticEvent = {
                                ...e,
                                stopPropagation: () => e.stopPropagation(),
                                preventDefault: () => e.preventDefault(),
                              } as unknown as React.MouseEvent;
                              handleDeleteAppeal(syntheticEvent, appeal.id);
                            }
                          }}
                        >
                          <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </div>
                      )}
                    </button>
                  </div>
                );
              })}
            </>
          )}

          {isLoading && (
            <div className="px-2 py-1.5 text-xs text-gray-500 dark:text-gray-400">
              Загрузка...
            </div>
          )}
        </div>
      )}

      {/* Rename Modal */}
      {renameSessionId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl dark:bg-gray-800">
            <h3 className="mb-4 text-lg font-semibold text-gray-900 dark:text-white">
              Переименовать чат
            </h3>
            <input
              ref={renameInputRef}
              type="text"
              value={newSessionName}
              onChange={(e) => setNewSessionName(e.target.value)}
              placeholder="Введите новое название"
              className="mb-4 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-gray-900 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white dark:placeholder-gray-400"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  handleRenameSession(renameSessionId, newSessionName);
                }
                if (e.key === "Escape") {
                  setRenameSessionId(null);
                  setNewSessionName("");
                }
              }}
            />
            <div className="flex justify-end gap-3">
              <button
                onClick={() => {
                  setRenameSessionId(null);
                  setNewSessionName("");
                }}
                className="rounded-lg px-4 py-2 text-gray-700 transition-colors hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700"
              >
                Отмена
              </button>
              <button
                onClick={() => handleRenameSession(renameSessionId, newSessionName)}
                className="rounded-lg bg-blue-600 px-4 py-2 text-white transition-colors hover:bg-blue-700 disabled:opacity-50"
                disabled={!newSessionName.trim()}
              >
                Сохранить
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
