"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Input from "@/components/form/input/InputField";
import Label from "@/components/form/Label";
import Button from "@/components/ui/button/Button";

export default function RegisterPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState<"email" | "verify">("email");
  const [verificationCode, setVerificationCode] = useState("");

  const handleEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
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
    } catch (error) {
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

      // Пользователь создан, перенаправляем в личный кабинет
      router.push("/dashboard");
    } catch (error) {
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

                <div>
                  <Button
                    type="submit"
                    className="w-full"
                    size="sm"
                    disabled={loading}
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
    </div>
  );
}

