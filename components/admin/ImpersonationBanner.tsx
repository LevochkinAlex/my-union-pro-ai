"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";

export default function ImpersonationBanner() {
  const { data: session } = useSession();
  const [loading, setLoading] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const router = useRouter();

  if (!session?.user?.isImpersonating || dismissed) {
    return null;
  }

  const handleStopImpersonation = async () => {
    setLoading(true);
    try {
      if (!session?.user?.originalAdminId) {
        throw new Error("Не найден ID админа");
      }

      const adminId = session.user.originalAdminId;
      
      console.log("[Stop Impersonation] Starting restore for admin:", adminId);
      
      // Восстанавливаем сессию админа через специальный провайдер
      // Добавляем таймаут для запроса
      const timeoutPromise = new Promise<never>((_, reject) => 
        setTimeout(() => reject(new Error("Таймаут запроса")), 20000)
      );

      const signInPromise = signIn("restore-admin", {
        adminId: adminId,
        restoreToken: "restore", // Токен не проверяется строго, только для совместимости
        redirect: false,
        callbackUrl: "/admin/users",
      });

      const result = await Promise.race([signInPromise, timeoutPromise]);

      console.log("[Stop Impersonation] SignIn result:", result);

      if (result?.error) {
        console.error("[Stop Impersonation] SignIn error:", result.error);
        throw new Error(result.error);
      }

      if (!result?.ok) {
        throw new Error("Не удалось восстановить сессию админа");
      }

      // Обновляем сессию перед редиректом
      await router.refresh();
      
      // Небольшая задержка для обновления сессии
      await new Promise(resolve => setTimeout(resolve, 500));

      // Редиректим в админ-панель
      router.push("/admin/users");
    } catch (error) {
      console.error("[Stop Impersonation] Error:", error);
      const errorMessage = error instanceof Error 
        ? error.message 
        : "Ошибка при выходе из режима impersonation";
      
      // Показываем более информативное сообщение
      if (errorMessage.includes("Таймаут")) {
        alert("Превышено время ожидания. Пожалуйста, попробуйте еще раз или перезагрузите страницу.");
      } else {
        alert(`Ошибка: ${errorMessage}\n\nПопробуйте выйти из системы и войти заново.`);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-yellow-500 text-white px-4 py-3 flex items-center justify-between shadow-lg z-50 sticky top-0">
      <div className="flex items-center gap-2 flex-1">
        <svg
          className="h-5 w-5 flex-shrink-0"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
          />
        </svg>
        <span className="font-medium text-sm sm:text-base">
          Режим просмотра: Вы просматриваете личный кабинет от имени пользователя
        </span>
      </div>
      <div className="flex items-center gap-2 ml-4 flex-shrink-0">
        <button
          onClick={handleStopImpersonation}
          disabled={loading}
          className="bg-white text-yellow-600 px-4 py-2 rounded-lg hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed font-medium text-sm sm:text-base transition-colors shadow-md"
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
          onClick={() => setDismissed(true)}
          className="p-1.5 hover:bg-yellow-600 rounded-lg transition-colors"
          title="Скрыть баннер"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
    </div>
  );
}

