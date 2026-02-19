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

const DETECT_TIMEOUT_MS = 8000;
const POLL_INTERVAL_MS = 100;
const BRIDGE_WAIT_MS = 2500;
// В business.max.ru → Чат-бот и мини-приложение → URL мини-приложения должен быть ровно https://myunion.pro/auth/max

export default function AuthMaxPage() {
  const [status, setStatus] = useState<
    "loading" | "bridge_loading" | "sending" | "done" | "error" | "no_webapp"
  >("bridge_loading");
  const [errorMessage, setErrorMessage] = useState("");
  const ran = useRef(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | undefined>(undefined);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

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
    setStatus("loading");
    startPolling();
  }, [startPolling]);

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
    if (typeof window !== "undefined" && window.WebApp) {
      startPolling();
    }
  }, [startPolling]);

  const handleBridgeError = useCallback(() => {
    // В обычном браузере cdn.max.ru часто недоступен — не засоряем консоль
    if (!ran.current) {
      startPolling();
    }
  }, [startPolling]);

  const [shouldLoadBridge, setShouldLoadBridge] = useState<boolean | null>(null);
  const [isWebMax, setIsWebMax] = useState(false);

  // Определяем окружение: web.max.ru (браузер) vs мобильное приложение MAX vs обычный браузер
  useEffect(() => {
    if (typeof document === "undefined") return;
    const ref = document.referrer || "";
    const inIframe = window.self !== window.top;
    const fromMaxDomain = ref.includes("max.ru");
    const fromWebMax = ref.includes("web.max.ru");

    if (fromWebMax) {
      // web.max.ru — мини-приложение в браузерной версии MAX, bridge не работает
      setIsWebMax(true);
      setShouldLoadBridge(false);
      const t = setTimeout(() => {
        if (!ran.current) {
          ran.current = true;
          setStatus("no_webapp");
        }
      }, 500);
      return () => clearTimeout(t);
    }

    const likelyMobileMax = (fromMaxDomain && !fromWebMax) || inIframe;
    setShouldLoadBridge(likelyMobileMax);

    if (!likelyMobileMax) {
      const t = setTimeout(() => {
        if (!ran.current) {
          ran.current = true;
          setStatus("no_webapp");
        }
      }, 1200);
      return () => clearTimeout(t);
    }
  }, []);

  // Если Bridge долго не загрузился — всё равно начинаем опрос (MAX мог инжектить WebApp до скрипта)
  useEffect(() => {
    if (shouldLoadBridge !== true) return;
    const t = setTimeout(() => {
      if (!ran.current && typeof window !== "undefined" && window.WebApp) {
        startPolling();
      }
    }, BRIDGE_WAIT_MS);
    return () => clearTimeout(t);
  }, [startPolling, shouldLoadBridge]);

  // Если уже залогинен — сразу в личный кабинет (редирект обратно в мини-приложении)
  useEffect(() => {
    getSession().then((session) => {
      if (session?.user) {
        window.location.replace("/dashboard");
      }
    });
  }, []);

  if (status === "no_webapp") {
    const botUrl = MAX_BOT_USERNAME
      ? `https://max.ru/${MAX_BOT_USERNAME}`
      : "https://max.ru";
    const openInMaxUrl = MAX_BOT_USERNAME
      ? `https://max.ru/${MAX_BOT_USERNAME}?startapp`
      : "https://max.ru";

    // Пользователь в web.max.ru — показываем чистый экран без QR и красных предупреждений
    if (isWebMax) {
      return (
        <div className="flex flex-col items-center justify-center min-h-screen px-4 text-center">
          <div className="w-full max-w-sm">
            <div className="mb-6">
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gray-100 dark:bg-gray-800 mb-4">
                <svg className="w-8 h-8 text-gray-600 dark:text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                </svg>
              </div>
              <h1 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
                Вход в МойСоюз
              </h1>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Автоматический вход работает только в мобильном приложении MAX.
                <br />
                Войдите одним из способов ниже:
              </p>
            </div>

            <div className="flex flex-col gap-3">
              <a
                href={botUrl}
                className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-lg bg-gray-800 hover:bg-gray-700 text-white font-medium transition-colors"
              >
                Написать /login боту
              </a>

              <a
                href="/login"
                className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-medium transition-colors"
              >
                Войти по номеру телефона
              </a>

              <div className="relative my-2">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-gray-200 dark:border-gray-700" />
                </div>
                <div className="relative flex justify-center text-xs">
                  <span className="bg-gray-50 dark:bg-gray-900 px-2 text-gray-400">или</span>
                </div>
              </div>

              <a
                href="https://t.me/myunionpro_bot?start=login"
                target="_blank"
                rel="noopener noreferrer"
                className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors text-sm"
              >
                Войти через Telegram
              </a>

              <a
                href="/api/auth/vk-id"
                className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors text-sm"
              >
                Войти с VK ID
              </a>
            </div>

            <p className="mt-6 text-xs text-gray-400 dark:text-gray-500">
              Бот пришлёт ссылку для входа в личный кабинет — как в Telegram.
            </p>
          </div>
        </div>
      );
    }

    // Обычный браузер (не из MAX) — QR + инструкции
    return (
      <div className="flex flex-col items-center justify-center min-h-screen px-4 text-center">
        <div className="w-full max-w-sm">
          <h1 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
            Вход через MAX
          </h1>
          <p className="text-gray-600 dark:text-gray-400 mb-4 text-sm">
            Откройте бота «Мой Союз» в мобильном приложении MAX и нажмите кнопку «Открыть» под чатом.
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
        <a
          href="/login"
          className="text-blue-600 dark:text-blue-400 hover:underline"
        >
          На страницу входа
        </a>
      </div>
    );
  }

  // Пока определяем, загружать ли Bridge — показываем загрузку
  if (shouldLoadBridge === null) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen px-4">
        <div className="animate-pulse text-gray-600 dark:text-gray-400">
          Проверка авторизации…
        </div>
      </div>
    );
  }

  return (
    <>
      {shouldLoadBridge === true && (
        <Script
          src="https://cdn.max.ru/js/max-web-app.js"
          strategy="afterInteractive"
          onLoad={handleBridgeLoad}
          onError={handleBridgeError}
        />
      )}
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
