"use client";

import { useEffect, useState, useRef } from "react";
import QRCode from "qrcode";

declare global {
  interface Window {
    WebApp?: {
      initData: string;
      ready?: () => void;
    };
  }
}

/**
 * QR-код для входа через MAX с десктопа.
 * Если задан NEXT_PUBLIC_MAX_BOT_USERNAME — в QR диплинк max.ru/BotName?startapp (откроет MAX и мини-приложение).
 * Иначе — прямая ссылка на /auth/max; тогда важно открыть её именно в приложении MAX, а не в браузере.
 */
const MAX_BOT_USERNAME = typeof process.env.NEXT_PUBLIC_MAX_BOT_USERNAME === "string"
  ? process.env.NEXT_PUBLIC_MAX_BOT_USERNAME.trim()
  : "";

function AuthMaxQR() {
  const [dataUrl, setDataUrl] = useState<string | null>(null);
  useEffect(() => {
    const url = MAX_BOT_USERNAME
      ? `https://max.ru/${MAX_BOT_USERNAME}?startapp`
      : (typeof window !== "undefined"
          ? `${window.location.origin}/auth/max`
          : "https://myunion.pro/auth/max");
    QRCode.toDataURL(url, { width: 220, margin: 2 }).then(setDataUrl).catch(() => {});
  }, []);
  if (!dataUrl) return null;
  return (
    <div className="mb-6 flex flex-col items-center">
      <p className="mb-3 text-sm text-gray-500 dark:text-gray-400">
        Отсканируйте камерой телефона. Ссылка должна открыться в приложении MAX — тогда войдёте автоматически.
      </p>
      <img src={dataUrl} alt="QR-код для входа через MAX" className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white p-2" width={220} height={220} />
      {!MAX_BOT_USERNAME && (
        <p className="mt-3 max-w-xs text-xs text-amber-600 dark:text-amber-400">
          Если открылось в браузере — авторизация не сработает. Откройте приложение MAX и нажмите кнопку под чатом с ботом МойСоюз.
        </p>
      )}
    </div>
  );
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
    const openInMaxUrl = MAX_BOT_USERNAME
      ? `https://max.ru/${MAX_BOT_USERNAME}?startapp`
      : "https://max.ru";

    return (
      <div className="flex flex-col items-center justify-center min-h-screen px-4 text-center">
        <h1 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
          Вход через MAX
        </h1>
        <p className="text-gray-600 dark:text-gray-400 mb-4">
          Откройте это приложение в мессенджере MAX (кнопка под чатом с ботом МойСоюз).
        </p>
        <a
          href={openInMaxUrl}
          className="mb-6 w-full max-w-xs px-4 py-3 rounded-lg bg-gray-800 hover:bg-gray-700 dark:bg-gray-700 dark:hover:bg-gray-600 text-white font-medium"
        >
          Открыть в MAX
        </a>
        <AuthMaxQR />
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
