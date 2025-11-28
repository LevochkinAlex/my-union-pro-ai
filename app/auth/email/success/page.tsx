"use client";

import { useEffect, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { signIn } from "next-auth/react";

/**
 * Страница успешной авторизации через Email
 * Автоматически авторизует пользователя по magic link токену
 */
function EmailSuccessContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const token = searchParams.get("token");

    if (!token) {
      setError("Токен авторизации не найден");
      setTimeout(() => router.push("/login"), 3000);
      return;
    }

    // Авторизуем пользователя по токену
    const authenticate = async () => {
      try {
        const result = await signIn("credentials", {
          loginToken: token,
          redirect: false,
        });

        if (result?.error) {
          setError("Ошибка авторизации. Попробуйте снова.");
          setTimeout(() => router.push("/login"), 3000);
        } else if (result?.ok) {
          // Успешная авторизация - редирект в dashboard
          router.push("/dashboard");
        }
      } catch (err) {
        console.error("[Email Success] Ошибка:", err);
        setError("Произошла ошибка. Попробуйте снова.");
        setTimeout(() => router.push("/login"), 3000);
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

