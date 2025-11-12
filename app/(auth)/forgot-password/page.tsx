"use client";

import { useState } from "react";
import Link from "next/link";
import Input from "@/components/form/input/InputField";
import Label from "@/components/form/Label";
import Button from "@/components/ui/button/Button";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const response = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error || "Ошибка отправки письма");
        return;
      }

      setSuccess(true);
    } catch (error) {
      setError("Произошла ошибка");
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <div className="flex flex-col flex-1 w-full lg:w-1/2">
        <div className="flex flex-col justify-center flex-1 w-full max-w-md px-5 mx-auto">
          <div className="text-center">
            <div className="mb-6">
              <div className="inline-flex items-center justify-center w-16 h-16 mb-4 rounded-full bg-success-50 dark:bg-success-500/10">
                <svg
                  className="w-8 h-8 text-success-500"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M5 13l4 4L19 7"
                  />
                </svg>
              </div>
            </div>
            <h1 className="mb-2 font-semibold text-gray-800 text-title-md dark:text-white/90">
              Письмо отправлено
            </h1>
            <p className="mb-6 text-sm text-gray-500 dark:text-gray-400">
              Инструкции по восстановлению пароля отправлены на {email}
            </p>
            <Link href="/login">
              <Button size="sm">Вернуться к входу</Button>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col flex-1 w-full lg:w-1/2">
      <div className="flex flex-col justify-center flex-1 w-full max-w-md px-5 mx-auto">
        <div>
          <div className="mb-8">
            <h1 className="mb-2 font-semibold text-gray-800 text-title-md dark:text-white/90">
              Восстановление пароля
            </h1>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Введите ваш email, и мы отправим инструкции по восстановлению пароля
            </p>
          </div>

          {error && (
            <div className="p-4 mb-6 text-sm rounded-lg bg-error-50 text-error-700 dark:bg-error-500/10 dark:text-error-400">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit}>
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
                  {loading ? "Отправка..." : "Отправить"}
                </Button>
              </div>
            </div>
          </form>

          <div className="mt-5">
            <p className="text-sm font-normal text-center text-gray-700 dark:text-gray-400">
              Вспомнили пароль?{" "}
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

