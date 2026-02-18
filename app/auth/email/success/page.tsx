"use client";

import { useEffect, useState, useRef, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { signIn, getSession } from "next-auth/react";

/**
 * Страница успешной авторизации через Email
 * Автоматически авторизует пользователя по magic link токену
 */
function EmailSuccessContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [error, setError] = useState<string | null>(null);
  const authStartedRef = useRef(false);

  useEffect(() => {
    const token = searchParams.get("token");

    if (!token) {
      setError("Токен авторизации не найден");
      setTimeout(() => router.push("/login"), 3000);
      return;
    }

    // Защита от двойного вызова (React Strict Mode / двойной mount)
    if (authStartedRef.current) return;
    authStartedRef.current = true;

    // Авторизуем пользователя по токену
    const authenticate = async () => {
      try {
        console.log("[Email Success] Начало авторизации с токеном:", token?.substring(0, 10) + "...");
        
        const result = await signIn("login-token", {
          loginToken: token,
          redirect: false,
        });

        console.log("[Email Success] Результат signIn:", { ok: result?.ok, error: result?.error });

        if (result?.error) {
          // CredentialsSignin = токен уже использован, истёк или не найден
          if (result.error === "CredentialsSignin") {
            const session = await getSession();
            if (session?.user?.id) {
              // Уже вошли (например, первый вызов успел) — редирект в личный кабинет
              window.location.href = "/dashboard";
              return;
            }
            setError("Ссылка уже использована или истекла. Запросите новую ссылку для входа.");
            setTimeout(() => router.push("/login?error=link_used_or_expired"), 3000);
            return;
          }
          console.error("[Email Success] Ошибка авторизации:", result.error);
          setError("Ошибка авторизации. Попробуйте снова.");
          setTimeout(() => router.push("/login?error=auth_failed"), 3000);
          return;
        }

        if (!result?.ok) {
          console.error("[Email Success] signIn вернул не ok");
          setError("Ошибка авторизации. Попробуйте снова.");
          setTimeout(() => router.push("/login?error=auth_failed"), 3000);
          return;
        }

        // Ждем установки сессии перед редиректом
        console.log("[Email Success] signIn успешен, ожидаем установки сессии...");
        
        // Даем время для установки cookie
        await new Promise(resolve => setTimeout(resolve, 1000));

        // Проверяем сессию несколько раз с интервалом
        let session = null;
        for (let i = 0; i < 5; i++) {
          session = await getSession();
          if (session?.user?.id) {
            console.log("[Email Success] Сессия подтверждена, пользователь:", session.user.id);
            break;
          }
          console.log("[Email Success] Попытка", i + 1, "- сессия еще не готова, ждем...");
          await new Promise(resolve => setTimeout(resolve, 500));
        }

        if (!session?.user?.id) {
          console.error("[Email Success] Сессия не установилась после 5 попыток");
          setError("Сессия не установилась. Попробуйте снова.");
          setTimeout(() => router.push("/login?error=session_timeout"), 3000);
          return;
        }

        // Успешная авторизация - обновляем роутер и редиректим
        console.log("[Email Success] Редирект на /dashboard");
        router.refresh();
        // Используем window.location для полной перезагрузки страницы и установки всех cookies
        window.location.href = "/dashboard";
      } catch (err) {
        console.error("[Email Success] Исключение при авторизации:", err);
        setError("Произошла ошибка. Попробуйте снова.");
        setTimeout(() => router.push("/login?error=server_error"), 3000);
      }
    };

    authenticate();
  }, [searchParams, router]);

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen px-4">
        <div className="text-center">
          <div className="mb-4">
            <svg
              className="mx-auto h-16 w-16 text-red-500"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
            Ошибка авторизации
          </h1>
          <p className="text-gray-600 dark:text-gray-400 mb-4">{error}</p>
          <p className="text-sm text-gray-500">
            Перенаправление на страницу входа...
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-screen px-4">
      <div className="text-center">
        <div className="mb-4">
          <div className="inline-block h-16 w-16 animate-spin rounded-full border-4 border-solid border-blue-500 border-r-transparent"></div>
        </div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
          Авторизация через Email
        </h1>
        <p className="text-gray-600 dark:text-gray-400">
          Подождите, выполняется вход в систему...
        </p>
      </div>
    </div>
  );
}

export default function EmailSuccessPage() {
  return (
    <Suspense fallback={
      <div className="flex flex-col items-center justify-center min-h-screen px-4">
        <div className="text-center">
          <div className="mb-4">
            <div className="inline-block h-16 w-16 animate-spin rounded-full border-4 border-solid border-blue-500 border-r-transparent"></div>
          </div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
            Загрузка...
          </h1>
        </div>
      </div>
    }>
      <EmailSuccessContent />
    </Suspense>
  );
}

