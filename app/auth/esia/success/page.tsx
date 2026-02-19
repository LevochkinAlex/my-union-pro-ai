"use client";

import { useEffect, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { signIn, useSession, getSession } from "next-auth/react";

function EsiaSuccessContent() {
  const searchParams = useSearchParams();
  const { update: updateSession } = useSession();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const token = searchParams.get("token");

    if (!token) {
      setError("Токен авторизации не найден. Повторите вход через Госуслуги.");
      return;
    }

    const authenticate = async () => {
      try {
        const result = await signIn("login-token", {
          loginToken: token,
          redirect: false,
        });

        if (result?.error) {
          setError("Ошибка авторизации. Попробуйте войти снова через Госуслуги.");
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
      } catch {
        setError("Произошла ошибка. Попробуйте войти через Госуслуги снова.");
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
          <div className="inline-block h-16 w-16 animate-spin rounded-full border-4 border-solid border-[#0D4CD3] border-r-transparent"></div>
        </div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
          Вход через Госуслуги
        </h1>
        <p className="text-gray-600 dark:text-gray-400">
          Выполняется вход в личный кабинет...
        </p>
      </div>
    </div>
  );
}

export default function EsiaSuccessPage() {
  return (
    <Suspense
      fallback={
        <div className="flex flex-col items-center justify-center min-h-screen px-4">
          <div className="text-center">
            <div className="mb-4">
              <div className="inline-block h-16 w-16 animate-spin rounded-full border-4 border-solid border-[#0D4CD3] border-r-transparent"></div>
            </div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
              Загрузка...
            </h1>
          </div>
        </div>
      }
    >
      <EsiaSuccessContent />
    </Suspense>
  );
}
