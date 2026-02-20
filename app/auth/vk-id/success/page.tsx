"use client";

import { useEffect, useState, useRef, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { signIn, useSession, getSession } from "next-auth/react";

/**
 * Страница успешной авторизации через VK ID
 * Автоматически авторизует пользователя по временному токену (тот же flow, что Telegram/MAX)
 */
function VkIdSuccessContent() {
  const searchParams = useSearchParams();
  const { update: updateSession } = useSession();
  const [error, setError] = useState<string | null>(null);
  const authStarted = useRef(false);

  useEffect(() => {
    const token = searchParams.get("token");

    if (!token) {
      setError("Токен авторизации не найден. Повторите вход через VK ID.");
      return;
    }

    if (authStarted.current) return;
    authStarted.current = true;

    const authenticate = async () => {
      try {
        // Если уже есть сессия (например, токен уже использован при двойном рендере) — сразу в кабинет
        const existingSession = await getSession();
        if (existingSession?.user?.id) {
          window.location.href = "/dashboard";
          return;
        }

        const result = await signIn("login-token", {
          loginToken: token,
          redirect: false,
        });

        if (result?.error) {
          const sessionAfter = await getSession();
          if (sessionAfter?.user?.id) {
            window.location.href = "/dashboard";
            return;
          }
          setError("Ошибка авторизации. Попробуйте войти снова через VK ID. Если открыли ссылку из приложения ВКонтакте — откройте страницу входа в обычном браузере.");
        } else if (result?.ok) {
          await updateSession();
          setTimeout(async () => {
            const session = await getSession();
            if (session?.user?.id) {
              window.location.href = "/dashboard";
            } else {
              setTimeout(() => {
                window.location.href = "/dashboard";
              }, 1000);
            }
          }, 1500);
        }
      } catch (err) {
        setError("Произошла ошибка. Попробуйте войти через VK ID снова.");
      }
    };

    authenticate();
  }, [searchParams, updateSession]);

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
          <a
            href="/login"
            className="text-blue-600 dark:text-blue-400 hover:underline"
          >
            Вернуться на страницу входа
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-screen px-4">
      <div className="text-center">
        <div className="mb-4">
          <div className="inline-block h-16 w-16 animate-spin rounded-full border-4 border-solid border-[#0077FF] border-r-transparent"></div>
        </div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
          Вход через VK ID
        </h1>
        <p className="text-gray-600 dark:text-gray-400">
          Выполняется вход в личный кабинет...
        </p>
      </div>
    </div>
  );
}

export default function VkIdSuccessPage() {
  return (
    <Suspense
      fallback={
        <div className="flex flex-col items-center justify-center min-h-screen px-4">
          <div className="text-center">
            <div className="mb-4">
              <div className="inline-block h-16 w-16 animate-spin rounded-full border-4 border-solid border-[#0077FF] border-r-transparent"></div>
            </div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
              Загрузка...
            </h1>
          </div>
        </div>
      }
    >
      <VkIdSuccessContent />
    </Suspense>
  );
}
