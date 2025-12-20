"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { safeFetchJson } from "@/lib/safe-fetch";

interface ViewModeOption {
  mode: string;
  label: string;
  organizationName?: string;
}

interface ViewModeSwitchProps {
  collapsed?: boolean;
}

export default function ViewModeSwitch({ collapsed = false }: ViewModeSwitchProps) {
  const router = useRouter();
  const [currentMode, setCurrentMode] = useState<string>("MEMBER");
  const [availableModes, setAvailableModes] = useState<ViewModeOption[]>([]);
  const [canSwitch, setCanSwitch] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSwitching, setIsSwitching] = useState(false);
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    loadViewMode();
  }, []);

  const loadViewMode = async () => {
    try {
      // Загружаем режим просмотра (не критичный запрос)
      const data = await safeFetchJson<{ currentMode: string; availableModes: ViewModeOption[]; canSwitch: boolean }>("/api/user/view-mode", {
        ignoreServerErrors: true,
        logErrors: false,
      });
      
      if (data) {
        setCurrentMode(data.currentMode);
        setAvailableModes(data.availableModes);
        setCanSwitch(data.canSwitch);
      }
    } catch (error) {
      // Только для критичных ошибок (не 503/500)
      if (process.env.NODE_ENV === 'development') {
        console.error("Error loading view mode:", error);
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleSwitch = async (newMode: string) => {
    if (newMode === currentMode || isSwitching) return;

    try {
      setIsSwitching(true);
      const response = await fetch("/api/user/view-mode", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: newMode }),
      });

      if (response.ok) {
        setCurrentMode(newMode);
        setIsOpen(false);
        // Полная перезагрузка страницы с очисткой кеша
        window.location.replace("/dashboard?t=" + Date.now());
      }
    } catch (error) {
      console.error("Error switching view mode:", error);
    } finally {
      setIsSwitching(false);
    }
  };

  // Не показываем переключатель если нет возможности переключения
  if (isLoading || !canSwitch || availableModes.length <= 1) {
    return null;
  }

  const currentModeData = availableModes.find((m) => m.mode === currentMode);
  const otherMode = availableModes.find((m) => m.mode !== currentMode);

  // В стиле обычного пункта меню
  const icon = currentMode === "PPO_HEAD" ? (
    <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
    </svg>
  ) : (
    <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
    </svg>
  );

  if (collapsed) {
    return (
      <button
        onClick={() => otherMode && handleSwitch(otherMode.mode)}
        disabled={isSwitching}
        className="flex h-9 w-9 items-center justify-center rounded-lg text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700 transition-colors disabled:opacity-50"
        title={`Переключить на: ${otherMode?.label}`}
      >
        {isSwitching ? (
          <div className="h-4 w-4 animate-spin rounded-full border-2 border-gray-500 border-t-transparent" />
        ) : icon}
      </button>
    );
  }

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex w-full items-center gap-2.5 rounded-lg text-sm font-medium transition-colors text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700 px-2.5 py-2"
      >
        <span className="flex-shrink-0">{icon}</span>
        <span className="flex-1 text-left">
          {currentMode === "PPO_HEAD" ? "Режим: Председатель" : "Режим: Участник"}
        </span>
        <svg 
          className={`h-4 w-4 text-gray-400 transition-transform ${isOpen ? "rotate-180" : ""}`} 
          fill="none" 
          stroke="currentColor" 
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* Dropdown */}
      {isOpen && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setIsOpen(false)} />
          <div className="absolute top-full left-0 right-0 mt-1 z-20 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
            <div className="py-1">
              {availableModes.map((mode) => (
                <button
                  key={mode.mode}
                  onClick={() => handleSwitch(mode.mode)}
                  disabled={isSwitching}
                  className={`w-full flex items-center gap-2.5 px-3 py-2 text-sm transition-colors ${
                    mode.mode === currentMode
                      ? "bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400"
                      : "hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300"
                  } ${isSwitching ? "opacity-50 cursor-not-allowed" : ""}`}
                >
                  {mode.mode === "PPO_HEAD" ? (
                    <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                    </svg>
                  ) : (
                    <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                    </svg>
                  )}
                  <span className="flex-1 text-left">{mode.label}</span>
                  {mode.mode === currentMode && (
                    <svg className="h-4 w-4 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                </button>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

