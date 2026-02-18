"use client";

import { useEffect, useState } from "react";

const MAX_APP_STORE = "https://apps.apple.com/ru/app/max-%D0%BE%D0%B1%D1%89%D0%B5%D0%BD%D0%B8%D0%B5-%D0%B7%D0%B2%D0%BE%D0%BD%D0%BA%D0%B8-%D1%81%D0%B5%D1%80%D0%B2%D0%B8%D1%81%D1%8B/id6739530834";
const MAX_PLAY_STORE = "https://play.google.com/store/apps/details?id=ru.oneme.app";

const MAX_BOT_USERNAME =
  typeof process.env.NEXT_PUBLIC_MAX_BOT_USERNAME === "string"
    ? process.env.NEXT_PUBLIC_MAX_BOT_USERNAME.trim()
    : "";

const DEEP_LINK = MAX_BOT_USERNAME
  ? `https://max.ru/${MAX_BOT_USERNAME}?startapp`
  : "https://max.ru";

const FALLBACK_MS = 2500;

function getStoreUrl(): string {
  if (typeof navigator === "undefined") return "https://max.ru";
  const ua = navigator.userAgent || "";
  if (/iphone|ipad|ipod/i.test(ua)) return MAX_APP_STORE;
  if (/android/i.test(ua)) return MAX_PLAY_STORE;
  return "https://max.ru";
}

export default function AuthMaxLaunchPage() {
  const [storeUrl] = useState(() => getStoreUrl());

  useEffect(() => {
    const t = setTimeout(() => {
      if (typeof document !== "undefined" && document.visibilityState === "visible") {
        window.location.href = storeUrl;
      }
    }, FALLBACK_MS);

    const start = setTimeout(() => {
      window.location.href = DEEP_LINK;
    }, 150);

    return () => {
      clearTimeout(t);
      clearTimeout(start);
    };
  }, [storeUrl]);

  return (
    <div className="flex flex-col items-center justify-center min-h-screen px-4 text-center">
      <p className="text-gray-600 dark:text-gray-400 mb-6">
        Открытие MAX…
      </p>
      <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
        Если ничего не произошло, нажмите одну из кнопок:
      </p>
      <div className="flex flex-col gap-3 w-full max-w-xs">
        <a
          href={DEEP_LINK}
          className="w-full px-4 py-3 rounded-lg bg-gray-800 hover:bg-gray-700 dark:bg-gray-700 dark:hover:bg-gray-600 text-white font-medium text-center"
        >
          Открыть MAX
        </a>
        <a
          href={storeUrl}
          className="w-full px-4 py-3 rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 font-medium text-center hover:bg-gray-100 dark:hover:bg-gray-800"
        >
          Скачать MAX из магазина
        </a>
      </div>
      <a href="/login" className="mt-8 text-sm text-blue-600 dark:text-blue-400 hover:underline">
        Вернуться на страницу входа
      </a>
    </div>
  );
}
