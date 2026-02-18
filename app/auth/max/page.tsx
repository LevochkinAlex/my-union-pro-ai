"use client";

import { useEffect, useState, useRef } from "react";

declare global {
  interface Window {
    WebApp?: {
      initData: string;
      ready?: () => void;
    };
  }
}

const DETECT_TIMEOUT_MS = 3000;

/**
 * Точка входа мини-приложения MAX.
 * MAX-клиент инжектирует window.WebApp с initData в WebView.
 * Если initData не появляется за 3 сек — значит, открыто вне MAX.
 */
export default function AuthMaxPage() {
  const [status, setStatus] = useState<"loading" | "sending" | "done" | "error" | "no_webapp">("loading");
  const [errorMessage, setErrorMessage] = useState("");
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;

    const tryAuth = () => {
      const wa = window.WebApp;
      if (!wa?.initData) return false;

      wa.ready?.();
      setStatus("sending");

      fetch("/api/auth/max/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ initData: wa.initData }),
      })
        .then((r) => r.json())
        .then((data) => {
          if (data?.redirectUrl) {
            setStatus("done");
            window.location.href = data.redirectUrl;
          } else {
            setStatus("error");
            setErrorMessage(data?.error || "Ошибка верификации");
          }
        })
        .catch(() => {
          setStatus("error");
          setErrorMessage("Ошибка соединения с сервером");
        });

      return true;
    };

    if (tryAuth()) return;

    const poll = setInterval(() => {
      if (window.WebApp?.initData) {
        clearInterval(poll);
        clearTimeout(timeout);
        tryAuth();
      }
    }, 150);

    const timeout = setTimeout(() => {
      clearInterval(poll);
      setStatus("no_webapp");
    }, DETECT_TIMEOUT_MS);

    return () => {
      clearInterval(poll);
      clearTimeout(timeout);
    };
  }, []);

  if (status === "no_webapp") {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen px-4 text-center">
        <h1 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
          Вход через MAX
        </h1>
        <p className="text-gray-600 dark:text-gray-400 mb-4">
          Откройте это приложение в мессенджере MAX (кнопка под чатом с ботом МойСоюз).
        </p>
        <a href="/login" className="text-blue-600 dark:text-blue-400 hover:underline mb-2">
          Вернуться на страницу входа
        </a>
        <a
          href="https://max.ru"
          target="_blank"
          rel="noopener noreferrer"
          className="text-sm text-gray-500 dark:text-gray-500 hover:underline"
        >
          Скачать MAX
        </a>
      </div>
    );
  }

  if (status === "error") {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen px-4 text-center">
        <h1 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
          Ошибка входа
        </h1>
        <p className="text-red-600 dark:text-red-400 mb-4">{errorMessage}</p>
        <a href="/login" className="text-blue-600 dark:text-blue-400 hover:underline">
          На страницу входа
        </a>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-screen px-4">
      <div className="animate-pulse text-gray-600 dark:text-gray-400">
        {status === "sending" ? "Вход в МойСоюз…" : "Загрузка…"}
      </div>
    </div>
  );
}
