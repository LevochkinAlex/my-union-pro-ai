"use client";

import { useState } from "react";
import * as Sentry from "@sentry/nextjs";

export default function SentryExamplePage() {
  const [errorTriggered, setErrorTriggered] = useState(false);

  const triggerError = () => {
    try {
      setErrorTriggered(true);
      // Вызываем несуществующую функцию для тестирования Sentry
      // @ts-ignore - намеренно вызываем несуществующую функцию
      myUndefinedFunction();
    } catch (error) {
      // Sentry автоматически захватит эту ошибку
      console.error("Test error triggered:", error);
    }
  };

  const triggerManualError = () => {
    try {
      throw new Error("Тестовая ошибка для Sentry - ручной вызов");
    } catch (error) {
      Sentry.captureException(error);
      console.error("Manual error sent to Sentry:", error);
    }
  };

  const triggerAsyncError = async () => {
    try {
      await Promise.reject(new Error("Тестовая асинхронная ошибка для Sentry"));
    } catch (error) {
      Sentry.captureException(error);
      console.error("Async error sent to Sentry:", error);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center p-4">
      <div className="max-w-2xl w-full bg-white dark:bg-gray-800 rounded-lg shadow-lg p-8">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-4">
          Sentry Test Page
        </h1>
        <p className="text-gray-600 dark:text-gray-400 mb-8">
          Эта страница предназначена для тестирования интеграции Sentry.
          Нажмите на кнопки ниже, чтобы вызвать различные типы ошибок.
        </p>

        <div className="space-y-4">
          <button
            onClick={triggerError}
            className="w-full px-6 py-3 bg-red-600 hover:bg-red-700 text-white rounded-lg font-medium transition-colors"
          >
            Вызвать ошибку (myUndefinedFunction)
          </button>

          <button
            onClick={triggerManualError}
            className="w-full px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors"
          >
            Вызвать ручную ошибку
          </button>

          <button
            onClick={triggerAsyncError}
            className="w-full px-6 py-3 bg-purple-600 hover:bg-purple-700 text-white rounded-lg font-medium transition-colors"
          >
            Вызвать асинхронную ошибку
          </button>
        </div>

        {errorTriggered && (
          <div className="mt-6 p-4 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg">
            <p className="text-yellow-800 dark:text-yellow-200 text-sm">
              ✅ Ошибка была вызвана. Проверьте Sentry Dashboard, чтобы увидеть захваченное событие.
            </p>
          </div>
        )}

        <div className="mt-8 pt-6 border-t border-gray-200 dark:border-gray-700">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
            Инструкции:
          </h2>
          <ol className="list-decimal list-inside space-y-2 text-sm text-gray-600 dark:text-gray-400">
            <li>Нажмите на любую из кнопок выше</li>
            <li>Откройте консоль браузера (F12) для просмотра логов</li>
            <li>Проверьте Sentry Dashboard - ошибка должна появиться в течение нескольких секунд</li>
            <li>После появления ошибки в Sentry, вернитесь к шагу 2 в Sentry Setup и нажмите "Take me to my error"</li>
          </ol>
        </div>
      </div>
    </div>
  );
}

