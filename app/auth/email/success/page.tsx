"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { getSession, signIn } from "next-auth/react";

/**
 * Страница перехода по magic link из письма.
 *
 * Основной UX — вход по 6-значному PIN на /login. Magic link остаётся запасным вариантом.
 * Когда пользователь кликает ссылку в письме, эта страница автоматически выполняет signIn
 * и перебрасывает в дашборд, без промежуточных кнопок.
 *
 * Защита от «сгорания» токена preview/strict-mode:
 * - authStartedRef гасит двойной вызов (React 18 Strict Mode / двойной монтинг)
 * - токен потребляется только POST-запросом NextAuth, GET-превью не тратит его
 */
function EmailSuccessContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [status, setStatus] = useState<"loading" | "error">("loading");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const authStartedRef = useRef(false);

  useEffect(() => {
    if (authStartedRef.current) return;
    authStartedRef.current = true;

    const tokenFromQuery = searchParams.get("token");
    const hash = typeof window !== "undefined" ? window.location.hash : "";
    const hashParams = new URLSearchParams(hash.startsWith("#") ? hash.slice(1) : hash);
    const tokenFromHash = hashParams.get("token");
    const token = tokenFromQuery || tokenFromHash;

    if (!token) {
      setStatus("error");
      setErrorMessage("Ссылка некорректна: токен не найден.");
      setTimeout(() => router.replace("/login?error=missing_token"), 2500);
      return;
    }

    (async () => {
      try {
        const result = await signIn("login-token", {
          loginToken: token,
          redirect: false,
        });

        if (!result || result.error || !result.ok) {
          // CredentialsSignin = токен уже использован/истёк.
          // Проверим — может быть, в этой же сессии первый вызов уже завершился успешно.
          const session = await getSession();
          if (session?.user?.id) {
            window.location.replace("/dashboard");
            return;
          }
          setStatus("error");
          setErrorMessage(
            "Ссылка уже использована или истекла. Запросите новую на странице входа.",
          );
          setTimeout(
            () => router.replace("/login?error=link_used_or_expired"),
            2500,
          );
          return;
        }

        // Успех: cookie сессии уже выставлен — сразу жёсткий переход на дашборд.
        window.location.replace("/dashboard");
      } catch (err) {
        console.error("[Email Success] Exception:", err);
        setStatus("error");
        setErrorMessage("Не удалось войти. Попробуйте запросить новую ссылку.");
        setTimeout(() => router.replace("/login?error=server_error"), 2500);
      }
    })();
  }, [router, searchParams]);

  if (status === "error") {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen px-4">
        <div className="max-w-md text-center">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-3">
            Не удалось войти
          </h1>
          <p className="text-gray-600 dark:text-gray-400 mb-4">
            {errorMessage ?? "Произошла ошибка. Попробуйте ещё раз."}
          </p>
          <p className="text-sm text-gray-500">Перенаправляем на страницу входа…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-screen px-4">
      <div className="text-center">
        <div className="mb-4 inline-block h-14 w-14 animate-spin rounded-full border-4 border-solid border-blue-500 border-r-transparent" />
        <h1 className="text-xl font-semibold text-gray-900 dark:text-white mb-1">
          Входим в аккаунт…
        </h1>
        <p className="text-sm text-gray-600 dark:text-gray-400">Подождите, это займёт пару секунд.</p>
      </div>
    </div>
  );
}

export default function EmailSuccessPage() {
  return (
    <Suspense
      fallback={
        <div className="flex flex-col items-center justify-center min-h-screen px-4">
          <div className="text-center">
            <div className="mb-4 inline-block h-14 w-14 animate-spin rounded-full border-4 border-solid border-blue-500 border-r-transparent" />
            <h1 className="text-xl font-semibold text-gray-900 dark:text-white">Загрузка…</h1>
          </div>
        </div>
      }
    >
      <EmailSuccessContent />
    </Suspense>
  );
}
