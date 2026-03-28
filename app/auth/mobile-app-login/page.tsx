"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";

const APP_SCHEME = "myunion://auth";

/**
 * Открывается из inline-кнопки в Telegram (HTTPS обязателен).
 * Редирект на кастомную схему приложения с loginToken для обмена на JWT.
 */
function MobileAppLoginInner() {
  const searchParams = useSearchParams();
  const [hint, setHint] = useState("Открываем приложение…");

  useEffect(() => {
    const t = searchParams.get("t");
    if (!t) {
      setHint("Нет токена. Вернитесь в приложение и начните вход снова.");
      return;
    }
    const deep = `${APP_SCHEME}?loginToken=${encodeURIComponent(t)}`;
    window.location.replace(deep);
    const tmr = window.setTimeout(() => {
      setHint(
        "Если приложение не открылось, установите МойСоюз и откройте ссылку из бота ещё раз или закройте Telegram и нажмите кнопку снова.",
      );
    }, 2500);
    return () => window.clearTimeout(tmr);
  }, [searchParams]);

  return (
    <div className="flex min-h-[40vh] flex-col items-center justify-center gap-3 px-6 text-center text-sm text-slate-600">
      <p>{hint}</p>
    </div>
  );
}

export default function MobileAppLoginPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-[40vh] items-center justify-center text-slate-500">Загрузка…</div>
      }
    >
      <MobileAppLoginInner />
    </Suspense>
  );
}
