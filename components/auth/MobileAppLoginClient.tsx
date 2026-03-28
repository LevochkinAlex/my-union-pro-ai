"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";

const APP_SCHEME = "myunion://auth";

/**
 * Промежуточная HTTPS-страница: из кнопки в Telegram открывается только https://…
 * (протокол myunion:// в самой кнопке Telegram недопустим). Здесь редирект в приложение.
 *
 * Системный вопрос «Открыть https://myunion.pro/…?» — это нормально: Telegram/iOS
 * спрашивают разрешение перед выходом во внешний браузер или Safari.
 */
function MobileAppLoginInner() {
  const searchParams = useSearchParams();
  const token = searchParams.get("t");
  const expoHost = searchParams.get("eh");

  const schemeDeepLink = useMemo(() => {
    if (!token) return null;
    return `${APP_SCHEME}?loginToken=${encodeURIComponent(token)}`;
  }, [token]);

  const expoDeepLink = useMemo(() => {
    if (!token || !expoHost) return null;
    if (!/^[a-zA-Z0-9.\-:]+$/.test(expoHost)) return null;
    return `exp://${expoHost}/--/auth?loginToken=${encodeURIComponent(token)}`;
  }, [token, expoHost]);

  const primaryDeepLink = expoDeepLink || schemeDeepLink;
  const fallbackDeepLink = expoDeepLink ? schemeDeepLink : null;

  const [showExtraHint, setShowExtraHint] = useState(false);
  const [copyDone, setCopyDone] = useState(false);

  async function copyLoginLink() {
    if (typeof window === "undefined" || !token) return;
    const href = window.location.href.split("#")[0];
    try {
      await navigator.clipboard.writeText(href);
      setCopyDone(true);
      window.setTimeout(() => setCopyDone(false), 2500);
    } catch {
      // fallback: select is complex; user can long-press the visible URL
    }
  }

  useEffect(() => {
    if (!primaryDeepLink) return;
    try {
      window.location.replace(primaryDeepLink);
    } catch {
      // ignore
    }
    let fallbackTimer: number | null = null;
    if (fallbackDeepLink) {
      fallbackTimer = window.setTimeout(() => {
        try {
          window.location.href = fallbackDeepLink;
        } catch {
          // ignore
        }
      }, 1200);
    }
    const tmr = window.setTimeout(() => setShowExtraHint(true), 2000);
    return () => {
      window.clearTimeout(tmr);
      if (fallbackTimer) window.clearTimeout(fallbackTimer);
    };
  }, [primaryDeepLink, fallbackDeepLink]);

  if (!token) {
    return (
      <div className="flex min-h-[50vh] flex-col items-center justify-center gap-2 px-6 text-center">
        <p className="text-sm font-medium text-red-700">Ссылка входа неполная</p>
        <p className="max-w-md text-sm text-slate-600">
          Вернитесь в приложение МойСоюз и снова нажмите «Войти через бота», затем в Telegram — «Вернуться в приложение».
        </p>
      </div>
    );
  }

  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center gap-5 px-6 text-center">
      <p className="max-w-md text-xs text-slate-500">
        Если Telegram или телефон спросили разрешение открыть ссылку — нажмите «Открыть» / «Разрешить»: так
        устроена безопасность, это не ошибка.
      </p>

      <p className="text-sm text-slate-600">
        {showExtraHint ? "Приложение не открылось автоматически?" : "Открываем приложение…"}
      </p>

      {showExtraHint ? (
        <p className="max-w-md text-sm leading-relaxed text-slate-600">
          Если приложение не открылось, установите МойСоюз и откройте ссылку из бота ещё раз или закройте Telegram и
          нажмите кнопку снова.
        </p>
      ) : null}

      <a
        href={primaryDeepLink || "#"}
        className="inline-flex min-h-[44px] min-w-[200px] items-center justify-center rounded-xl bg-indigo-600 px-6 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-700 active:bg-indigo-800"
      >
        {expoDeepLink ? "Открыть в Expo Go" : "Открыть МойСоюз"}
      </a>

      {fallbackDeepLink ? (
        <a
          href={fallbackDeepLink}
          className="inline-flex min-h-[40px] min-w-[200px] items-center justify-center rounded-xl border border-slate-300 px-5 text-xs font-medium text-slate-700 transition hover:bg-slate-50"
        >
          Или открыть через схему приложения
        </a>
      ) : null}

      <div className="max-w-md rounded-lg bg-slate-100 px-3 py-2 text-left">
        <p className="mb-2 text-xs font-medium text-slate-700">Не открылось (часто в Expo Go или из Telegram)?</p>
        <p className="mb-2 text-[11px] leading-snug text-slate-600">
          Скопируйте ссылку этой страницы и в приложении МойСоюз на экране входа вставьте её в поле «Вставьте ссылку или код», затем «Войти по коду из бота».
        </p>
        <button
          type="button"
          onClick={() => void copyLoginLink()}
          className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-800 hover:bg-slate-50"
        >
          {copyDone ? "Скопировано — вставьте в приложении" : "Скопировать ссылку для входа"}
        </button>
      </div>

      {showExtraHint ? (
        <p className="max-w-md text-left text-xs text-slate-500">
          Дополнительно: на экране входа в приложении можно вставить скопированную ссылку в поле «Вставьте ссылку или код».
        </p>
      ) : null}
    </div>
  );
}

export function MobileAppLoginClient() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-[50vh] items-center justify-center text-sm text-slate-500">Загрузка…</div>
      }
    >
      <MobileAppLoginInner />
    </Suspense>
  );
}
