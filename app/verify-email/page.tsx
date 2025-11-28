"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";

function VerifyEmailContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token");
  
  const [status, setStatus] = useState<"loading" | "success" | "error">("loading");
  const [message, setMessage] = useState("");

  useEffect(() => {
    const verifyEmail = async () => {
      if (!token) {
        setStatus("error");
        setMessage("Токен верификации не найден");
        return;
      }

      try {
        const response = await fetch("/api/user/verify-email", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token }),
        });

        const data = await response.json();

        if (response.ok) {
          setStatus("success");
          setMessage("Email успешно подтвержден! Теперь вы можете получить доступ к скидкам BestBenefits.");
          
          // Перенаправляем в dashboard через 3 секунды
          setTimeout(() => {
            router.push("/dashboard");
          }, 3000);
        } else {
          setStatus("error");
          setMessage(data.error || "Ошибка при подтверждении email");
        }
      } catch (error) {
        console.error("Verification error:", error);
        setStatus("error");
        setMessage("Произошла ошибка при подтверждении email");
      }
    };

    verifyEmail();
  }, [token, router]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800 flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-white dark:bg-gray-800 rounded-xl shadow-lg p-8">
        {status === "loading" && (
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
            <p className="text-gray-600 dark:text-gray-400">Подтверждаем email...</p>
          </div>
        )}

        {status === "success" && (
          <div className="text-center">
            <div className="mb-4 text-6xl">✅</div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">
              Email подтвержден!
            </h1>
            <p className="text-gray-600 dark:text-gray-400 mb-6">
              {message}
            </p>
            <div className="flex flex-col gap-3">
              <p className="text-sm text-gray-500">
                Перенаправление в личный кабинет...
              </p>
              <Link
                href="/dashboard"
                className="inline-block bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 px-4 rounded-lg transition-colors"
              >
                Перейти в личный кабинет
              </Link>
            </div>
          </div>
        )}

        {status === "error" && (
          <div className="text-center">
            <div className="mb-4 text-6xl">❌</div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">
              Ошибка верификации
            </h1>
            <p className="text-red-600 dark:text-red-400 mb-6">
              {message}
            </p>
            <div className="flex flex-col gap-3">
              <Link
                href="/dashboard"
                className="inline-block bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 px-4 rounded-lg transition-colors"
              >
                Вернуться в личный кабинет
              </Link>
              <Link
                href="/"
                className="inline-block text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors"
              >
                На главную
              </Link>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function VerifyEmailPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white dark:bg-gray-800 rounded-xl shadow-lg p-8 text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600 dark:text-gray-400">Загрузка...</p>
        </div>
      </div>
    }>
      <VerifyEmailContent />
    </Suspense>
  );
}

