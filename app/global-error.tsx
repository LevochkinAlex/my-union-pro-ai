"use client";

import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";

/**
 * Граница ошибок корневого layout (App Router). Нужна для отправки ошибок рендера React в Sentry.
 * @see https://docs.sentry.io/platforms/javascript/guides/nextjs/manual-setup/#react-render-errors-in-app-router
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html lang="ru">
      <body className="flex min-h-screen flex-col items-center justify-center gap-4 bg-gray-50 p-6 text-gray-900 dark:bg-gray-900 dark:text-white">
        <h2 className="text-lg font-semibold">Произошла ошибка при загрузке страницы</h2>
        <button
          type="button"
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
          onClick={() => reset()}
        >
          Попробовать снова
        </button>
      </body>
    </html>
  );
}
