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

  if (collapsed) {
    // В свёрнутом состоянии показываем только иконку
    return (
      <button
        onClick={() => otherMode && handleSwitch(otherMode.mode)}
        disabled={isSwitching}
        className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-r from-blue-500 to-purple-500 text-white shadow-sm hover:from-blue-600 hover:to-purple-600 transition-all disabled:opacity-50"
        title={`Переключить на: ${otherMode?.label}`}
      >
        {isSwitching ? (
          <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
        ) : currentMode === "PPO_HEAD" ? (
          <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
          </svg>
        ) : (
          <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
          </svg>
        )}
      </button>
    );
  }

  return (
    <div className="relative">
      {/* Переключатель */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg bg-gradient-to-r from-blue-50 to-purple-50 dark:from-blue-900/20 dark:to-purple-900/20 border border-blue-200 dark:border-blue-800 hover:border-blue-300 dark:hover:border-blue-700 transition-all"
      >
        <div className={`flex items-center justify-center h-8 w-8 rounded-lg ${
          currentMode === "PPO_HEAD" 
            ? "bg-gradient-to-r from-purple-500 to-blue-500 text-white" 
            : "bg-gradient-to-r from-blue-500 to-green-500 text-white"
        }`}>
          {currentMode === "PPO_HEAD" ? (
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
            </svg>
          ) : (
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
            </svg>
          )}
        </div>
        <div className="flex-1 text-left min-w-0">
          <p className="text-xs text-gray-500 dark:text-gray-400">Режим работы</p>
          <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
            {currentModeData?.label || "Загрузка..."}
          </p>
        </div>
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
          {/* Backdrop */}
          <div 
            className="fixed inset-0 z-10" 
            onClick={() => setIsOpen(false)} 
          />
          
          {/* Menu */}
          <div className="absolute bottom-full left-0 right-0 mb-2 z-20 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
            <div className="p-2 space-y-1">
              {availableModes.map((mode) => (
                <button
                  key={mode.mode}
                  onClick={() => handleSwitch(mode.mode)}
                  disabled={isSwitching}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors ${
                    mode.mode === currentMode
                      ? "bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400"
                      : "hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300"
                  } ${isSwitching ? "opacity-50 cursor-not-allowed" : ""}`}
                >
                  <div className={`flex items-center justify-center h-8 w-8 rounded-lg ${
                    mode.mode === "PPO_HEAD" 
                      ? "bg-gradient-to-r from-purple-500 to-blue-500 text-white" 
                      : "bg-gradient-to-r from-blue-500 to-green-500 text-white"
                  }`}>
                    {mode.mode === "PPO_HEAD" ? (
                      <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                      </svg>
                    ) : (
                      <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                      </svg>
                    )}
                  </div>
                  <div className="flex-1 text-left min-w-0">
                    <p className="text-sm font-medium">{mode.label}</p>
                    {mode.organizationName && (
                      <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                        {mode.organizationName}
                      </p>
                    )}
                  </div>
                  {mode.mode === currentMode && (
                    <svg className="h-4 w-4 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                </button>
              ))}
            </div>
            
            <div className="px-3 py-2 bg-gray-50 dark:bg-gray-700/50 border-t border-gray-200 dark:border-gray-700">
              <p className="text-xs text-gray-500 dark:text-gray-400 text-center">
                Выберите режим работы с платформой
              </p>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

