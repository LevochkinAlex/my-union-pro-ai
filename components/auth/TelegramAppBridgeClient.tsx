"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";

function appendAccessTokenToUrl(base: string, accessToken: string): string {
  const sep = base.includes("?") ? "&" : "?";
  return `${base}${sep}accessToken=${encodeURIComponent(accessToken)}`;
}

function TelegramAppBridgeInner() {
  const searchParams = useSearchParams();
  const scheme = searchParams.get("scheme") || "myunion";
  const redirectParam = searchParams.get("redirect");
  const [message, setMessage] = useState("Подключение к Telegram…");

  useEffect(() => {
    if (typeof window === "undefined") return;

    const hash = window.location.hash;
    if (!hash.startsWith("#tgAuthResult=")) {
      setMessage("Нет данных от Telegram. Закройте окно и попробуйте снова из приложения.");
      return;
    }

    let cancelled = false;

    (async () => {
      try {
        const rawPayload = hash.slice("#tgAuthResult=".length);
        const decodedPayload = decodeURIComponent(rawPayload);

        let data: Record<string, unknown>;
        if (decodedPayload.startsWith("{")) {
          data = JSON.parse(decodedPayload) as Record<string, unknown>;
        } else {
          const normalizedBase64 = decodedPayload
            .replace(/-/g, "+")
            .replace(/_/g, "/")
            .padEnd(Math.ceil(decodedPayload.length / 4) * 4, "=");
          const json = atob(normalizedBase64);
          data = JSON.parse(json) as Record<string, unknown>;
        }

        const body: Record<string, string> = {};
        for (const [key, val] of Object.entries(data)) {
          if (val != null) body[key] = String(val);
        }

        const res = await fetch("/api/mobile/auth/telegram-widget", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });

        const payload = (await res.json().catch(() => ({}))) as { accessToken?: string; error?: string };

        if (!res.ok || !payload.accessToken) {
          if (!cancelled) {
            setMessage(payload.error || "Не удалось войти. Попробуйте ещё раз.");
          }
          return;
        }

        const target = redirectParam?.trim() || `${scheme}://auth`;
        window.location.replace(appendAccessTokenToUrl(target, payload.accessToken));
      } catch (e) {
        console.error("[telegram-app-bridge]", e);
        if (!cancelled) setMessage("Ошибка обработки ответа Telegram.");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [scheme, redirectParam]);

  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center gap-4 px-6 text-center">
      <div className="h-10 w-10 animate-spin rounded-full border-4 border-blue-600 border-r-transparent" />
      <p className="text-sm text-gray-600 dark:text-gray-400">{message}</p>
    </div>
  );
}

export function TelegramAppBridgePageContent() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-[50vh] items-center justify-center">
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-blue-600 border-r-transparent" />
        </div>
      }
    >
      <TelegramAppBridgeInner />
    </Suspense>
  );
}
