"use client";

import { useState, useEffect, useCallback } from "react";

/**
 * Хук для получения корректной высоты viewport с учетом виртуальной клавиатуры
 * Работает кроссплатформенно: iOS Safari, Android Chrome, Яндекс.Браузер и др.
 */
export function useViewportHeight() {
  const [viewportHeight, setViewportHeight] = useState<number | null>(null);
  const [keyboardVisible, setKeyboardVisible] = useState(false);

  const updateHeight = useCallback(() => {
    if (typeof window === "undefined") return;

    // Используем visualViewport если доступен (лучшая поддержка клавиатуры)
    if (window.visualViewport) {
      setViewportHeight(window.visualViewport.height);
      // Проверяем, видна ли клавиатура (viewport меньше окна)
      setKeyboardVisible(window.visualViewport.height < window.innerHeight * 0.8);
    } else {
      // Fallback для старых браузеров
      setViewportHeight(window.innerHeight);
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;

    // Начальная установка
    updateHeight();

    // Слушаем изменения visualViewport (появление/скрытие клавиатуры)
    if (window.visualViewport) {
      window.visualViewport.addEventListener("resize", updateHeight);
      window.visualViewport.addEventListener("scroll", updateHeight);
    }

    // Fallback: слушаем resize окна
    window.addEventListener("resize", updateHeight);
    window.addEventListener("orientationchange", updateHeight);

    // Дополнительно: focus/blur на input для определения клавиатуры
    const handleFocus = () => {
      // Небольшая задержка для анимации клавиатуры
      setTimeout(updateHeight, 300);
    };

    document.addEventListener("focusin", handleFocus);
    document.addEventListener("focusout", handleFocus);

    return () => {
      if (window.visualViewport) {
        window.visualViewport.removeEventListener("resize", updateHeight);
        window.visualViewport.removeEventListener("scroll", updateHeight);
      }
      window.removeEventListener("resize", updateHeight);
      window.removeEventListener("orientationchange", updateHeight);
      document.removeEventListener("focusin", handleFocus);
      document.removeEventListener("focusout", handleFocus);
    };
  }, [updateHeight]);

  return { viewportHeight, keyboardVisible };
}

