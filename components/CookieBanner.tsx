"use client";

import { useState, useEffect } from "react";
import Link from "next/link";

const COOKIE_KEY = "myunion-cookie-consent";

export default function CookieBanner() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    try {
      if (!localStorage.getItem(COOKIE_KEY)) {
        setVisible(true);
      }
    } catch {
      /* private browsing */
    }
  }, []);

  function accept() {
    try {
      localStorage.setItem(COOKIE_KEY, "1");
    } catch {
      /* noop */
    }
    setVisible(false);
  }

  if (!visible) return null;

  return (
    <div className="fixed bottom-0 inset-x-0 z-[9999] p-4 pointer-events-none">
      <div className="pointer-events-auto mx-auto max-w-2xl rounded-2xl border border-gray-200 bg-white/95 p-4 shadow-lg backdrop-blur-md dark:border-gray-700 dark:bg-gray-900/95 sm:flex sm:items-center sm:gap-4">
        <p className="text-sm text-gray-600 dark:text-gray-300 sm:flex-1">
          Мы используем файлы cookie и локальное хранилище для корректной работы
          авторизации, сохранения настроек и улучшения качества сервиса.
          Продолжая пользоваться сайтом, вы соглашаетесь с{" "}
          <Link
            href="/privacy"
            className="font-medium text-blue-600 hover:underline dark:text-blue-400"
          >
            Политикой конфиденциальности
          </Link>
          .
        </p>
        <button
          type="button"
          onClick={accept}
          className="mt-3 w-full shrink-0 rounded-lg bg-blue-600 px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 sm:mt-0 sm:w-auto"
        >
          Принять
        </button>
      </div>
    </div>
  );
}
