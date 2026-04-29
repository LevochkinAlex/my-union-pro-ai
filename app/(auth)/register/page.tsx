"use client";

import { useState } from "react";
import Link from "next/link";
import Input from "@/components/ui/InputField";
import Label from "@/components/form/Label";
import PhoneInput from "@/components/form/PhoneInput";
import AuthTabs from "@/components/auth/AuthTabs";
import { TELEGRAM_LOGIN_HELP_URL } from "@/lib/auth-public-links";

const labelClass = "text-gray-700 dark:text-gray-300";

export default function RegisterPage() {
  const [lastName, setLastName] = useState("");
  const [firstName, setFirstName] = useState("");
  const [middleName, setMiddleName] = useState("");
  const [phone, setPhone] = useState("");
  const [telegramUsername, setTelegramUsername] = useState("");
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [devLink, setDevLink] = useState<string | null>(null);
  const [agreedToPolicy, setAgreedToPolicy] = useState(false);
  const [showPolicyModal, setShowPolicyModal] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!agreedToPolicy) {
      setError("Необходимо согласиться с политикой конфиденциальности");
      return;
    }

    setLoading(true);
    try {
      const response = await fetch("/api/auth/register/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lastName: lastName.trim(),
          firstName: firstName.trim(),
          middleName: middleName.trim() || undefined,
          phone,
          telegramUsername: telegramUsername.trim() || undefined,
          email: email.trim().toLowerCase(),
        }),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        setError(data.error || "Ошибка отправки");
        return;
      }

      if (data.devMode && data.confirmLink) {
        setDevLink(data.confirmLink);
      }
      setSent(true);
    } catch {
      setError("Произошла ошибка сети");
    } finally {
      setLoading(false);
    }
  };

  if (sent) {
    return (
      <div className="flex flex-col flex-1 w-full">
        <div className="flex flex-col justify-center flex-1 w-full max-w-md px-8 mx-auto">
          <AuthTabs active="register" />
          <div className="text-center py-6">
            <div className="mb-6">
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-blue-100 dark:bg-blue-900/30 mb-4">
                <svg className="w-8 h-8 text-blue-600 dark:text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>
              </div>
              <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">Проверьте почту</h1>
              <p className="text-gray-600 dark:text-gray-400 mb-4">
                На <strong>{email}</strong> отправлена ссылка. Перейдите по ней — это завершит регистрацию и откроет вход в
                кабинет.
              </p>
              {devLink ? (
                <div className="mt-4 mb-6">
                  <a
                    href={devLink}
                    className="inline-flex items-center gap-2 px-6 py-3 bg-green-600 hover:bg-green-700 text-white font-medium rounded-lg transition-colors"
                  >
                    Подтвердить (dev)
                  </a>
                  <p className="mt-3 text-xs text-gray-500 dark:text-gray-500 break-all">{devLink}</p>
                </div>
              ) : null}
              <p className="text-sm text-gray-500 dark:text-gray-500">Ссылка действительна 24 часа</p>
            </div>
            <Link href="/login" className="text-sm text-blue-600 hover:text-blue-700 dark:text-blue-400 font-medium">
              На страницу входа
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col flex-1 w-full">
      <div className="flex flex-col justify-center flex-1 w-full max-w-md px-8 mx-auto py-8">
        <AuthTabs active="register" />
        <div className="mb-10">
          <h1 className="mb-3 text-3xl font-bold text-gray-900 dark:text-white">Регистрация</h1>
          <p className="text-base text-gray-600 dark:text-gray-400">
            Заполните данные. На email придёт ссылка для подтверждения — после перехода создаётся аккаунт (в т.ч. в сервисе
            льгот). Пароль не задаётся; вход — по одноразовым ссылкам на почту.
          </p>
        </div>

        {error && (
          <div className="p-4 mb-4 text-sm rounded-lg bg-red-50 text-red-700 border border-red-200 dark:bg-red-900/20 dark:text-red-400 dark:border-red-800">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <Label className={labelClass}>
                Фамилия <span className="text-red-500">*</span>
              </Label>
              <Input value={lastName} onChange={(e) => setLastName(e.target.value)} required placeholder="Иванов" />
            </div>
            <div>
              <Label className={labelClass}>
                Имя <span className="text-red-500">*</span>
              </Label>
              <Input value={firstName} onChange={(e) => setFirstName(e.target.value)} required placeholder="Иван" />
            </div>
          </div>
          <div>
            <Label className={labelClass}>Отчество</Label>
            <Input value={middleName} onChange={(e) => setMiddleName(e.target.value)} placeholder="Необязательно" />
          </div>
          <div>
            <Label className={labelClass}>
              Телефон <span className="text-red-500">*</span>
            </Label>
            <PhoneInput value={phone} onChange={setPhone} />
            <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">Полный номер, например +7 (999) 123-45-67</p>
          </div>
          <div>
            <Label className={labelClass}>Telegram</Label>
            <Input
              value={telegramUsername}
              onChange={(e) => setTelegramUsername(e.target.value.replace(/^@+/, ""))}
              placeholder="username (необязательно)"
            />
          </div>
          <div>
            <Label className={labelClass}>
              Email <span className="text-red-500">*</span>
            </Label>
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required placeholder="you@mail.ru" />
          </div>

          <div className="flex items-start gap-3 pt-1">
            <input
              type="checkbox"
              id="policy-agree"
              checked={agreedToPolicy}
              onChange={(e) => setAgreedToPolicy(e.target.checked)}
              className="mt-1 h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-2 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700"
            />
            <label htmlFor="policy-agree" className="text-sm text-gray-600 dark:text-gray-400 cursor-pointer leading-relaxed">
              Я согласен с{" "}
              <button
                type="button"
                onClick={() => setShowPolicyModal(true)}
                className="text-blue-600 hover:text-blue-700 dark:text-blue-400 underline"
              >
                политикой конфиденциальности
              </button>{" "}
              и обработкой персональных данных, а также с{" "}
              <Link href="/license" target="_blank" className="text-blue-600 hover:text-blue-700 dark:text-blue-400 underline">
                публичной офертой
              </Link>
            </label>
          </div>

          <button
            type="submit"
            disabled={loading || !agreedToPolicy}
            className="w-full px-4 py-3 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {loading ? "Отправка..." : "Зарегистрироваться"}
          </button>
        </form>

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

      {showPolicyModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 dark:bg-black/70 backdrop-blur-md">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl max-w-2xl w-full max-h-[80vh] flex flex-col border border-gray-200 dark:border-gray-700">
            <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Политика конфиденциальности</h2>
              <button
                type="button"
                onClick={() => setShowPolicyModal(false)}
                className="text-gray-500 hover:text-gray-700 dark:text-gray-400"
                aria-label="Закрыть"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="overflow-y-auto flex-1 p-6 text-sm text-gray-700 dark:text-gray-300 space-y-3">
              <p>Мы обрабатываем персональные данные в соответствии с законодательством РФ.</p>
            </div>
            <div className="flex justify-end gap-3 p-6 border-t border-gray-200 dark:border-gray-700">
              <button
                type="button"
                onClick={() => setShowPolicyModal(false)}
                className="px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover-surface"
              >
                Закрыть
              </button>
              <button
                type="button"
                onClick={() => {
                  setAgreedToPolicy(true);
                  setShowPolicyModal(false);
                }}
                className="px-4 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700"
              >
                Согласен
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
