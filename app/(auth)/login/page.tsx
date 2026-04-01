"use client";

import { useSession } from "next-auth/react";
import { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import AuthTabs from "@/components/auth/AuthTabs";
import { TELEGRAM_LOGIN_HELP_URL } from "@/lib/auth-public-links";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { data: session, status } = useSession();
  const [email, setEmail] = useState("");
  const [step, setStep] = useState<"input" | "email-sent">("input");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [devMagicLink, setDevMagicLink] = useState<string | null>(null);

  useEffect(() => {
    if (status === "authenticated" && session?.user) {
      const raw = searchParams.get("callbackUrl");
      const url = raw ? decodeURIComponent(raw) : "/dashboard";
      router.replace(url.startsWith("/") ? url : "/dashboard");
    }
  }, [status, session, router, searchParams]);

  useEffect(() => {
    const err = searchParams.get("error");
    if (err === "link_used_or_expired") {
      setError("Ссылка для входа уже использована или истекла. Запросите новую.");
    } else if (err === "invalid_token" || err === "token_expired" || err === "token_used") {
      setError("Ссылка недействительна или уже использована. Запросите новую.");
    } else if (err === "email_or_phone_taken") {
      setError("Регистрация не завершена: email или телефон уже заняты. Войдите или обратитесь в поддержку.");
    } else if (err === "server_error") {
      setError("Ошибка сервера. Попробуйте позже.");
    } else if (err === "missing_token") {
      setError("Неверная ссылка.");
    }

    if (searchParams.get("registered") === "true") {
      setStep("email-sent");
      const e = searchParams.get("email");
      if (e) setEmail(decodeURIComponent(e));
    }
  }, [searchParams]);

  const handleEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      setError("Неверный формат email");
      setLoading(false);
      return;
    }

    try {
      const response = await fetch("/api/auth/email/send-magic-link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        setError(data.error || "Ошибка при отправке письма");
        setLoading(false);
        return;
      }

      if (data.devMode && data.magicLink) {
        setDevMagicLink(data.magicLink);
      }

      setStep("email-sent");
    } catch {
      setError("Ошибка сети. Проверьте подключение к интернету.");
    } finally {
      setLoading(false);
    }
  };

  if (status === "loading") {
    return (
      <div className="flex flex-col flex-1 w-full items-center justify-center min-h-[50vh]">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-r-transparent" />
        <p className="mt-4 text-sm text-muted-foreground">Загрузка...</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col flex-1 w-full">
      <div className="flex flex-col justify-center flex-1 w-full max-w-md px-8 mx-auto">
        <div>
          <AuthTabs active="login" />
          <div className="mb-10">
            <h1 className="mb-3 text-3xl font-bold text-gray-900 dark:text-white">Вход</h1>
            <p className="text-base text-gray-600 dark:text-gray-400">
              {step === "email-sent" ? "Проверьте вашу почту" : "Вход по email без пароля"}
            </p>
          </div>

          <div>
            {error && (
              <div className="p-4 mb-4 text-sm rounded-lg bg-red-50 text-red-700 border border-red-200 dark:bg-red-900/20 dark:text-red-400 dark:border-red-800">
                {error}
              </div>
            )}

            {step === "email-sent" && (
              <div className="text-center py-8">
                <div className="mb-6">
                  <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-blue-100 dark:bg-blue-900/30 mb-4">
                    <svg className="w-8 h-8 text-blue-600 dark:text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                    </svg>
                  </div>
                  <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
                    {devMagicLink ? "Режим разработки" : "Проверьте вашу почту"}
                  </h3>
                  <p className="text-gray-600 dark:text-gray-400 mb-4">
                    {devMagicLink ? (
                      <>SMTP не настроен — перейдите по ссылке ниже.</>
                    ) : (
                      <>
                        Мы отправили ссылку для входа на
                        <br />
                        <strong>{email}</strong>
                      </>
                    )}
                  </p>

                  {devMagicLink && (
                    <div className="mt-4 mb-6">
                      <a
                        href={devMagicLink}
                        className="inline-flex items-center gap-2 px-6 py-3 bg-green-600 hover:bg-green-700 text-white font-medium rounded-lg transition-colors"
                      >
                        Войти
                      </a>
                      <p className="mt-3 text-xs text-gray-500 dark:text-gray-500 break-all">{devMagicLink}</p>
                    </div>
                  )}

                  <p className="text-sm text-gray-500 dark:text-gray-500">Ссылка действительна 15 минут</p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setStep("input");
                    setEmail("");
                    setError("");
                    setDevMagicLink(null);
                  }}
                  className="text-sm text-gray-600 hover:text-gray-700 dark:text-gray-400"
                >
                  Изменить email
                </button>
              </div>
            )}

            {step === "input" && (
              <form onSubmit={handleEmailSubmit} className="space-y-4">
                <div>
                  <label htmlFor="email" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Email
                  </label>
                  <input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="email@example.com"
                    required
                    autoComplete="email"
                    className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-colors bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  />
                  <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                    Отправим одноразовую ссылку для входа (пароль не нужен)
                  </p>
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full px-4 py-3 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {loading ? "Отправка..." : "Продолжить"}
                </button>
              </form>
            )}

            <div className="mt-8 text-center space-y-3">
              <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-sm">
                <a
                  href={TELEGRAM_LOGIN_HELP_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-600 hover:text-blue-700 dark:text-blue-400 underline"
                  title="Откроется Telegram-бот: опишите проблему командой /issue — заявка уйдёт в техподдержку"
                >
                  Проблема с входом?
                </a>
                <Link href="/privacy" className="text-gray-600 hover:text-gray-700 dark:text-gray-400 underline">
                  Политика конфиденциальности
                </Link>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen bg-gray-50 dark:bg-gray-900">
          <div className="flex flex-1 w-full lg:w-1/2 bg-white dark:bg-gray-800">
            <div className="flex flex-col flex-1 w-full items-center justify-center">
              <div className="text-center">
                <div className="mb-4 inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-blue-500 border-r-transparent" />
                <p className="text-gray-600 dark:text-gray-400">Загрузка...</p>
              </div>
            </div>
          </div>
          <div className="hidden lg:flex lg:w-1/2 relative overflow-hidden bg-gradient-to-br from-blue-600 via-indigo-600 to-purple-700">
            <div className="relative z-10 flex items-center justify-center w-full p-12">
              <div className="text-center text-white max-w-md">
                <p className="text-xl text-white/90">Современная платформа для управления профсоюзом</p>
              </div>
            </div>
          </div>
        </div>
      }
    >
      <LoginForm />
    </Suspense>
  );
}
