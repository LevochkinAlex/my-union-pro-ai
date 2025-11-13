"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";

interface Appeal {
  id: string;
  publicId: string;
  type: string;
  status: string;
  title: string;
  createdAt: string;
  messageCount: number;
}

interface AppealMenuProps {
  isCollapsed: boolean;
}

const APPEAL_TYPES = {
  LEGAL: "⚖️ Юридическое",
  ACCOUNTING: "💼 Бухгалтерское",
  TECHNICAL: "🔧 Техническое",
  HR: "👥 Кадровое",
  OTHER: "❓ Прочее",
};

const STATUS_COLORS = {
  PENDING: "🟡 Ожидание",
  IN_PROGRESS: "🔵 В работе",
  RESOLVED: "🟢 Решено",
  REJECTED: "🔴 Отклонено",
  CLOSED: "⚫ Закрыто",
};

export default function AppealMenu({ isCollapsed }: AppealMenuProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [appeals, setAppeals] = useState<Appeal[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const router = useRouter();
  const menuRef = useRef<HTMLDivElement>(null);

  const loadAppeals = useCallback(async () => {
    try {
      setIsLoading(true);
      const response = await fetch("/api/appeals");
      if (response.ok) {
        const data = await response.json();
        setAppeals(data.appeals || []);
      }
    } catch (error) {
      console.error("Error loading appeals:", error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isExpanded) {
      loadAppeals();
    }
  }, [isExpanded, loadAppeals]);

  // Close menu when clicking outside
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
  }, []);

  const handleOpenAppeal = (appealId: string) => {
    router.push(`/dashboard/appeals/${appealId}`);
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
        await loadAppeals();
      } else {
        alert("Ошибка при удалении обращения");
      }
    } catch (error) {
      console.error("Error deleting appeal:", error);
      alert("Ошибка при удалении обращения");
    }
  };

  return (
    <div className={`space-y-2 ${isCollapsed ? "" : ""}`}>
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className={`w-full flex items-center gap-3 rounded-lg text-sm font-medium transition-colors ${
          isExpanded
            ? "bg-purple-600 text-white shadow-sm"
            : "text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700"
        } ${isCollapsed ? "h-10 w-10 justify-center" : "px-3 py-2.5"}`}
      >
        <svg className="h-5 w-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
          />
        </svg>
        {!isCollapsed && (
          <>
            <span className="flex-1 text-left">Обращения</span>
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

      {isExpanded && !isCollapsed && (
        <div ref={menuRef} className="ml-4 space-y-1 rounded-lg border border-gray-200 bg-gray-50 p-2 dark:border-gray-700 dark:bg-gray-800">
          {isLoading ? (
            <div className="px-2 py-2 text-xs text-gray-500">Загрузка...</div>
          ) : appeals.length === 0 ? (
            <div className="px-2 py-2 text-xs text-gray-500">Обращений нет</div>
          ) : (
            <div className="space-y-1 max-h-48 overflow-y-auto">
              {appeals.map((appeal) => (
                <div
                  key={appeal.id}
                  onClick={() => handleOpenAppeal(appeal.id)}
                  className="group relative flex items-center justify-between gap-2 rounded px-2 py-1.5 text-xs text-gray-700 hover:bg-gray-200 dark:text-gray-300 dark:hover:bg-gray-700 cursor-pointer"
                >
                  <div className="flex items-center gap-2 truncate flex-1">
                    <div className="flex flex-col gap-0.5 flex-1 min-w-0">
                      <div className="flex items-center gap-1 truncate">
                        <span className="text-xs">
                          {APPEAL_TYPES[appeal.type as keyof typeof APPEAL_TYPES] || appeal.type}
                        </span>
                        <span className="text-xs font-mono font-bold text-purple-600 dark:text-purple-400">
                          #{appeal.publicId}
                        </span>
                      </div>
                      <span className="text-xs text-gray-500 truncate">
                        {STATUS_COLORS[appeal.status as keyof typeof STATUS_COLORS] || appeal.status}
                      </span>
                    </div>
                  </div>

                  {/* Menu button */}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setOpenMenuId(openMenuId === appeal.id ? null : appeal.id);
                    }}
                    className="h-5 w-5 rounded hover:bg-gray-300 dark:hover:bg-gray-600 flex items-center justify-center flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
                    title="Опции"
                  >
                    <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 20 20">
                      <path d="M10 6a2 2 0 110-4 2 2 0 010 4zM10 12a2 2 0 110-4 2 2 0 010 4zM10 18a2 2 0 110-4 2 2 0 010 4z" />
                    </svg>
                  </button>

                  {/* Dropdown menu */}
                  {openMenuId === appeal.id && (
                    <div className="fixed bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg z-[9999] min-w-max">
                      <button
                        onClick={(e) => handleDeleteAppeal(e, appeal.id)}
                        className="w-full px-4 py-2 text-left text-sm text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-900/20 flex items-center gap-2"
                      >
                        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                          />
                        </svg>
                        Удалить
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

