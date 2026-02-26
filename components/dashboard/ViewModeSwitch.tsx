"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { safeFetchJson } from "@/lib/safe-fetch";

interface ViewModeOption {
  mode: string;
  label: string;
  organizationName?: string;
}

interface ViewModeSwitchProps {
  collapsed?: boolean;
  /** Режимы с сервера — переключатель показывается сразу, без ожидания API */
  serverViewModes?: { mode: string; label: string }[];
  serverViewMode?: string;
}

const MODE_LABELS: Record<string, string> = {
  MEMBER: "Член участник",
  PPO_HEAD: "Председатель ППО",
  MPO_HEAD: "Председатель МПО",
  RPO_HEAD: "Региональный",
};

function getModeLabel(mode: string) {
  return MODE_LABELS[mode] || mode;
}

function ModeIcon({ mode }: { mode: string }) {
  if (mode === "MEMBER") {
    return (
      <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
      </svg>
    );
  }

  return (
    <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
    </svg>
  );
}

export default function ViewModeSwitch({ collapsed = false, serverViewModes = [], serverViewMode }: ViewModeSwitchProps) {
  const router = useRouter();
  const hasServerModes = serverViewModes.length > 1;
  const initialMode = serverViewMode && serverViewModes.some((m) => m.mode === serverViewMode)
    ? serverViewMode
    : serverViewModes[0]?.mode || "MEMBER";
  const [currentMode, setCurrentMode] = useState<string>(initialMode);
  const [availableModes, setAvailableModes] = useState<ViewModeOption[]>(
    serverViewModes.length > 0 ? serverViewModes : []
  );
  const [canSwitch, setCanSwitch] = useState(hasServerModes);
  const [isLoading, setIsLoading] = useState(!hasServerModes);
  const [isSwitching, setIsSwitching] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [retryCount, setRetryCount] = useState(0);
  const [mounted, setMounted] = useState(false);
  const loadTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const retryTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Wait for client-side mount to avoid hydration mismatch
  useEffect(() => {
    setMounted(true);
  }, []);

  // Загружаем сохраненные данные из localStorage (only on client)
  const loadStoredData = () => {
    if (typeof window === 'undefined') return null;
    try {
      const stored = localStorage.getItem('viewModeData');
      if (stored) {
        const data = JSON.parse(stored);
        // Используем сохраненные данные только если они не старше 5 минут
        if (data.timestamp && Date.now() - data.timestamp < 5 * 60 * 1000) {
          return data;
        }
      }
    } catch (error) {
      // Игнорируем ошибки парсинга
    }
    return null;
  };

  // Сохраняем данные в localStorage
  const saveStoredData = (data: { currentMode: string; availableModes: ViewModeOption[]; canSwitch: boolean }) => {
    try {
      localStorage.setItem('viewModeData', JSON.stringify({
        ...data,
        timestamp: Date.now(),
      }));
    } catch (error) {
      // Игнорируем ошибки сохранения (например, в приватном режиме)
    }
  };

  useEffect(() => {
    // Загружаем сохраненные данные сразу для немедленного отображения
    const storedData = loadStoredData();
    if (storedData) {
      setCurrentMode(storedData.currentMode);
      setAvailableModes(storedData.availableModes);
      setCanSwitch(storedData.canSwitch);
      // Если сохраненные данные старше 1 минуты, помечаем как загрузку для обновления
      if (storedData.timestamp && Date.now() - storedData.timestamp > 60 * 1000) {
        setIsLoading(true);
      }
    }
    
    // Затем загружаем актуальные данные
    loadViewMode();
    
    // Периодически обновляем данные (каждые 30 секунд), чтобы они не устаревали
    const refreshInterval = setInterval(() => {
      loadViewMode();
    }, 30000);
    
    // Очистка таймеров при размонтировании
    return () => {
      clearInterval(refreshInterval);
      if (loadTimeoutRef.current) {
        clearTimeout(loadTimeoutRef.current);
      }
      if (retryTimeoutRef.current) {
        clearTimeout(retryTimeoutRef.current);
      }
    };
  }, []);

  // Повторная загрузка при изменении retryCount (для повторных попыток)
  useEffect(() => {
    if (retryCount > 0 && retryCount <= 3) {
      retryTimeoutRef.current = setTimeout(() => {
        loadViewMode();
      }, 1000 * retryCount); // Экспоненциальная задержка: 1s, 2s, 3s
    }
  }, [retryCount]);

  const loadViewMode = async () => {
    try {
      setIsLoading(true);
      
      // Сначала загружаем сохраненные данные для немедленного отображения
      const storedData = loadStoredData();
      if (storedData && availableModes.length === 0) {
        setCurrentMode(storedData.currentMode);
        setAvailableModes(storedData.availableModes);
        setCanSwitch(storedData.canSwitch);
      }
      
      // Затем загружаем актуальные данные с сервера
      const data = await safeFetchJson<{ currentMode: string; availableModes: ViewModeOption[]; canSwitch: boolean }>("/api/user/view-mode", {
        ignoreServerErrors: true,
        logErrors: false,
      });
      
      if (data) {
        setCurrentMode(data.currentMode);
        setAvailableModes(data.availableModes);
        setCanSwitch(data.canSwitch);
        setRetryCount(0); // Сбрасываем счетчик при успешной загрузке
        // Сохраняем актуальные данные
        saveStoredData(data);
      } else {
        // Если данных нет, но есть сохраненные данные - используем их
        const storedData = loadStoredData();
        if (storedData) {
          setCurrentMode(storedData.currentMode);
          setAvailableModes(storedData.availableModes);
          setCanSwitch(storedData.canSwitch);
        }
        // Пытаемся загрузить снова
        if (retryCount < 3) {
          setRetryCount(prev => prev + 1);
        }
      }
    } catch (error) {
      // Только для критичных ошибок (не 503/500)
      if (process.env.NODE_ENV === 'development') {
        console.error("Error loading view mode:", error);
      }
      // Повторная попытка при ошибке
      if (retryCount < 3) {
        setRetryCount(prev => prev + 1);
      }
    } finally {
      // Устанавливаем минимальное время загрузки, чтобы избежать мерцания
      loadTimeoutRef.current = setTimeout(() => {
        setIsLoading(false);
      }, 300);
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
        const responseData = await response.json();
        // Обновляем локальное состояние с данными из ответа
        if (responseData.availableModes) {
          setAvailableModes(responseData.availableModes);
          setCanSwitch(responseData.canSwitch || responseData.availableModes.length > 1);
          // Сохраняем обновленные данные ПЕРЕД перезагрузкой страницы
          // Это гарантирует, что после перезагрузки переключатель не исчезнет
          saveStoredData({
            currentMode: responseData.currentMode || newMode,
            availableModes: responseData.availableModes,
            canSwitch: responseData.canSwitch || responseData.availableModes.length > 1,
          });
        }
        setCurrentMode(newMode);
        setIsOpen(false);
        // Небольшая задержка перед перезагрузкой, чтобы данные успели сохраниться
        setTimeout(() => {
        // Полная перезагрузка страницы с очисткой кеша и принудительным обновлением сессии
        window.location.replace("/dashboard?t=" + Date.now() + "&refresh=1");
        }, 100);
      } else {
        // Если переключение не удалось, перезагружаем данные
        await loadViewMode();
      }
    } catch (error) {
      console.error("Error switching view mode:", error);
      // При ошибке перезагружаем данные
      await loadViewMode();
    } finally {
      setIsSwitching(false);
    }
  };

  // Don't render anything until mounted (to avoid hydration mismatch with localStorage)
  if (!mounted) {
    return null;
  }

  // Показываем переключатель если:
  // 1. Есть более одного режима (основное условие)
  // 2. ИЛИ загрузка еще идет И есть сохраненные данные о нескольких режимах (оптимистичное отображение)
  // 3. ИЛИ идет переключение
  // Это предотвращает мерцание для обычных членов, у которых только один режим
  const hasModes = availableModes.length > 0;
  const hasMultipleModes = availableModes.length > 1;
  
  // Проверяем сохраненные данные для определения, может ли пользователь переключаться
  const storedData = loadStoredData();
  const hasStoredMultipleModes = storedData?.availableModes?.length > 1;
  const canSwitchFromStorage = storedData?.canSwitch === true;
  
  // ВАЖНО: Для обычных членов (только один режим) не показываем переключатель во время загрузки
  // Показываем переключатель только если:
  // - есть несколько режимов (основное условие) ИЛИ
  // - загрузка идет И есть сохраненные данные о нескольких режимах (не показываем для обычных членов) ИЛИ
  // - идет переключение ИЛИ
  // - есть сохраненные данные о том, что пользователь может переключаться (и это не первый рендер)
  const shouldShow = hasMultipleModes || 
                     (isLoading && hasStoredMultipleModes) || 
                     isSwitching || 
                     (hasStoredMultipleModes || (canSwitchFromStorage && hasModes));
  
  // Если нет режимов, загрузка завершена, нет сохраненных данных о нескольких режимах и не идет переключение - не показываем
  if (!shouldShow && !isLoading && !hasStoredMultipleModes && !canSwitchFromStorage) {
    return null;
  }
  
  // Если режимы еще не загружены, но мы знаем что пользователь может переключаться,
  // показываем переключатель с текущим режимом (оптимистичное отображение)
  // Используем сохраненные данные, если текущие данные еще не загружены
  const storedDataForDisplay = loadStoredData();
  const fallbackModes = storedDataForDisplay?.availableModes || 
    [{ mode: currentMode, label: getModeLabel(currentMode) }];
  
  const displayModes = availableModes.length > 0 ? availableModes : fallbackModes;
  
  // Можем переключаться если есть более одного режима
  const displayCanSwitch = displayModes.length > 1;

  const currentModeData = displayModes.find((m) => m.mode === currentMode);
  const otherMode = displayModes.find((m) => m.mode !== currentMode);

  // В стиле обычного пункта меню
  const icon = <ModeIcon mode={currentMode} />;

  if (collapsed) {
    // В свернутом режиме показываем переключатель если:
    // - есть другой режим ИЛИ
    // - загрузка идет И есть сохраненные данные о нескольких режимах ИЛИ
    // - идет переключение ИЛИ
    // - есть сохраненные данные о том, что пользователь может переключаться (и есть хотя бы один режим)
    const storedDataForCollapsed = loadStoredData();
    const hasStoredOtherMode = storedDataForCollapsed?.availableModes?.some(m => m.mode !== currentMode);
    const hasStoredMultipleModesCollapsed = storedDataForCollapsed?.availableModes?.length > 1;
    const shouldShowCollapsed = otherMode || 
                                (isLoading && hasStoredMultipleModesCollapsed) || 
                                isSwitching || 
                                hasStoredOtherMode ||
                                (storedDataForCollapsed?.canSwitch && hasModes);
    
    if (!shouldShowCollapsed) {
      return null;
    }
    
    // Используем сохраненные данные для определения другого режима, если текущие данные еще не загружены
    const effectiveOtherMode = otherMode || 
      (storedDataForCollapsed?.availableModes?.find(m => m.mode !== currentMode) || null);
    
    if (!effectiveOtherMode && !isLoading && !isSwitching) {
      return null;
    }
    return (
      <button
        onClick={() => effectiveOtherMode && handleSwitch(effectiveOtherMode.mode)}
        disabled={isSwitching || isLoading || !effectiveOtherMode}
        className="flex h-10 w-10 items-center justify-center rounded-lg text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700 transition-colors disabled:opacity-50"
        title={effectiveOtherMode ? `Переключить на: ${effectiveOtherMode.label}` : "Загрузка..."}
      >
        {isSwitching ? (
          <div className="h-4 w-4 animate-spin rounded-full border-2 border-gray-500 border-t-transparent" />
        ) : icon}
      </button>
    );
  }
  
  // В развернутом режиме показываем переключатель если:
  // - есть более одного режима ИЛИ
  // - загрузка еще идет И есть сохраненные данные о нескольких режимах ИЛИ
  // - идет переключение ИЛИ
  // - есть сохраненные данные о том, что пользователь может переключаться (и есть хотя бы один режим)
  const storedDataForExpanded = loadStoredData();
  const hasStoredMultipleModesExpanded = storedDataForExpanded?.availableModes?.length > 1;
  const shouldShowExpanded = displayModes.length > 1 || 
                             (isLoading && hasStoredMultipleModesExpanded) || 
                             isSwitching || 
                             (hasStoredMultipleModesExpanded || (storedDataForExpanded?.canSwitch && displayModes.length > 0));
  
  if (!shouldShowExpanded) {
    return null;
  }

  return (
    <div className="relative mb-2">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex w-full items-center gap-2.5 rounded-lg text-sm font-medium transition-colors px-2.5 py-2.5 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 hover:bg-blue-100 dark:hover:bg-blue-900/30 border border-blue-200 dark:border-blue-800"
      >
        <span className="flex-shrink-0">{icon}</span>
        <span className="flex-1 text-left">
          {`Режим: ${getModeLabel(currentMode)}`}
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
              {displayModes.map((mode) => (
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
                  <ModeIcon mode={mode.mode} />
                  <span className="flex-1 text-left">{mode.label || getModeLabel(mode.mode)}</span>
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

