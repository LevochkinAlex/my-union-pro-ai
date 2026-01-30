"use client";

import { signIn } from "next-auth/react";
import { useState } from "react";

/**
 * Ссылки «Демо: председатель» и «Демо: член профсоюза» для лендинга.
 * Вход через провайдер demo без сохранения данных.
 */
export default function LandingDemoLinks() {
  const [loading, setLoading] = useState<"chairman" | "member" | null>(null);
  const [error, setError] = useState("");

  const handleDemo = async (demo: "chairman" | "member") => {
    setLoading(demo);
    setError("");
    try {
      const result = await signIn("demo", {
        demo,
        callbackUrl: "/dashboard",
        redirect: false,
      });
      if (result?.error) {
        setError("Не удалось войти в демо");
        return;
      }
      if (result?.ok) {
        window.location.href = "/dashboard";
        return;
      }
    } catch {
      setError("Ошибка входа в демо");
    } finally {
      setLoading(null);
    }
  };

  return (
    <div className="mt-6 border-t border-border pt-6">
      <p className="mb-3 text-xs text-muted-foreground">Попробовать без регистрации:</p>
      <div className="flex flex-wrap items-center justify-center gap-3">
        <button
          type="button"
          onClick={() => handleDemo("chairman")}
          disabled={!!loading}
          className="rounded-lg border border-border bg-background px-4 py-2.5 text-sm font-semibold text-foreground hover:bg-muted disabled:opacity-60"
        >
          {loading === "chairman" ? "Вход…" : "Председатель"}
        </button>
        <button
          type="button"
          onClick={() => handleDemo("member")}
          disabled={!!loading}
          className="rounded-lg border border-border bg-background px-4 py-2.5 text-sm font-semibold text-foreground hover:bg-muted disabled:opacity-60"
        >
          {loading === "member" ? "Вход…" : "Член профсоюза"}
        </button>
      </div>
      {error && (
        <p className="mt-2 text-center text-xs text-destructive">{error}</p>
      )}
    </div>
  );
}
