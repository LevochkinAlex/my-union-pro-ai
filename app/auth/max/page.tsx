"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import Script from "next/script";
import QRCode from "qrcode";
import { getSession } from "next-auth/react";

declare global {
  interface Window {
    WebApp?: {
      initData: string;
      initDataUnsafe?: {
        query_id?: string;
        auth_date?: number;
        hash?: string;
        start_param?: string;
        user?: {
          id: number;
          first_name?: string;
          last_name?: string;
          username?: string;
          language_code?: string;
          photo_url?: string;
        };
      };
      platform?: string;
      version?: string;
      ready?: () => void;
      close?: () => void;
    };
  }
}

const MAX_BOT_USERNAME =
  typeof process.env.NEXT_PUBLIC_MAX_BOT_USERNAME === "string"
    ? process.env.NEXT_PUBLIC_MAX_BOT_USERNAME.trim()
    : "";

function AuthMaxQR() {
  const [dataUrl, setDataUrl] = useState<string | null>(null);
  useEffect(() => {
    const url = MAX_BOT_USERNAME
      ? `https://max.ru/${MAX_BOT_USERNAME}?startapp`
      : typeof window !== "undefined"
        ? `${window.location.origin}/auth/max`
        : "https://myunion.pro/auth/max";
    QRCode.toDataURL(url, { width: 220, margin: 2 })
      .then(setDataUrl)
      .catch(() => {});
  }, []);
  if (!dataUrl) return null;
  return (
    <div className="mb-6 flex flex-col items-center">
      <p className="mb-3 text-sm text-gray-500 dark:text-gray-400">
        Отсканируйте QR камерой телефона — откроется бот в MAX и авторизация произойдёт автоматически.
      </p>
      <img
        src={dataUrl}
        alt="QR-код для входа через MAX"
        className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white p-2"
        width={220}
        height={220}
      />
    </div>
  );
}

const DETECT_TIMEOUT_MS = 5000;
const POLL_INTERVAL_MS = 100;

export default function AuthMaxPage() {
  const [status, setStatus] = useState<
    "loading" | "bridge_loading" | "sending" | "done" | "error" | "no_webapp"
  >("bridge_loading");
  const [errorMessage, setErrorMessage] = useState("");
  const ran = useRef(false);
  const pollRef = useRef<ReturnType<typeof setInterval>>();
  const timeoutRef = useRef<ReturnType<typeof setTimeout>>();

  const tryAuth = useCallback(() => {
    const wa = window.WebApp;
    if (!wa?.initData) return false;

    console.log("[MAX Auth] initData found, platform:", wa.platform, "version:", wa.version);
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
  }, []);

  const startPolling = useCallback(() => {
    if (ran.current) return;
    ran.current = true;

    if (tryAuth()) return;

    setStatus("loading");

    pollRef.current = setInterval(() => {
      if (window.WebApp?.initData) {
        clearInterval(pollRef.current);
        clearTimeout(timeoutRef.current);
        tryAuth();
      }
    }, POLL_INTERVAL_MS);

    timeoutRef.current = setTimeout(() => {
      clearInterval(pollRef.current);
      if (!tryAuth()) {
        console.log("[MAX Auth] No initData after timeout — not inside MAX WebView");
        setStatus("no_webapp");
      }
    }, DETECT_TIMEOUT_MS);
  }, [tryAuth]);

  useEffect(() => {
    if (window.WebApp) {
      startPolling();
    }
    return () => {
      clearInterval(pollRef.current);
      clearTimeout(timeoutRef.current);
    };
  }, [startPolling]);

  const handleBridgeLoad = useCallback(() => {
    console.log("[MAX Auth] MAX Bridge script loaded, WebApp:", !!window.WebApp);
    startPolling();
  }, [startPolling]);

  const handleBridgeError = useCallback(() => {
    console.warn("[MAX Auth] MAX Bridge script failed to load");
    if (!ran.current) {
      startPolling();
    }
  }, [startPolling]);

  // Если уже залогинен — сразу в личный кабинет (редирект обратно в мини-приложении)
  useEffect(() => {
    getSession().then((session) => {
      if (session?.user) {
        window.location.replace("/dashboard");
      }
    });
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
        <p className="text-gray-600 dark:text-gray-400 mb-4 max-w-sm">
          Для авторизации откройте бота «Мой Союз» в мессенджере MAX
          и&nbsp;нажмите кнопку внизу чата.
        </p>
        <a
          href={openInMaxUrl}
          className="mb-6 inline-flex items-center justify-center w-full max-w-xs px-4 py-3 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-medium transition-colors"
        >
          Открыть бота в MAX
        </a>
        <AuthMaxQR />
        <a
          href="/login"
          className="text-blue-600 dark:text-blue-400 hover:underline mb-2"
        >
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
        <a
          href="/login"
          className="text-blue-600 dark:text-blue-400 hover:underline"
        >
          На страницу входа
        </a>
      </div>
    );
  }

  return (
    <>
      <Script
        src="https://cdn.max.ru/js/max-web-app.js"
        strategy="afterInteractive"
        onLoad={handleBridgeLoad}
        onError={handleBridgeError}
      />
      <div className="flex flex-col items-center justify-center min-h-screen px-4">
        <div className="animate-pulse text-gray-600 dark:text-gray-400">
          {status === "sending"
            ? "Вход в МойСоюз…"
            : status === "bridge_loading"
              ? "Подключение к MAX…"
              : "Проверка авторизации…"}
        </div>
      </div>
    </>
  );
}
