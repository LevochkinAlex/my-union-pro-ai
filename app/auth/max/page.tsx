"use client";

import { useEffect, useState } from "react";
import Script from "next/script";

declare global {
  interface Window {
    WebApp?: {
      initData: string;
      ready?: () => void;
    };
  }
}

const MAX_BRIDGE_SCRIPT = "https://max.ru/max-web-app.js";

/**
 * Точка входа мини-приложения MAX.
 * Загружает MAX Bridge, читает initData, отправляет на верификацию и редиректит на success.
 * В настройках бота укажите URL: https://myunion.pro/auth/max (или ваш домен).
 */
export default function AuthMaxPage() {
  const [status, setStatus] = useState<"loading" | "sending" | "done" | "error" | "no_webapp">("loading");
  const [errorMessage, setErrorMessage] = useState<string>("");

  useEffect(() => {
    if (status !== "loading" || typeof window === "undefined") return;

    const run = () => {
      const WebApp = window.WebApp;
      if (!WebApp?.initData) {
        setStatus("no_webapp");
        return;
      }

      setStatus("sending");
      fetch("/api/auth/max/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ initData: WebApp.initData }),
      })
        .then((res) => res.json())
        .then((data) => {
          if (data?.redirectUrl) {
            setStatus("done");
            window.location.href = data.redirectUrl;
          } else {
            setStatus("error");
            setErrorMessage(data?.error || "Ошибка верификации");
          }
        })
        .catch((err) => {
          console.error("[MAX Auth] Ошибка запроса:", err);
          setStatus("error");
          setErrorMessage("Ошибка соединения с сервером");
        });
    };

    if (window.WebApp?.initData) {
      run();
    } else {
      const t = setInterval(() => {
        if (window.WebApp?.initData) {
          clearInterval(t);
          run();
        }
      }, 100);
      return () => clearInterval(t);
    }
  }, [status]);

  if (status === "no_webapp") {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen px-4 text-center">
        <h1 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
          Вход через MAX
        </h1>
        <p className="text-gray-600 dark:text-gray-400 mb-4">
          Откройте это приложение в мессенджере MAX (кнопка под чатом с ботом МойСоюз).
        </p>
        <a
          href="https://max.ru"
          target="_blank"
          rel="noopener noreferrer"
          className="text-blue-600 dark:text-blue-400 hover:underline"
        >
          Перейти в MAX
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
    <>
      <Script
        src={MAX_BRIDGE_SCRIPT}
        strategy="beforeInteractive"
        onLoad={() => {
          window.WebApp?.ready?.();
        }}
      />
      <div className="flex flex-col items-center justify-center min-h-screen px-4">
        <div className="animate-pulse text-gray-600 dark:text-gray-400">
          {status === "sending" ? "Вход в МойСоюз…" : "Загрузка…"}
        </div>
      </div>
    </>
  );
}
