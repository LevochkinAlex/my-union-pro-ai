"use client";

import { signIn, useSession, getSession } from "next-auth/react";
import { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";

const TELEGRAM_BOT_ID = process.env.NEXT_PUBLIC_TELEGRAM_BOT_ID || "8321416024";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { data: session, status } = useSession();
  const [email, setEmail] = useState("");
  const [step, setStep] = useState<"input" | "email-sent">("input");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [callbackUrl, setCallbackUrl] = useState("/dashboard");
  const [devMagicLink, setDevMagicLink] = useState<string | null>(null);
  const [tgProcessing, setTgProcessing] = useState(false);

  useEffect(() => {
    if (status === "authenticated" && session?.user) {
      const raw = searchParams.get("callbackUrl");
      const url = raw ? decodeURIComponent(raw) : "/dashboard";
      router.replace(url.startsWith("/") ? url : "/dashboard");
    }
  }, [status, session, router, searchParams]);

  // Handle Telegram Login Widget hash fragment (#tgAuthResult=<payload>)
  useEffect(() => {
    if (typeof window === "undefined") return;

    const hash = window.location.hash;
    if (!hash.startsWith("#tgAuthResult=")) return;

    setTgProcessing(true);

    try {
      const rawPayload = hash.slice("#tgAuthResult=".length);
      const decodedPayload = decodeURIComponent(rawPayload);

      let data: Record<string, unknown>;
      if (decodedPayload.startsWith("{")) {
        data = JSON.parse(decodedPayload);
      } else {
        // Telegram can return base64url or base64 payload depending on flow
        const normalizedBase64 = decodedPayload
          .replace(/-/g, "+")
          .replace(/_/g, "/")
          .padEnd(Math.ceil(decodedPayload.length / 4) * 4, "=");
        const json = atob(normalizedBase64);
        data = JSON.parse(json);
      }

      console.log("[Telegram Login] Parsed tgAuthResult:", { id: data.id, username: data.username });

      const params = new URLSearchParams();
      for (const [key, val] of Object.entries(data)) {
        if (val != null) params.set(key, String(val));
      }
      params.set("source", "widget");

      // Clean URL before redirect to avoid stale ?error and hash on back nav
      window.history.replaceState(null, "", window.location.pathname);
      window.location.href = `/api/auth/telegram/callback?${params.toString()}`;
    } catch (e) {
      console.error("[Telegram Login] Failed to parse tgAuthResult:", e);
      setTgProcessing(false);
      setError("Ошибка авторизации через Telegram. Попробуйте снова.");
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined" || tgProcessing) return;

    // Don't show errors if we're processing tgAuthResult
    if (window.location.hash.startsWith("#tgAuthResult=")) return;

    const params = new URLSearchParams(window.location.search);
    const callback = params.get("callbackUrl");
    if (callback) setCallbackUrl(decodeURIComponent(callback));

    const err = params.get("error");
    if (err === "link_used_or_expired") {
      setError("Ссылка для входа уже использована или истекла. Запросите новую.");
    } else if (err === "invalid_token" || err === "token_expired" || err === "token_used") {
      setError("Ссылка недействительна или уже использована. Запросите новую.");
    } else if (err === "missing_params" || err === "invalid_signature") {
      setError("Ошибка авторизации через Telegram. Попробуйте снова.");
    } else if (err === "data_outdated") {
      setError("Сессия Telegram истекла. Попробуйте снова.");
    } else if (err === "server_error" || err === "server_config") {
      setError("Ошибка сервера. Попробуйте позже или войдите по Email.");
    }
  }, [tgProcessing]);

  const handleTelegramLogin = () => {
    const origin = window.location.origin;
    // Return to /login so browser hash is handled client-side first.
    // Callback endpoint cannot read URL hash fragments.
    const returnTo = `${origin}/login`;
    const url =
      `https://oauth.telegram.org/auth?bot_id=${TELEGRAM_BOT_ID}` +
      `&origin=${encodeURIComponent(origin)}` +
      `&return_to=${encodeURIComponent(returnTo)}`;
    window.location.href = url;
  };

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

  if (status === "loading" || tgProcessing) {
    return (
      <div className="flex flex-col flex-1 w-full items-center justify-center min-h-[50vh]">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-r-transparent" />
        <p className="mt-4 text-sm text-muted-foreground">
          {tgProcessing ? "Авторизация через Telegram..." : "Загрузка..."}
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col flex-1 w-full">
      <div className="flex flex-col justify-center flex-1 w-full max-w-md px-8 mx-auto">
        <div>
          <div className="mb-10">
            <h1 className="mb-3 text-3xl font-bold text-gray-900 dark:text-white">
              Вход в систему
            </h1>
            <p className="text-base text-gray-600 dark:text-gray-400">
              {step === "email-sent"
                ? "Проверьте вашу почту"
                : "Выберите способ входа"}
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
                      <>Email не отправлен (SMTP не настроен)<br/>Используйте ссылку ниже:</>
                    ) : (
                      <>Мы отправили ссылку для входа на<br/><strong>{email}</strong></>
                    )}
                  </p>

                  {devMagicLink && (
                    <div className="mt-4 mb-6">
                      <a
                        href={devMagicLink}
                        className="inline-flex items-center gap-2 px-6 py-3 bg-green-600 hover:bg-green-700 text-white font-medium rounded-lg transition-colors"
                      >
                        Войти сейчас
                      </a>
                      <p className="mt-3 text-xs text-gray-500 dark:text-gray-500 break-all">
                        {devMagicLink}
                      </p>
                    </div>
                  )}

                  <p className="text-sm text-gray-500 dark:text-gray-500">
                    Ссылка действительна 15 минут
                  </p>
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
              <>
                {/* Telegram — primary */}
                <button
                  type="button"
                  onClick={handleTelegramLogin}
                  className="w-full flex items-center justify-center gap-3 px-4 py-4 bg-[#0088cc] hover:bg-[#0077b5] text-white font-medium rounded-xl transition-colors text-lg"
                >
                  <svg className="w-6 h-6 flex-shrink-0" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm5.562 8.161c-.18 1.897-.962 6.502-1.359 8.627-.168.9-.5 1.201-.82 1.23-.697.064-1.226-.461-1.901-.903-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.139-5.062 3.345-.479.329-.913.489-1.302.481-.428-.009-1.252-.242-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.831-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635.099-.002.321.023.465.141.121.1.154.234.17.331.015.098.034.321.019.496z"/>
                  </svg>
                  Войти с Telegram
                </button>

                {/* Divider */}
                <div className="relative my-6">
                  <div className="absolute inset-0 flex items-center">
                    <div className="w-full border-t border-gray-200 dark:border-gray-700" />
                  </div>
                  <div className="relative flex justify-center text-sm">
                    <span className="px-4 bg-white dark:bg-gray-800 text-gray-500 dark:text-gray-400">или</span>
                  </div>
                </div>

                {/* Email — secondary */}
                <form onSubmit={handleEmailSubmit} className="space-y-4">
                  <div>
                    <label
                      htmlFor="email"
                      className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2"
                    >
                      Email
                    </label>
                    <input
                      id="email"
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="email@example.com"
                      required
                      className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-colors bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                    />
                    <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                      Отправим ссылку для входа на email
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

                {/* Госуслуги (disabled) */}
                <div className="mt-6">
                  <span
                    title="Скоро"
                    className="w-full flex items-center justify-center gap-3 px-4 py-3 bg-transparent opacity-60 cursor-not-allowed text-gray-400 dark:text-gray-500 font-medium rounded-lg border-2 border-gray-300 dark:border-gray-600"
                  >
                    <img
                      src="/gosusligi-logo.svg"
                      alt="Госуслуги"
                      className="w-6 h-6 flex-shrink-0 object-contain dark:brightness-0 dark:invert opacity-70"
                    />
                    <span>Войти через Госуслуги</span>
                  </span>
                </div>
              </>
            )}

            <div className="mt-5 text-center space-y-2">
              <p className="text-sm text-gray-700 dark:text-gray-400">
                Нет аккаунта?{" "}
                <span className="text-gray-500 dark:text-gray-500">
                  Регистрация происходит автоматически при первом входе
                </span>
              </p>
              <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-sm">
                <a
                  href="https://t.me/myunionpro_bot"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 underline"
                >
                  Проблема с регистрацией?
                </a>
                <a
                  href="/privacy"
                  className="text-gray-600 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300 underline"
                >
                  Политика конфиденциальности
                </a>
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
                <div className="mb-4 inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-blue-500 border-r-transparent"></div>
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
