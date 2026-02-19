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

// ---------------------------------------------------------------------------
// Собственный fallback-парсер initData из URL.
// MAX передаёт стартовые параметры в hash-фрагменте URL (аналогично Telegram):
//   #WebAppData=<url-encoded>&WebAppVersion=25.9.16&WebAppPlatform=web
// Если bridge-скрипт cdn.max.ru не загрузился, парсим сами.
// ---------------------------------------------------------------------------
function tryCreateWebAppFromUrl(): boolean {
  if (window.WebApp?.initData) return true;

  const hash = window.location.hash?.slice(1) || "";
  const search = window.location.search?.slice(1) || "";

  for (const source of [hash, search]) {
    if (!source) continue;
    const params = new URLSearchParams(source);

    const raw =
      params.get("WebAppData") ||
      params.get("tgWebAppData") ||
      params.get("initData");
    if (!raw) continue;

    const initData = decodeURIComponent(raw);
    const version =
      params.get("WebAppVersion") ||
      params.get("tgWebAppVersion") ||
      "";
    const platform =
      params.get("WebAppPlatform") ||
      params.get("tgWebAppPlatform") ||
      "web";

    const dp = new URLSearchParams(initData);
    let user = undefined;
    try {
      const u = dp.get("user");
      if (u) user = JSON.parse(decodeURIComponent(u));
    } catch { /* ignored */ }

    window.WebApp = {
      initData,
      initDataUnsafe: {
        query_id: dp.get("query_id") || undefined,
        auth_date: dp.get("auth_date")
          ? parseInt(dp.get("auth_date")!, 10)
          : undefined,
        hash: dp.get("hash") || undefined,
        start_param: dp.get("start_param") || undefined,
        user,
      },
      platform,
      version,
      ready: () => {},
      close: () => {
        try { window.close(); } catch { /* ignored */ }
      },
    };

    return true;
  }

  return false;
}

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
        Отсканируйте QR камерой телефона — откроется бот в MAX.
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

const DETECT_TIMEOUT_MS = 6000;
const POLL_INTERVAL_MS = 150;

export default function AuthMaxPage() {
  const [status, setStatus] = useState<
    "detecting" | "sending" | "done" | "error" | "no_webapp"
  >("detecting");
  const [errorMessage, setErrorMessage] = useState("");
  const [debugInfo, setDebugInfo] = useState("");
  const ran = useRef(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | undefined>(undefined);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const tryAuth = useCallback(() => {
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
  }, []);

  const startDetection = useCallback(() => {
    if (ran.current) return;
    ran.current = true;

    // 1. Если WebApp уже есть (инжект от нативного приложения)
    if (tryAuth()) return;

    // 2. Пробуем распарсить из URL (fallback без CDN-bridge)
    if (tryCreateWebAppFromUrl() && tryAuth()) return;

    // 3. Поллим — может bridge или нативный клиент установит WebApp с задержкой
    setStatus("detecting");

    pollRef.current = setInterval(() => {
      if (window.WebApp?.initData || tryCreateWebAppFromUrl()) {
        clearInterval(pollRef.current);
        clearTimeout(timeoutRef.current);
        tryAuth();
      }
    }, POLL_INTERVAL_MS);

    timeoutRef.current = setTimeout(() => {
      clearInterval(pollRef.current);
      // Последняя попытка
      if (tryCreateWebAppFromUrl() && tryAuth()) return;
      if (!tryAuth()) {
        // Собираем диагностику
        const diag = [
          `hash: ${window.location.hash?.slice(0, 200) || "(empty)"}`,
          `search: ${window.location.search?.slice(0, 200) || "(empty)"}`,
          `referrer: ${document.referrer || "(none)"}`,
          `WebApp: ${window.WebApp ? "exists" : "null"}`,
          `initData: ${window.WebApp?.initData ? "yes" : "no"}`,
          `platform: ${window.WebApp?.platform || "n/a"}`,
        ].join("\n");
        setDebugInfo(diag);
        setStatus("no_webapp");
      }
    }, DETECT_TIMEOUT_MS);
  }, [tryAuth]);

  const retryDetection = useCallback(() => {
    clearInterval(pollRef.current);
    clearTimeout(timeoutRef.current);
    pollRef.current = undefined;
    timeoutRef.current = undefined;
    ran.current = false;
    setStatus("detecting");
    startDetection();
  }, [startDetection]);

  // Запуск при монтировании
  useEffect(() => {
    // Даём немного времени нативному клиенту MAX инжектировать WebApp
    const t = setTimeout(() => {
      startDetection();
    }, 300);
    return () => {
      clearTimeout(t);
      clearInterval(pollRef.current);
      clearTimeout(timeoutRef.current);
    };
  }, [startDetection]);

  // Также пробуем загрузить bridge с CDN (может заработать)
  const handleBridgeLoad = useCallback(() => {
    if (window.WebApp && !ran.current) {
      startDetection();
    } else if (window.WebApp?.initData && status === "detecting") {
      tryAuth();
    }
  }, [startDetection, tryAuth, status]);

  const handleBridgeError = useCallback(() => {
    // CDN недоступен — ничего не делаем, fallback уже работает
  }, []);

  // Если уже залогинен — сразу в ЛК
  useEffect(() => {
    getSession().then((session) => {
      if (session?.user) {
        window.location.replace("/dashboard");
      }
    });
  }, []);

  // ---- РЕНДЕР ----

  if (status === "no_webapp") {
    const botUrl = MAX_BOT_USERNAME
      ? `https://max.ru/${MAX_BOT_USERNAME}`
      : "https://max.ru";
    const openInMaxUrl = MAX_BOT_USERNAME
      ? `https://max.ru/${MAX_BOT_USERNAME}?startapp`
      : "https://max.ru";
    const ref = typeof document !== "undefined" ? document.referrer || "" : "";
    const fromMax = ref.includes("max.ru");

    if (fromMax) {
      // Открыто из MAX (web или мобильное) — initData нет → сразу на страницу входа
      if (typeof window !== "undefined") {
        window.location.replace("/login?from=max");
      }
      return (
        <div className="flex flex-col items-center justify-center min-h-screen px-4">
          <div className="animate-pulse text-gray-600 dark:text-gray-400">
            Перенаправление на вход…
          </div>
        </div>
      );
    }

    // Обычный браузер (не из MAX)
    return (
      <div className="flex flex-col items-center justify-center min-h-screen px-4 text-center">
        <div className="w-full max-w-sm">
          <h1 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
            Вход через MAX
          </h1>
          <p className="text-gray-600 dark:text-gray-400 mb-4 text-sm">
            Откройте бота «Мой Союз» в мобильном приложении MAX и нажмите «Открыть».
          </p>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
            Или отправьте боту <strong>/login</strong> — получите ссылку для входа.
          </p>

          <a
            href={openInMaxUrl}
            className="mb-4 inline-flex items-center justify-center w-full px-4 py-3 rounded-lg bg-gray-800 hover:bg-gray-700 text-white font-medium transition-colors"
          >
            Открыть бота в MAX
          </a>

          <button
            type="button"
            onClick={retryDetection}
            className="mb-6 w-full px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors text-sm"
          >
            Попробовать снова
          </button>

          <AuthMaxQR />

          <div className="mt-4 flex flex-col items-center gap-2">
            <a
              href="/login"
              className="text-sm text-blue-600 dark:text-blue-400 hover:underline"
            >
              Войти другим способом
            </a>
            <a
              href="https://max.ru"
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-gray-400 dark:text-gray-500 hover:underline"
            >
              Скачать MAX
            </a>
          </div>

          {debugInfo && (
            <details className="mt-4 text-left">
              <summary className="text-xs text-gray-400 cursor-pointer">
                Диагностика
              </summary>
              <pre className="mt-2 text-[10px] text-gray-400 bg-gray-100 dark:bg-gray-800 p-2 rounded overflow-x-auto whitespace-pre-wrap break-all">
                {debugInfo}
              </pre>
            </details>
          )}
        </div>
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
      {/* CDN bridge — попытка, может заработать */}
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
            : status === "done"
              ? "Перенаправление…"
              : "Проверка авторизации…"}
        </div>
      </div>
    </>
  );
}
