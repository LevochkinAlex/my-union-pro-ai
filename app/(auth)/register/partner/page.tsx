"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";

const inputClass =
  "mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-gray-900 shadow-sm placeholder:text-gray-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/30 dark:border-gray-600 dark:bg-gray-800 dark:text-white dark:placeholder:text-gray-500";

const labelClass = "block text-sm font-medium text-gray-700 dark:text-gray-300";

function PartnerRegisterForm() {
  const searchParams = useSearchParams();
  const inviteFromUrl = searchParams.get("invite")?.trim() ?? "";

  const [companyName, setCompanyName] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [inviteToken, setInviteToken] = useState<string | null>(null);
  const [inviteLoading, setInviteLoading] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [inviteLoginSuggested, setInviteLoginSuggested] = useState(false);

  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (!inviteFromUrl) {
      setInviteToken(null);
      return;
    }
    setInviteToken(inviteFromUrl);
    setInviteLoading(true);
    setInviteError(null);
    setInviteLoginSuggested(false);
    const q = encodeURIComponent(inviteFromUrl);
    fetch(`/api/auth/partner-register/invite-info?invite=${q}`)
      .then(async (res) => {
        const data = (await res.json()) as {
          ok?: boolean;
          error?: string;
          loginSuggested?: boolean;
          email?: string;
          companyName?: string;
          contactNameHint?: string | null;
        };
        if (!res.ok || !data.ok) {
          setInviteError(typeof data.error === "string" ? data.error : "Ссылка недействительна");
          setInviteLoginSuggested(Boolean(data.loginSuggested));
          return;
        }
        setInviteLoginSuggested(false);
        if (data.email) setEmail(data.email);
        if (data.companyName) setCompanyName(data.companyName);
        if (data.contactNameHint) setName(data.contactNameHint);
      })
      .catch(() => setInviteError("Не удалось проверить ссылку приглашения"))
      .finally(() => setInviteLoading(false));
  }, [inviteFromUrl]);

  const isInviteMode = Boolean(inviteToken && !inviteError && !inviteLoginSuggested);

  const cabinetAlreadyRegistered =
    Boolean(inviteFromUrl) && !inviteLoading && inviteLoginSuggested && Boolean(inviteError);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const payload: Record<string, string> = {
        email: email.trim().toLowerCase(),
        name: name.trim(),
      };
      if (isInviteMode && inviteToken) {
        payload.inviteToken = inviteToken;
      } else {
        payload.companyName = companyName.trim();
      }

      const response = await fetch("/api/auth/partner-register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = (await response.json()) as {
        ok?: boolean;
        error?: string;
      };

      if (!response.ok || !data.ok) {
        setError(
          typeof data.error === "string" && data.error
            ? data.error
            : "Не удалось создать аккаунт"
        );
        return;
      }

      setSuccess(true);
    } catch {
      setError("Произошла ошибка сети. Проверьте подключение и попробуйте снова.");
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <div className="flex flex-col flex-1 w-full">
        <div className="flex flex-col justify-center flex-1 w-full max-w-md px-8 mx-auto py-8">
          <div className="rounded-xl border border-gray-200 bg-gray-50 p-8 shadow-sm dark:border-gray-700 dark:bg-gray-900/40">
            <div className="text-center">
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-blue-100 dark:bg-blue-900/30 mb-4">
                <svg
                  className="w-8 h-8 text-blue-600 dark:text-blue-400"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                  aria-hidden
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M5 13l4 4L19 7"
                  />
                </svg>
              </div>
              <p className="text-gray-900 dark:text-white font-medium mb-6">
                Аккаунт создан! Войдите через email.
              </p>
              <Link
                href="/login"
                className="inline-flex justify-center rounded-lg bg-blue-600 px-6 py-3 text-sm font-medium text-white hover:bg-blue-700 transition-colors"
              >
                Перейти ко входу
              </Link>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col flex-1 w-full">
      <div className="flex flex-col justify-center flex-1 w-full max-w-md px-8 mx-auto py-8">
        <div className="rounded-xl border border-gray-200 bg-gray-50 p-8 shadow-sm dark:border-gray-700 dark:bg-gray-900/40">
          <div className="mb-8 text-center">
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
              Регистрация партнёра
            </h1>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              {isInviteMode
                ? "Завершите регистрацию кабинета по приглашению администратора"
                : "Создайте учётную запись для управления площадками"}
            </p>
          </div>

          {inviteFromUrl && inviteLoading ? (
            <p className="text-center text-sm text-gray-600 dark:text-gray-400">Проверка ссылки…</p>
          ) : null}

          {cabinetAlreadyRegistered ? (
            <div
              className="mb-6 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-200"
              role="status"
            >
              <p className="mb-4">{inviteError}</p>
              <Link
                href="/login?callbackUrl=%2Fpartner-dashboard"
                className="inline-flex w-full justify-center rounded-lg bg-blue-600 px-4 py-3 text-sm font-medium text-white hover:bg-blue-700 transition-colors"
              >
                Войти в кабинет партнёра
              </Link>
            </div>
          ) : inviteError ? (
            <div
              className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-400"
              role="alert"
            >
              {inviteError}
            </div>
          ) : null}

          {error ? (
            <div
              className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-400"
              role="alert"
            >
              {error}
            </div>
          ) : null}

          <form
            onSubmit={handleSubmit}
            className={`space-y-4 ${cabinetAlreadyRegistered ? "hidden" : ""}`}
            aria-hidden={cabinetAlreadyRegistered}
          >
            <div>
              <label htmlFor="companyName" className={labelClass}>
                Название компании {!isInviteMode ? <span className="text-red-500">*</span> : null}
              </label>
              <input
                id="companyName"
                name="companyName"
                type="text"
                required={!isInviteMode}
                readOnly={isInviteMode}
                autoComplete="organization"
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                className={`${inputClass} ${isInviteMode ? "bg-gray-100 dark:bg-gray-900/50" : ""}`}
                placeholder="ООО «Пример»"
              />
              {isInviteMode ? (
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                  Название задано в карточке партнёра администратором.
                </p>
              ) : null}
            </div>
            <div>
              <label htmlFor="contactName" className={labelClass}>
                Имя контактного лица <span className="text-red-500">*</span>
              </label>
              <input
                id="contactName"
                name="name"
                type="text"
                required
                autoComplete="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className={inputClass}
                placeholder="Иван Иванов"
              />
            </div>
            <div>
              <label htmlFor="email" className={labelClass}>
                Email <span className="text-red-500">*</span>
              </label>
              <input
                id="email"
                name="email"
                type="email"
                required
                readOnly={isInviteMode}
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className={`${inputClass} ${isInviteMode ? "bg-gray-100 dark:bg-gray-900/50" : ""}`}
                placeholder="you@company.ru"
              />
            </div>

            <button
              type="submit"
              disabled={
                loading ||
                (Boolean(inviteFromUrl) && inviteLoading) ||
                Boolean(inviteError && !inviteLoginSuggested)
              }
              className="w-full rounded-lg bg-blue-600 px-4 py-3 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50 transition-colors"
            >
              {loading ? "Создание..." : "Создать аккаунт"}
            </button>
          </form>

          {!cabinetAlreadyRegistered ? (
            <p className="mt-8 text-center text-sm text-gray-600 dark:text-gray-400">
              Уже есть аккаунт?{" "}
              <Link
                href="/login?callbackUrl=%2Fpartner-dashboard"
                className="font-medium text-blue-600 hover:text-blue-700 dark:text-blue-400"
              >
                Войти
              </Link>
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export default function PartnerRegisterPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-[40vh] items-center justify-center text-gray-600 dark:text-gray-400">
          Загрузка…
        </div>
      }
    >
      <PartnerRegisterForm />
    </Suspense>
  );
}
