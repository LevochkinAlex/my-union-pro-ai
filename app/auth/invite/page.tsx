"use client";

import { useEffect, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { signIn } from "next-auth/react";

function InvitePageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token");
  const [status, setStatus] = useState<"loading" | "success" | "error">("loading");
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!token) {
      setStatus("error");
      setMessage("Отсутствует токен приглашения");
      return;
    }

    handleInvite(token);
  }, [token]);

  const handleInvite = async (inviteToken: string) => {
    try {
      const response = await fetch("/api/auth/invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: inviteToken }),
      });

      const data = await response.json();

      if (!response.ok) {
        setStatus("error");
        setMessage(data.error || "Ошибка при обработке приглашения");
        return;
      }

      // Автоматически авторизуем пользователя
      const signInResult = await signIn("credentials", {
        email: data.user.email,
        password: data.temporaryPassword,
        redirect: false,
      });

      if (signInResult?.ok) {
        setStatus("success");
        setMessage("Регистрация завершена! Перенаправление в кабинет...");
        setTimeout(() => {
          router.push("/dashboard");
        }, 2000);
      } else {
        setStatus("error");
        setMessage("Не удалось авторизоваться. Пожалуйста, войдите вручную.");
      }
    } catch (error) {
      console.error("Invite error:", error);
      setStatus("error");
      setMessage("Произошла ошибка при обработке приглашения");
    }
  };

  if (status === "loading") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50 dark:bg-gray-900">
        <div className="text-center">
          <div className="mb-4 inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-blue-500 border-r-transparent"></div>
          <p className="text-gray-600 dark:text-gray-400">Обработка приглашения...</p>
        </div>
      </div>
    );
  }

  if (status === "error") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50 dark:bg-gray-900">
        <div className="w-full max-w-md rounded-lg border border-red-200 bg-white p-6 shadow-sm dark:border-red-800 dark:bg-gray-800">
          <div className="text-center">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-red-100 dark:bg-red-900/30">
              <svg
                className="h-6 w-6 text-red-600 dark:text-red-400"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </div>
            <h1 className="mb-2 text-xl font-semibold text-gray-900 dark:text-white">
              Ошибка
            </h1>
            <p className="mb-4 text-gray-600 dark:text-gray-400">{message}</p>
            <button
              onClick={() => router.push("/login")}
              className="rounded-lg bg-blue-600 px-4 py-2 text-white hover:bg-blue-700"
            >
              Перейти на страницу входа
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 dark:bg-gray-900">
      <div className="w-full max-w-md rounded-lg border border-green-200 bg-white p-6 shadow-sm dark:border-green-800 dark:bg-gray-800">
        <div className="text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-green-100 dark:bg-green-900/30">
            <svg
              className="h-6 w-6 text-green-600 dark:text-green-400"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M5 13l4 4L19 7"
              />
            </svg>
          </div>
          <h1 className="mb-2 text-xl font-semibold text-gray-900 dark:text-white">
            Регистрация завершена!
          </h1>
          <p className="text-gray-600 dark:text-gray-400">{message}</p>
        </div>
      </div>
    </div>
  );
}

export default function InvitePage() {
  return (
    <Suspense fallback={
      <div className="flex min-h-screen items-center justify-center bg-gray-50 dark:bg-gray-900">
        <div className="text-center">
          <div className="mb-4 inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-blue-500 border-r-transparent"></div>
          <p className="text-gray-600 dark:text-gray-400">Загрузка...</p>
        </div>
      </div>
    }>
      <InvitePageContent />
    </Suspense>
  );
}

