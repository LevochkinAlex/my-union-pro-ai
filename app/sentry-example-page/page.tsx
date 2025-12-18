"use client";

import * as Sentry from "@sentry/nextjs";

export default function SentryExamplePage() {
  const triggerError = () => {
    // Отправляем тестовую ошибку в Sentry
    throw new Error("Sentry Example Frontend Error - Test verification");
  };

  const triggerSentryError = () => {
    // Отправляем ошибку через Sentry API напрямую
    Sentry.captureException(new Error("Sentry Manual Test Error"));
    alert("Ошибка отправлена в Sentry!");
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100 dark:bg-gray-900">
      <div className="bg-white dark:bg-gray-800 p-8 rounded-xl shadow-lg max-w-md w-full">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">
          Sentry Test Page
        </h1>
        <p className="text-gray-600 dark:text-gray-400 mb-6">
          Нажмите кнопку для отправки тестовой ошибки в Sentry.
        </p>
        
        <div className="space-y-4">
          <button
            onClick={triggerSentryError}
            className="w-full px-4 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            Отправить тестовую ошибку (безопасно)
          </button>
          
          <button
            onClick={triggerError}
            className="w-full px-4 py-3 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
          >
            Вызвать исключение (страница упадет)
          </button>
        </div>
        
        <p className="text-xs text-gray-500 dark:text-gray-500 mt-4">
          После нажатия проверьте Sentry Dashboard
        </p>
      </div>
    </div>
  );
}
