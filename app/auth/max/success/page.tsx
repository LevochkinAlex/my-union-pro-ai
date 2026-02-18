"use client";

import { useEffect, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { signIn, useSession, getSession } from "next-auth/react";

/**
 * Страница успешной авторизации через MAX
 * Принимает token из query и выполняет signIn(credentials) → редирект в dashboard
 */
function MaxSuccessContent() {
  const searchParams = useSearchParams();
  const { update: updateSession } = useSession();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const token = searchParams.get("token");
    if (!token) {
      setError("Токен не найден. Войдите через мини-приложение в MAX.");
      return;
    }

    const authenticate = async () => {
      try {
        const result = await signIn("login-token", {
          loginToken: token,
          redirect: false,
        });
        if (result?.error) {
          setError("Ошибка входа. Токен истёк или уже использован.");
          return;
        }
        if (result?.ok) {
          await updateSession();
          setTimeout(async () => {
            const session = await getSession();
            if (session?.user?.id) {
              window.location.href = "/dashboard";
            } else {
              setTimeout(() => (window.location.href = "/dashboard"), 1000);
            }
          }, 800);
        }
      } catch (err) {
        console.error("[MAX Success] Ошибка:", err);
        setError("Произошла ошибка входа.");
      }
    };

    authenticate();
  }, [searchParams, updateSession]);

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen px-4">
        <p className="text-red-600 dark:text-red-400 mb-4">{error}</p>
        <a href="/login" className="text-blue-600 dark:text-blue-400 hover:underline">
          Вернуться на страницу входа
        </a>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-screen px-4">
      <div className="animate-pulse text-gray-600 dark:text-gray-400">
        Вход в личный кабинет…
      </div>
    </div>
  );
}

export default function MaxSuccessPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center">Загрузка…</div>}>
      <MaxSuccessContent />
    </Suspense>
  );
}
