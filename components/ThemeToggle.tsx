"use client";

import { useTheme } from "next-themes";
import { useEffect, useState } from "react";

interface ThemeToggleProps {
  collapsed?: boolean;
}

export default function ThemeToggle({ collapsed = false }: ThemeToggleProps) {
  const { theme, setTheme, resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    console.log('[ThemeToggle] Theme changed:', { theme, resolvedTheme });
  }, [theme, resolvedTheme]);

  const handleToggle = () => {
    if (!setTheme) {
      console.error('[ThemeToggle] setTheme is not available');
      return;
    }
    
    // Используем resolvedTheme для определения текущей темы
    const currentTheme = resolvedTheme || theme;
    
    // Если тема "system", определяем по классу на html
    let actualTheme = currentTheme;
    if (currentTheme === "system" || !currentTheme) {
      actualTheme = document.documentElement.classList.contains("dark") ? "dark" : "light";
    }
    
    const newTheme = actualTheme === "dark" ? "light" : "dark";
    
    console.log('[ThemeToggle] Toggling theme:', { currentTheme, actualTheme, newTheme, theme, resolvedTheme });
    
    // Явно устанавливаем тему, не "system"
    setTheme(newTheme);
  };

  if (typeof window === 'undefined' || !mounted) {
    return (
      <div className="h-9 w-9 rounded-full bg-gray-200 dark:bg-gray-700" />
    );
  }

  const currentTheme = resolvedTheme || theme;
  const isDark = currentTheme === "dark";

  return (
    <button
      onClick={handleToggle}
      className="flex h-9 w-9 items-center justify-center rounded-full bg-gray-200 text-gray-700 shadow-sm hover:bg-gray-300 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600 transition-colors"
      aria-label="Toggle theme"
      title={collapsed ? (isDark ? "Светлая тема" : "Темная тема") : undefined}
      type="button"
    >
      {isDark ? (
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
            d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z"
          />
        </svg>
      ) : (
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
            d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z"
          />
        </svg>
      )}
    </button>
  );
}

