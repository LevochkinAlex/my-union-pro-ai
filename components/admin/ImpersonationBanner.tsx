"use client";

import { useState } from "react";
import { signIn, useSession } from "next-auth/react";

export default function ImpersonationBanner() {
  const { data: session } = useSession();
  const [loading, setLoading] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [bannerError, setBannerError] = useState<string | null>(null);

  if (!session?.user?.isImpersonating || dismissed) {
    return null;
  }

  const handleStopImpersonation = async () => {
    setBannerError(null);
    setLoading(true);
    try {
      if (!session?.user?.originalAdminId) {
        setBannerError(
          "Не найден ID администратора для восстановления сессии. Выйдите из аккаунта и войдите как администратор заново."
        );
        return;
      }

      const impersonatedUserId = session.user.id;
      /** До restore сессия ещё «партнёрская» — после restore role сменится */
      const returnTo =
        session.user.role === "PARTNER" ? "/admin/partners" : "/admin/users";

      const prep = await fetch("/api/admin/impersonate/stop", {
        method: "POST",
        credentials: "same-origin",
      });
      const prepJson = (await prep.json().catch(() => ({}))) as {
        error?: string;
        restoreJwt?: string;
        adminId?: string;
      };

      if (!prep.ok || !prepJson.restoreJwt || !prepJson.adminId) {
        setBannerError(
          prepJson.error ||
            "Не удалось подготовить выход из режима просмотра. Попробуйте обновить страницу или заново войти от имени пользователя."
        );
        return;
      }

      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("Таймаут запроса")), 20000)
      );

      const signInPromise = signIn("restore-admin", {
        adminId: prepJson.adminId,
        impersonatedUserId,
        restoreJwt: prepJson.restoreJwt,
        redirect: false,
        callbackUrl: returnTo,
      });

      const result = await Promise.race([signInPromise, timeoutPromise]);

      if (result?.error) {
        const isCreds = result.error === "CredentialsSignin";
        setBannerError(
          isCreds
            ? "Не удалось восстановить сессию администратора (ошибка входа). Проверьте доступ к базе данных или выполните выход и войдите как администратор."
            : `Ошибка: ${result.error}. Перезагрузите страницу или выполните выход и войдите заново.`
        );
        return;
      }

      if (!result || result.ok !== true) {
        setBannerError(
          "Не удалось восстановить сессию админа. Попробуйте ещё раз или выйдите из аккаунта."
        );
        return;
      }

      // Полная загрузка страницы — после смены JWT client router часто оставляет старую сессию в памяти
      window.location.assign(returnTo);
    } catch (error) {
      console.error("[Stop Impersonation] Error:", error);
      const errorMessage =
        error instanceof Error
          ? error.message
          : "Ошибка при выходе из режима impersonation";

      if (errorMessage.includes("Таймаут")) {
        setBannerError(
          "Превышено время ожидания. Попробуйте снова или перезагрузите страницу."
        );
      } else {
        setBannerError(
          `${errorMessage} Попробуйте выйти из системы и войти заново.`
        );
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="sticky top-0 z-50 flex flex-col gap-3 bg-yellow-500 px-4 py-3 text-white shadow-lg">
      {bannerError ? (
        <p
          role="alert"
          className="w-full rounded-md bg-yellow-900/25 px-3 py-2 text-sm font-medium text-yellow-950"
        >
          {bannerError}
        </p>
      ) : null}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
        <div className="flex min-w-0 flex-1 items-start gap-2 sm:items-center">
        <svg
          className="mt-0.5 h-5 w-5 flex-shrink-0 sm:mt-0"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          aria-hidden
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
          />
        </svg>
        <span className="min-w-0 font-medium text-sm sm:text-base">
          {session?.user?.role === "PARTNER"
            ? "Режим просмотра: вы вошли в кабинет партнёра от имени пользователя"
            : "Режим просмотра: вы просматриваете личный кабинет от имени пользователя"}
        </span>
        </div>
        <div className="flex w-full min-w-0 shrink-0 items-stretch gap-2 sm:w-auto sm:items-center sm:justify-start">
        <button
          type="button"
          onClick={handleStopImpersonation}
          disabled={loading}
          className="min-w-0 flex-1 rounded-lg bg-white px-3 py-2 text-center text-sm font-medium leading-snug text-yellow-600 shadow-md transition-colors hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-50 sm:flex-initial sm:px-4 sm:text-left sm:text-base"
        >
          {loading ? (
            <span className="flex items-center gap-2">
              <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              Выход...
            </span>
          ) : (
            "Вернуться в админ-панель"
          )}
        </button>
        <button
          type="button"
          onClick={() => setDismissed(true)}
          className="shrink-0 rounded-lg p-1.5 transition-colors hover:bg-yellow-600"
          title="Скрыть баннер"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
        </div>
      </div>
    </div>
  );
}

