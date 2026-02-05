"use client";

import { signIn } from "next-auth/react";
import { useState } from "react";

/**
 * Кнопка демо-входа только для члена профсоюза (на главной странице).
 */
export default function MemberDemoLink() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleDemo = async () => {
    setLoading(true);
    setError("");
    try {
      const result = await signIn("demo", {
        demo: "member",
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
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
              </svg>
              Демо-кабинет члена профсоюза
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
