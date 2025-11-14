"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";

interface ChatSession {
  id: string;
  title: string;
  type: "STATEMENT" | "APPEAL";
  createdAt: string;
  messageCount: number;
}

interface Appeal {
  id: string;
  publicId: string; // 8-digit formatted ID
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
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [renameSessionId, setRenameSessionId] = useState<string | null>(null);
  const [newSessionName, setNewSessionName] = useState("");
  const router = useRouter();
  const menuRef = useRef<HTMLDivElement>(null);
  const renameInputRef = useRef<HTMLInputElement>(null);

  const loadSessions = useCallback(async () => {
    try {
      setIsLoading(true);
      const [sessionsRes, appealsRes] = await Promise.all([
        fetch("/api/chat/sessions"),
        fetch("/api/appeals"),
      ]);

      if (sessionsRes.ok) {
        const data = await sessionsRes.json();
        // Все сессии, включая statement (заявление)
        const allSessions = data.sessions || [];
        setSessions(allSessions);
      }

      if (appealsRes.ok) {
        const data = await appealsRes.json();
        setAppeals(data.appeals || []);
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

  // Обновляем сессии при фокусе окна (например, после регистрации)
  useEffect(() => {
    const handleFocus = () => {
      if (isExpanded) {
        loadSessions();
      }
    };
    
    window.addEventListener("focus", handleFocus);
    return () => window.removeEventListener("focus", handleFocus);
  }, [isExpanded, loadSessions]);

  // Обновляем сессии при монтировании компонента
  useEffect(() => {
    loadSessions();
  }, []);

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

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape" && openMenuId) {
        setOpenMenuId(null);
      }
    };

    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [openMenuId]);

  const handleNewAppeal = async () => {
    try {
      // Создаем новую сессию обращения
      const response = await fetch("/api/chat/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "APPEAL" }),
      });

      if (response.ok) {
        const data = await response.json();
        // Обновляем список сессий
        await loadSessions();
        // Переходим к новой сессии и очищаем сообщения
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
      router.push(`/dashboard/appeals/${sessionId}`);
    } else {
      router.push(`/dashboard?session=${sessionId}`);
    }
  };

  const handleDeleteSession = async (e: React.MouseEvent, sessionId: string, sessionType: "STATEMENT" | "APPEAL" = "APPEAL") => {
    e.stopPropagation();
    
    if (sessionType === "STATEMENT") {
      alert("Нельзя удалить чат заявления");
      return;
    }

    if (!confirm("Вы уверены, что хотите удалить этот чат?")) return;

    try {
      const response = await fetch(`/api/chat/sessions/${sessionId}`, {
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
      console.error("Error deleting session:", error);
    }
  };

  const handleDeleteAppeal = async (e: React.MouseEvent, appealId: string) => {
    e.stopPropagation();
    if (!confirm("Вы уверены, что хотите удалить это обращение?")) return;

    try {
      const response = await fetch(`/api/appeals/${appealId}`, {
        method: "DELETE",
      });
      if (response.ok) {
        setOpenMenuId(null);
        await loadSessions();
        router.push("/dashboard");
      } else {
        alert("Ошибка при удалении обращения");
      }
    } catch (error) {
      console.error("Error deleting appeal:", error);
    }
  };

  const handleClearSession = async (e: React.MouseEvent, sessionId: string, sessionType: "STATEMENT" | "APPEAL" = "APPEAL") => {
    e.stopPropagation();
    
    if (sessionType === "STATEMENT") {
      alert("Нельзя очищать чат заявления");
      return;
    }

    if (!confirm("Это удалит историю чата, но не сам чат. Продолжить?")) return;

    try {
      await fetch(`/api/chat/sessions/${sessionId}/clear`, {
        method: "POST",
      });
      setOpenMenuId(null);
      await loadSessions();
    } catch (error) {
      console.error("Error clearing session:", error);
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
        setSessions(sessions.map(s =>
          s.id === sessionId ? { ...s, title: newName } : s
        ));
        setRenameSessionId(null);
        setNewSessionName("");
      } else {
        alert("Ошибка при переименовании чата");
      }
    } catch (error) {
      console.error("Error renaming session:", error);
    }
  };

  return (
    <div className="space-y-2">
      {/* AI Chat Header */}
      <div
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex items-center gap-2 px-4 py-2 text-gray-700 dark:text-gray-300 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
      >
        <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
        </svg>
        <span className="flex-1 font-semibold">AI Чат</span>
        <svg
          className={`h-5 w-5 transform transition-transform ${isExpanded ? "rotate-180" : ""}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7-7m0 0L5 14m7-7v12" />
        </svg>
      </div>

      {isExpanded && (
        <div className="space-y-1 border-l-2 border-gray-200 dark:border-gray-700 pl-2" ref={menuRef}>
          {/* Statement Chat - Always present, cannot be deleted/cleared */}
          {sessions.find(s => s.type === "STATEMENT") && (
            <div
              onClick={() => handleOpenSession(sessions.find(s => s.type === "STATEMENT")!.id, "chat")}
              className="flex items-center gap-2 px-3 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded cursor-pointer transition-colors group"
            >
              <svg className="h-4 w-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              <span className="flex-1 truncate font-semibold text-blue-600 dark:text-blue-400">Заявление</span>
              <span className="text-xs text-gray-500 dark:text-gray-400 px-2 py-0.5 bg-gray-100 dark:bg-gray-700 rounded">
                Постоянный
              </span>
            </div>
          )}

          {/* New Chat Button */}
          <button
            onClick={handleNewAppeal}
            className="w-full flex items-center gap-2 px-3 py-2 text-sm text-purple-600 dark:text-purple-400 hover:bg-purple-50 dark:hover:bg-purple-900/20 rounded transition-colors border border-dashed border-purple-300 dark:border-purple-700"
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Новый чат
          </button>

          {/* Appeals List */}
          {appeals.length > 0 && (
            <div className="space-y-1 mt-2">
              <div className="px-3 py-1 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                Обращения
              </div>
              {appeals.map((appeal) => (
                <div key={appeal.id} className="relative group">
                  <div
                    onClick={() => handleOpenSession(appeal.id, "appeal")}
                    className="flex items-center gap-2 px-3 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded cursor-pointer transition-colors"
                  >
                    <svg className="h-4 w-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <span className="flex-1 truncate">Обращение {appeal.publicId}</span>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setOpenMenuId(openMenuId === appeal.id ? null : appeal.id);
                      }}
                      className="p-1 opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M12 8c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm0 2c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm0 6c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z" />
                      </svg>
                    </button>
                  </div>

                  {/* Appeal Options Menu */}
                  {openMenuId === appeal.id && (
                    <div className="absolute left-0 top-full mt-1 w-40 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg z-50">
                      <button
                        onClick={(e) => handleDeleteAppeal(e, appeal.id)}
                        className="w-full px-4 py-2 text-left text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 border-b border-gray-100 dark:border-gray-700 flex items-center gap-2"
                      >
                        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                        Удалить
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Appeal Sessions */}
          {sessions.filter(s => s.type === "APPEAL").length > 0 && (
            <div className="space-y-1 mt-2">
              <div className="px-3 py-1 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                Обращения
              </div>
              {sessions.filter(s => s.type === "APPEAL").map((session) => (
                <div key={session.id} className="relative group">
                  <div
                    onClick={() => handleOpenSession(session.id, "chat")}
                    className="flex items-center gap-2 px-3 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded cursor-pointer transition-colors"
                  >
                    <svg className="h-4 w-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <span className="flex-1 truncate">{session.title}</span>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setOpenMenuId(openMenuId === session.id ? null : session.id);
                      }}
                      className="p-1 opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M12 8c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm0 2c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm0 6c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z" />
                      </svg>
                    </button>
                  </div>

                  {/* Chat Options Menu */}
                  {openMenuId === session.id && (
                    <div className="absolute left-0 top-full mt-1 w-40 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg z-50">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          const currentSession = sessions.find(s => s.id === session.id);
                          setRenameSessionId(session.id);
                          setNewSessionName(currentSession?.title || "");
                          setOpenMenuId(null);
                        }}
                        className="w-full px-4 py-2 text-left text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-2 border-b border-gray-100 dark:border-gray-700"
                      >
                        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                        </svg>
                        Переименовать
                      </button>
                      <button
                        onClick={(e) => handleClearSession(e, session.id, session.type)}
                        className="w-full px-4 py-2 text-left text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-2 border-b border-gray-100 dark:border-gray-700"
                      >
                        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                        Очистить чат
                      </button>
                      <button
                        onClick={(e) => handleDeleteSession(e, session.id, session.type)}
                        className="w-full px-4 py-2 text-left text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 flex items-center gap-2"
                      >
                        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                        Удалить
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Rename Modal */}
          {renameSessionId && (
            <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[10000]">
              <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl p-6 max-w-md mx-4">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                  Переименовать чат
                </h3>
                <input
                  ref={renameInputRef}
                  type="text"
                  value={newSessionName}
                  onChange={(e) => setNewSessionName(e.target.value)}
                  placeholder="Введите новое название чата"
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 mb-4"
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
                <div className="flex gap-3 justify-end">
                  <button
                    onClick={() => {
                      setRenameSessionId(null);
                      setNewSessionName("");
                    }}
                    className="px-4 py-2 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                  >
                    Отмена
                  </button>
                  <button
                    onClick={() => handleRenameSession(renameSessionId, newSessionName)}
                    className="px-4 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition-colors disabled:opacity-50"
                    disabled={!newSessionName.trim()}
                  >
                    Сохранить
                  </button>
                </div>
              </div>
            </div>
          )}

          {isLoading && (
            <div className="px-3 py-2 text-sm text-gray-500 dark:text-gray-400">
              Загрузка...
            </div>
          )}
        </div>
      )}
    </div>
  );
}
