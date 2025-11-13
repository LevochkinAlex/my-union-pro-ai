"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Input from "@/components/ui/InputField";
import Label from "@/components/form/Label";
import Button from "@/components/ui/button/Button";
import { signIn } from "next-auth/react";

export default function RegisterPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState<"email" | "verify">("email");
  const [verificationCode, setVerificationCode] = useState("");
  const [agreedToPolicy, setAgreedToPolicy] = useState(false);
  const [showPolicyModal, setShowPolicyModal] = useState(false);

  const handleEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!agreedToPolicy) {
      setError("Необходимо согласиться с политикой конфиденциальности");
      return;
    }

    setLoading(true);

    try {
      const response = await fetch("/api/auth/register/send-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error || "Ошибка отправки кода");
        return;
      }

      setStep("verify");
    } catch {
      setError("Произошла ошибка");
    } finally {
      setLoading(false);
    }
  };

  const handleVerifySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const response = await fetch("/api/auth/register/verify-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, code: verificationCode }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error || "Неверный код");
        return;
      }

      if (!data?.temporaryPassword) {
        setError(
          "Регистрация прошла, но не удалось получить временный пароль. Проверьте почту и войдите вручную.",
        );
        return;
      }

      const signInResult = await signIn("credentials", {
        email,
        password: data.temporaryPassword,
        redirect: false,
      });

      if (signInResult?.error || !signInResult?.ok) {
        setError(
          "Регистрация прошла, но не удалось выполнить вход. Проверьте почту и войдите вручную.",
        );
        return;
      }

      router.push("/dashboard");
      router.refresh();
    } catch {
      setError("Произошла ошибка");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col flex-1 w-full lg:w-1/2">
      <div className="flex flex-col justify-center flex-1 w-full max-w-md px-5 mx-auto">
        <div>
          <div className="mb-8">
            <h1 className="mb-2 font-semibold text-gray-800 text-title-md dark:text-white/90">
              {step === "email" ? "Регистрация" : "Подтверждение email"}
            </h1>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              {step === "email"
                ? "Введите ваш email для регистрации"
                : "Введите код из письма, отправленного на вашу почту"}
            </p>
          </div>

          {error && (
            <div className="p-4 mb-6 text-sm rounded-lg bg-error-50 text-error-700 dark:bg-error-500/10 dark:text-error-400">
              {error}
            </div>
          )}

          {step === "email" ? (
            <form onSubmit={handleEmailSubmit}>
              <div className="space-y-6">
                <div>
                  <Label>
                    Email <span className="text-error-500">*</span>
                  </Label>
                  <Input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="your@email.com"
                    required
                  />
                </div>

                <div className="flex items-start gap-3">
                  <input
                    type="checkbox"
                    id="policy-agree"
                    checked={agreedToPolicy}
                    onChange={(e) => setAgreedToPolicy(e.target.checked)}
                    className="mt-1 w-4 h-4 rounded border-gray-300 text-brand-600 focus:ring-2 focus:ring-brand-500 cursor-pointer"
                  />
                  <label htmlFor="policy-agree" className="text-sm text-gray-600 dark:text-gray-400 cursor-pointer">
                    Я согласен с{" "}
                    <button
                      type="button"
                      onClick={() => setShowPolicyModal(true)}
                      className="text-brand-500 hover:text-brand-600 dark:text-brand-400 underline"
                    >
                      политикой конфиденциальности
                    </button>
                    {" "}и обработкой персональных данных
                  </label>
                </div>

                <div>
                  <Button
                    type="submit"
                    className="w-full"
                    size="sm"
                    disabled={loading || !agreedToPolicy}
                  >
                    {loading ? "Отправка..." : "Продолжить"}
                  </Button>
                </div>
              </div>
            </form>
          ) : (
            <form onSubmit={handleVerifySubmit}>
              <div className="space-y-6">
                <div>
                  <Label>
                    Код подтверждения <span className="text-error-500">*</span>
                  </Label>
                  <Input
                    type="text"
                    value={verificationCode}
                    onChange={(e) => setVerificationCode(e.target.value)}
                    placeholder="Введите 6-значный код"
                    required
                    maxLength={6}
                  />
                </div>

                <div>
                  <Button
                    type="submit"
                    className="w-full"
                    size="sm"
                    disabled={loading}
                  >
                    {loading ? "Проверка..." : "Подтвердить"}
                  </Button>
                </div>

                <div className="text-center">
                  <button
                    type="button"
                    onClick={() => setStep("email")}
                    className="text-sm text-brand-500 hover:text-brand-600 dark:text-brand-400"
                  >
                    Изменить email
                  </button>
                </div>
              </div>
            </form>
          )}

          <div className="mt-5">
            <p className="text-sm font-normal text-center text-gray-700 dark:text-gray-400">
              Уже есть аккаунт?{" "}
              <Link
                href="/login"
                className="text-brand-500 hover:text-brand-600 dark:text-brand-400"
              >
                Войти
              </Link>
            </p>
          </div>
        </div>
      </div>

      {/* Policy Modal */}
      {showPolicyModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black bg-opacity-50">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-2xl w-full max-h-[80vh] flex flex-col">
            <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                Политика конфиденциальности и обработка персональных данных
              </h2>
              <button
                onClick={() => setShowPolicyModal(false)}
                className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="overflow-y-auto flex-1 p-6 space-y-4 text-sm text-gray-700 dark:text-gray-300">
              <section>
                <h3 className="font-semibold text-gray-900 dark:text-white mb-2">1. Введение</h3>
                <p>
                  Данная политика конфиденциальности описывает, как мы собираем, используем и защищаем ваши персональные данные 
                  при регистрации и использовании нашего приложения.
                </p>
              </section>

              <section>
                <h3 className="font-semibold text-gray-900 dark:text-white mb-2">2. Собираемые данные</h3>
                <p>Мы собираем следующие категории персональных данных:</p>
                <ul className="list-disc list-inside mt-2 space-y-1">
                  <li>Адрес электронной почты</li>
                  <li>Фамилия, имя, отчество</li>
                  <li>Дата рождения</li>
                  <li>Номер телефона</li>
                  <li>Адрес проживания</li>
                  <li>Должность и сведения о работе</li>
                  <li>Профессия и образование</li>
                </ul>
              </section>

              <section>
                <h3 className="font-semibold text-gray-900 dark:text-white mb-2">3. Использование данных</h3>
                <p>Ваши персональные данные используются для:</p>
                <ul className="list-disc list-inside mt-2 space-y-1">
                  <li>Регистрации и управления учетной записью</li>
                  <li>Обработки заявлений на вступление в профсоюз</li>
                  <li>Подготовки необходимых документов</li>
                  <li>Коммуникации с вами о вашей учетной записи</li>
                  <li>Обеспечения безопасности и предотвращения мошенничества</li>
                </ul>
              </section>

              <section>
                <h3 className="font-semibold text-gray-900 dark:text-white mb-2">4. Защита данных</h3>
                <p>
                  Мы применяем технические и организационные меры для защиты ваших персональных данных от несанкционированного доступа, 
                  изменения, раскрытия или уничтожения. Ваш пароль хранится в зашифрованном виде.
                </p>
              </section>

              <section>
                <h3 className="font-semibold text-gray-900 dark:text-white mb-2">5. Ваши права</h3>
                <p>Вы имеете право:</p>
                <ul className="list-disc list-inside mt-2 space-y-1">
                  <li>Получать информацию о ваших персональных данных</li>
                  <li>Требовать исправление неточных данных</li>
                  <li>Требовать удаление ваших данных (право быть забытым)</li>
                  <li>Возражать против обработки ваших данных</li>
                </ul>
              </section>

              <section>
                <h3 className="font-semibold text-gray-900 dark:text-white mb-2">6. Контактная информация</h3>
                <p>
                  Если у вас есть вопросы о защите ваших персональных данных, пожалуйста, свяжитесь с нашей администрацией.
                </p>
              </section>
            </div>

            <div className="flex justify-end gap-3 p-6 border-t border-gray-200 dark:border-gray-700">
              <button
                onClick={() => setShowPolicyModal(false)}
                className="px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 font-medium"
              >
                Закрыть
              </button>
              <button
                onClick={() => {
                  setAgreedToPolicy(true);
                  setShowPolicyModal(false);
                }}
                className="px-4 py-2 rounded-lg bg-brand-600 text-white hover:bg-brand-700 font-medium"
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

