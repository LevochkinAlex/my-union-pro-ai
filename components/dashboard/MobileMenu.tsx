"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { signOut } from "next-auth/react";
import { LogoIcon } from "@/components/Logo";
import ThemeToggle from "@/components/ThemeToggle";
import { useTour } from "@/components/dashboard/TourGuideProvider";
import { safeFetchJson } from "@/lib/safe-fetch";
import { withStableNavIconKey } from "@/lib/nav-icon";

interface NavItem {
  href: string;
  label: string;
  icon: React.ReactNode;
  subItems?: { href: string; label: string }[];
}

interface MobileMenuProps {
  isOpen: boolean;
  onClose: () => void;
  items: NavItem[];
  userInitial: string;
  avatarUrl?: string | null;
  isAdmin?: boolean;
  brandHref?: string;
  serverViewModes?: ViewModeOption[];
  serverViewMode?: string;
}

interface ViewModeOption {
  mode: string;
  label: string;
  organizationName?: string;
}

export default function MobileMenu({
  isOpen,
  onClose,
  items,
  userInitial,
  avatarUrl,
  isAdmin = false,
  brandHref,
  serverViewModes = [],
  serverViewMode,
}: MobileMenuProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { openTour } = useTour();
  const menuRef = useRef<HTMLDivElement>(null);
  const [expandedItems, setExpandedItems] = useState<string[]>([]);
  const [avatarError, setAvatarError] = useState(false);
  const prefersReducedMotion = useReducedMotion();

  const hasServerModes = serverViewModes.length > 1;
  const initialMode =
    serverViewMode && serverViewModes.some((m) => m.mode === serverViewMode)
      ? serverViewMode
      : serverViewModes[0]?.mode || "MEMBER";
  
  // Состояние для переключения режимов (с сервера — сразу видно переключатель)
  const [currentMode, setCurrentMode] = useState<string>(initialMode);
  const [availableModes, setAvailableModes] = useState<ViewModeOption[]>(
    serverViewModes.length > 0 ? serverViewModes : []
  );
  const [canSwitch, setCanSwitch] = useState(hasServerModes);
  const [isSwitching, setIsSwitching] = useState(false);
  const [isLoading, setIsLoading] = useState(!hasServerModes);
  const [retryCount, setRetryCount] = useState(0);
  const retryTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Загрузка режимов просмотра
  useEffect(() => {
    if (!isAdmin) {
      // Загружаем сохраненные данные сразу
      const storedData = loadStoredData();
      if (storedData) {
        setCurrentMode(storedData.currentMode);
        setAvailableModes(storedData.availableModes);
        setCanSwitch(storedData.canSwitch);
      }
      loadViewMode();
    }
    
    return () => {
      if (retryTimeoutRef.current) {
        clearTimeout(retryTimeoutRef.current);
      }
    };
  }, [isAdmin]);

  // Повторная загрузка при изменении retryCount
  useEffect(() => {
    if (retryCount > 0 && retryCount <= 3 && !isAdmin) {
      retryTimeoutRef.current = setTimeout(() => {
        loadViewMode();
      }, 1000 * retryCount);
    }
  }, [retryCount, isAdmin]);

  // Загружаем сохраненные данные из localStorage
  const loadStoredData = () => {
    try {
      const stored = localStorage.getItem('viewModeData');
      if (stored) {
        const data = JSON.parse(stored);
        if (data.timestamp && Date.now() - data.timestamp < 5 * 60 * 1000) {
          return data;
        }
      }
    } catch (error) {
      // Игнорируем ошибки
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
      // Игнорируем ошибки
    }
  };

  const loadViewMode = async () => {
    try {
      setIsLoading(true);
      
      // Сначала загружаем сохраненные данные
      const storedData = loadStoredData();
      if (storedData && availableModes.length === 0) {
        setCurrentMode(storedData.currentMode);
        setAvailableModes(storedData.availableModes);
        setCanSwitch(storedData.canSwitch);
      }
      
      const data = await safeFetchJson<{ currentMode: string; availableModes: ViewModeOption[]; canSwitch: boolean }>("/api/user/view-mode", {
        ignoreServerErrors: true,
        logErrors: false,
      });
      
      if (data) {
        setCurrentMode(data.currentMode);
        setAvailableModes(data.availableModes);
        setCanSwitch(data.canSwitch);
        setRetryCount(0);
        saveStoredData(data);
      } else {
        if (retryCount < 3) {
          setRetryCount(prev => prev + 1);
        }
      }
    } catch (error) {
      if (retryCount < 3) {
        setRetryCount(prev => prev + 1);
      }
    } finally {
      setTimeout(() => setIsLoading(false), 300);
    }
  };

  const handleModeSwitch = async (newMode: string) => {
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
          saveStoredData({
            currentMode: responseData.currentMode || newMode,
            availableModes: responseData.availableModes,
            canSwitch: responseData.canSwitch || responseData.availableModes.length > 1,
          });
        }
        setCurrentMode(newMode);
        onClose();
        // Полная перезагрузка страницы с очисткой кеша
        window.location.replace("/dashboard?t=" + Date.now() + "&refresh=1");
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

  // Сбрасываем ошибку аватара при изменении avatarUrl
  useEffect(() => {
    setAvatarError(false);
  }, [avatarUrl]);

  // Close menu when clicking outside
  useEffect(() => {
    if (!isOpen) {
      document.body.style.overflow = "unset";
      return;
    }

    // Prevent body scroll when menu is open
    document.body.style.overflow = "hidden";

    const handleClickOutside = (event: MouseEvent) => {
      // Проверяем, что клик был вне меню и не на кнопке открытия меню
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        const target = event.target as HTMLElement;
        // Не закрываем, если клик был на кнопке меню в header
        if (!target.closest('button[aria-label="Открыть меню"]')) {
          onClose();
        }
      }
    };

    // Используем небольшую задержку, чтобы избежать закрытия при открытии
    const timeoutId = setTimeout(() => {
      document.addEventListener("mousedown", handleClickOutside);
    }, 100);

    return () => {
      clearTimeout(timeoutId);
      document.removeEventListener("mousedown", handleClickOutside);
      document.body.style.overflow = "unset";
    };
  }, [isOpen, onClose]);

  // Close menu on route change
  useEffect(() => {
    if (isOpen) {
      onClose();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  // Close menu on Escape key
  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && isOpen) {
        onClose();
      }
    };

    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [isOpen, onClose]);

  const toggleExpanded = (href: string) => {
    setExpandedItems((prev) =>
      prev.includes(href)
        ? prev.filter((item) => item !== href)
        : [...prev, href]
    );
  };

  const isMainItemActive = (item: NavItem) => {
    if (item.href === "/dashboard") {
      return pathname === "/dashboard";
    }
    return pathname === item.href || pathname.startsWith(item.href + "/");
  };

  const isSubItemActive = (subItem: { href: string }) => {
    return pathname === subItem.href || pathname.startsWith(subItem.href + "/");
  };

  return (
    <>
      {/* Backdrop */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 md:hidden transition-opacity duration-300"
          onClick={onClose}
        />
      )}

      {/* Menu */}
      <div
        ref={menuRef}
        className={`fixed top-0 left-0 bottom-0 w-80 bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 z-50 overflow-y-auto md:hidden transform transition-transform duration-300 ease-in-out ${
          isOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex flex-col h-full">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-4 border-b border-gray-200 dark:border-gray-700">
            <Link
              href={brandHref || (isAdmin ? "/admin/dashboard" : "/dashboard")}
              prefetch={false}
              className="flex items-center gap-2"
              onClick={onClose}
            >
              <LogoIcon className="h-8 w-8" size="sm" />
              <span className="text-xl font-bold text-gray-900 dark:text-white">
                MyUnion
              </span>
            </Link>
            <button
              onClick={onClose}
              className="p-2 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
              aria-label="Закрыть меню"
            >
              <svg
                className="h-6 w-6"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          </div>

          {/* Navigation */}
          <nav className="flex-1 py-4 space-y-2 overflow-y-auto px-4">
            {/* View Mode Switch - вверху, сразу виден при открытии меню */}
            {!isAdmin && (availableModes.length > 1 || (isLoading && (availableModes.length > 0 || loadStoredData()?.availableModes?.length > 1))) && (
              <div className="mb-4 pb-4 border-b border-gray-200 dark:border-gray-700">
                <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2">Режим работы</p>
                <div className="space-y-1">
                  {availableModes.map((mode) => (
                    <button
                      key={mode.mode}
                      onClick={() => handleModeSwitch(mode.mode)}
                      disabled={isSwitching}
                      className={`w-full flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                        mode.mode === currentMode
                          ? "bg-blue-600 text-white"
                          : "bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600"
                      }`}
                    >
                      {mode.mode === "PPO_HEAD" || mode.mode === "RPO_HEAD" || mode.mode === "MPO_HEAD" ? (
                        <svg className="h-5 w-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                        </svg>
                      ) : (
                        <svg className="h-5 w-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                        </svg>
                      )}
                      <span className="flex-1 text-left">{mode.label}</span>
                      {mode.mode === currentMode && (
                        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                      )}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {/* Menu items - исключаем "Настройки" и "Профиль", они будут внизу */}
            {items.filter(item => item.href !== "/dashboard/settings" && item.href !== "/admin/settings" && item.href !== "/dashboard/profile").map((item) => {
              const itemKey = `${item.href}::${item.label}`;
              const isExpanded = expandedItems.includes(item.href);
              const hasSubItems = item.subItems && item.subItems.length > 0;
              const isActive = isMainItemActive(item);
              const hasActiveSubItem = hasSubItems
                ? item.subItems!.some((subItem) => isSubItemActive(subItem))
                : false;

              return (
                <div key={itemKey} className="space-y-1">
                  {hasSubItems ? (
                    <div className="contents">
                      <button
                        type="button"
                        aria-expanded={isExpanded}
                        onClick={() => toggleExpanded(item.href)}
                        className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                          isActive || hasActiveSubItem
                            ? "bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-400"
                            : "text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700"
                        }`}
                      >
                        {withStableNavIconKey(item.icon, item.href)}
                        <span className="flex-1 text-left">{item.label}</span>
                        <svg
                          className={`h-4 w-4 shrink-0 transition-transform duration-300 ease-out motion-reduce:transition-none ${
                            isExpanded ? "rotate-180" : ""
                          }`}
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                          aria-hidden
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M19 9l-7 7-7-7"
                          />
                        </svg>
                      </button>
                      <AnimatePresence initial={false}>
                        {isExpanded && (
                          <motion.div
                            key={`sub-${item.href}`}
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: "auto", opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            transition={
                              prefersReducedMotion
                                ? { duration: 0 }
                                : { duration: 0.28, ease: [0.4, 0, 0.2, 1] }
                            }
                            className="overflow-hidden"
                          >
                            <div className="ml-4 space-y-1 border-l border-gray-200 dark:border-gray-700 pl-4">
                              {item.subItems!.map((subItem) => {
                                const isSubActive = isSubItemActive(subItem);
                                return (
                                  <Link
                                    key={`${subItem.href}::${subItem.label}`}
                                    href={subItem.href}
                                    prefetch={false}
                                    onClick={onClose}
                                    className={`block rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                                      isSubActive
                                        ? "bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-400"
                                        : "text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700"
                                    }`}
                                  >
                                    {subItem.label}
                                  </Link>
                                );
                              })}
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  ) : (
                    <Link
                      href={item.href}
                      prefetch={false}
                      onClick={onClose}
                      className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                        isActive
                          ? "bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-400"
                          : "text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700"
                      }`}
                    >
                      {withStableNavIconKey(item.icon, item.href)}
                      {item.label}
                    </Link>
                  )}
                </div>
              );
            })}

            {/* Путеводитель по платформе */}
            {!isAdmin && (
              <div className="mt-2 pt-2 border-t border-gray-200 dark:border-gray-700">
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    openTour();
                  }}
                  className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700 transition-colors"
                >
                  <svg className="h-5 w-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                  </svg>
                  <span>Путеводитель</span>
                </button>
              </div>
            )}

          </nav>

          {/* User section */}
          <div className="border-t border-gray-200 dark:border-gray-700 p-4">
            <div className="flex items-center gap-2 mb-4">
              {/* Avatar with link */}
              <Link
                href={isAdmin ? "/admin/users" : "/dashboard/profile"}
                prefetch={false}
                onClick={onClose}
                className="h-10 w-10 rounded-full overflow-hidden bg-blue-600 flex items-center justify-center text-white font-semibold flex-shrink-0 hover:opacity-80 transition-opacity"
                title="Профиль"
              >
                {avatarUrl && !avatarError ? (
                  <img
                    key={avatarUrl}
                    src={avatarUrl}
                    alt={userInitial}
                    className="h-full w-full object-cover"
                    loading="lazy"
                    decoding="async"
                    crossOrigin="anonymous"
                    onLoad={() => {
                      setAvatarError(false);
                    }}
                    onError={() => {
                      setAvatarError(true);
                    }}
                  />
                ) : (
                  <span className="text-sm font-semibold">
                    {userInitial}
                  </span>
                )}
              </Link>
              
              {/* Settings icon */}
              {!isAdmin && (
                <Link
                  href="/dashboard/settings"
                  prefetch={false}
                  onClick={onClose}
                  className="h-10 w-10 rounded-full bg-gray-100 dark:bg-gray-700 flex items-center justify-center text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
                  title="Настройки"
                >
                  <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                    <g>
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    </g>
                  </svg>
                </Link>
              )}
              
              {/* Theme toggle */}
              <div className="ml-auto">
                <ThemeToggle />
              </div>
            </div>
            <button
              onClick={() => signOut({ callbackUrl: "/login" })}
              className="w-full flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-900/20 transition-colors"
            >
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
                  d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"
                />
              </svg>
              Выйти
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

