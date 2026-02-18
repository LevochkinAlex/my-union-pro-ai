"use client";

import { useEffect, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { signIn, useSession, getSession } from "next-auth/react";

/**
 * Страница успешной авторизации через Telegram
 * Автоматически авторизует пользователя по временному токену
 */
function TelegramSuccessContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { update: updateSession } = useSession();
  const [error, setError] = useState<string | null>(null);
  const [showInstructions, setShowInstructions] = useState(false);

  useEffect(() => {
    const token = searchParams.get("token");
    const checkTelegram = searchParams.get("check");

    // Если нужно проверить Telegram (старая логика), показываем инструкции
    if (checkTelegram === "true" && !token) {
      setShowInstructions(true);
      return;
    }

    if (!token) {
      setError("Токен авторизации не найден. Проверьте Telegram бот для получения ссылки.");
      setShowInstructions(true);
      return;
    }

    // Авторизуем пользователя по токену автоматически
    const authenticate = async () => {
      let result;
      try {
        console.log("[Telegram Success] Попытка авторизации по токену");
        result = await signIn("login-token", {
          loginToken: token,
          redirect: false,
        });
      } catch (err) {
        console.error("[Telegram Success] Ошибка:", err);
        setError("Произошла ошибка. Попробуйте использовать кнопку в Telegram боте.");
        setShowInstructions(true);
        return;
      }

      // Обрабатываем результат авторизации вне try-catch
      if (result?.error) {
        console.error("[Telegram Success] Ошибка авторизации:", result.error);
        setError("Ошибка авторизации. Попробуйте использовать кнопку в Telegram боте.");
        setShowInstructions(true);
      } else if (result?.ok) {
        console.log("[Telegram Success] Авторизация успешна, редирект в dashboard");
        // Обновляем сессию на клиенте
        await updateSession();
        // Успешная авторизация - редирект в dashboard
        // Используем задержку 1.5 секунды, чтобы cookie сессии успел установиться
        setTimeout(async () => {
          console.log("[Telegram Success] Выполняем редирект в dashboard");
          // Проверяем сессию перед редиректом
          const session = await getSession();
          if (session?.user?.id) {
            console.log("[Telegram Success] Сессия подтверждена, редирект");
            window.location.href = "/dashboard";
          } else {
            console.warn("[Telegram Success] Сессия не найдена, повторная попытка через 1 секунду");
            setTimeout(() => {
              window.location.href = "/dashboard";
            }, 1000);
          }
        }, 1500);
      }
    };

    authenticate();
  }, [searchParams, router]);

  // Показываем инструкцию проверить Telegram
  if (showInstructions) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen px-4">
        <div className="text-center max-w-md">
          <div className="mb-6">
            <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-blue-100 dark:bg-blue-900/30">
              <svg className="w-10 h-10 text-blue-600 dark:text-blue-400" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm5.562 8.161l-1.702 8.008c-.128.568-.473.706-.957.44l-2.644-1.947-1.275 1.227c-.141.141-.259.259-.533.259l.19-2.706 4.906-4.432c.213-.19-.046-.295-.33-.105l-6.062 3.817-2.612-.816c-.568-.178-.58-.568.119-.841l10.213-3.937c.473-.178.887.105.733.841z"/>
              </svg>
            </div>
          </div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-3">
            Проверьте Telegram! 📱
          </h1>
          <p className="text-gray-600 dark:text-gray-400 mb-6">
            {error 
              ? "Автоматическая авторизация не удалась. Используйте кнопку в Telegram боте."
              : "Мы отправили вам сообщение с кнопкой для входа в личный кабинет. Вы также будете авторизованы автоматически через несколько секунд."}
          </p>
          {error && (
            <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4 mb-6">
              <p className="text-sm text-red-700 dark:text-red-400">
                {error}
              </p>
            </div>
          )}
          <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4 mb-6">
            <p className="text-sm text-blue-700 dark:text-blue-400">
              <b>💡 Что делать дальше:</b><br/>
              1. Откройте Telegram<br/>
              2. Найдите сообщение от бота @myunionpro_bot<br/>
              3. Нажмите на кнопку "Войти в личный кабинет"
            </p>
          </div>
          <a
            href="https://t.me/myunionpro_bot"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-block px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors mb-3"
          >
            Открыть Telegram бот
          </a>
          <div>
            <a
              href="/login"
              className="text-sm text-gray-600 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300"
            >
              Вернуться на страницу входа
            </a>
          </div>
        </div>
      </div>
    );
  }

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
          Авторизация через Telegram
        </h1>
        <p className="text-gray-600 dark:text-gray-400">
          Подождите, выполняется вход в систему...
        </p>
      </div>
    </div>
  );
}

export default function TelegramSuccessPage() {
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
      <TelegramSuccessContent />
    </Suspense>
  );
}

