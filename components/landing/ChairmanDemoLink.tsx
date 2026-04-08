"use client";

import { signIn } from "next-auth/react";
import { useState } from "react";

export default function ChairmanDemoLink() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleDemo = async () => {
    setLoading(true);
    setError("");
    try {
      const result = await signIn("demo", {
        demo: "chairman",
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
      setLoading(false);
    }
  };

  return (
    <div className="mt-8">
      <p className="mb-3 text-sm text-muted-foreground">Попробуйте без регистрации:</p>
      <button
        type="button"
        onClick={handleDemo}
        disabled={loading}
        className="group relative overflow-hidden rounded-xl border-2 border-primary/30 bg-primary/5 px-8 py-4 text-base font-semibold text-foreground transition-all hover:border-primary/50 hover:bg-primary/10 disabled:opacity-60"
      >
        <span className="relative z-10 flex items-center gap-2">
          {loading ? (
            <>
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
              Вход...
            </>
          ) : (
            <>
              <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 21h19.5m-18-18v18m10.5-18v18m6-13.5V21M6.75 6.75h.75m-.75 3h.75m-.75 3h.75m3-6h.75m-.75 3h.75m-.75 3h.75M6.75 21v-3.375c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21M3 3h12m-.75 4.5H21m-3.75 3.75h.008v.008h-.008v-.008zm0 3h.008v.008h-.008v-.008zm0 3h.008v.008h-.008v-.008z" />
              </svg>
              Демо-кабинет председателя ППО
            </>
          )}
        </span>
      </button>
      {error && (
        <p className="mt-2 text-center text-xs text-destructive">{error}</p>
      )}
    </div>
  );
}
