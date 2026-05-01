"use client";

import { useState, useEffect, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import { backNavLinkButtonClass } from "@/lib/back-nav-link-button";
import Input from "@/components/ui/InputField";
import Label from "@/components/form/Label";
import Button from "@/components/ui/button/Button";
import { Eye, EyeOff } from "lucide-react";

function ResetPasswordContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token");

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!token) {
      setError("Неверная ссылка для восстановления пароля");
    }
  }, [token]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (password !== confirmPassword) {
      setError("Пароли не совпадают");
      return;
    }

    if (password.length < 8) {
      setError("Пароль должен содержать минимум 8 символов");
      return;
    }

    setLoading(true);

    try {
      const response = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error || "Ошибка сброса пароля");
        return;
      }

      setSuccess(true);
      setTimeout(() => {
        router.push("/login");
      }, 3000);
    } catch {
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
              Пароль успешно изменен
            </h1>
            <p className="mb-6 text-sm text-gray-500 dark:text-gray-400">
              Вы будете перенаправлены на страницу входа...
            </p>
            <Link href="/login">
              <Button size="sm">Войти сейчас</Button>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  if (!token) {
    return (
      <div className="flex flex-col flex-1 w-full lg:w-1/2">
        <div className="flex flex-col justify-center flex-1 w-full max-w-md px-5 mx-auto">
          <div className="text-center">
            <h1 className="mb-2 font-semibold text-gray-800 text-title-md dark:text-white/90">
              Неверная ссылка
            </h1>
            <p className="mb-6 text-sm text-gray-500 dark:text-gray-400">
              Ссылка для восстановления пароля недействительна или истекла
            </p>
            <Link href="/forgot-password">
              <Button size="sm">Запросить новую ссылку</Button>
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
              Новый пароль
            </h1>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Введите новый пароль для вашего аккаунта
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
                  Новый пароль <span className="text-error-500">*</span>
                </Label>
                <div className="relative">
                  <Input
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Минимум 8 символов"
                    required
                  />
                  <span
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute z-30 -translate-y-1/2 cursor-pointer right-4 top-1/2"
                  >
                      {showPassword ? (
                        <Eye className="h-5 w-5 text-gray-500 dark:text-gray-400" />
                      ) : (
                        <EyeOff className="h-5 w-5 text-gray-500 dark:text-gray-400" />
                      )}
                  </span>
                </div>
              </div>

              <div>
                <Label>
                  Подтвердите пароль <span className="text-error-500">*</span>
                </Label>
                <div className="relative">
                  <Input
                    type={showConfirmPassword ? "text" : "password"}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Повторите пароль"
                    required
                  />
                  <span
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    className="absolute z-30 -translate-y-1/2 cursor-pointer right-4 top-1/2"
                  >
                      {showConfirmPassword ? (
                        <Eye className="h-5 w-5 text-gray-500 dark:text-gray-400" />
                      ) : (
                        <EyeOff className="h-5 w-5 text-gray-500 dark:text-gray-400" />
                      )}
                  </span>
                </div>
              </div>

              <div>
                <Button
                  type="submit"
                  className="w-full"
                  size="sm"
                  disabled={loading}
                >
                  {loading ? "Сохранение..." : "Сохранить пароль"}
                </Button>
              </div>
            </div>
          </form>

          <div className="mt-5">
            <p className="text-sm font-normal text-center text-gray-700 dark:text-gray-400">
              <Link href="/login" className={`${backNavLinkButtonClass} mx-auto inline-flex`}>
                Вернуться к входу
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<div>Загрузка...</div>}>
      <ResetPasswordContent />
    </Suspense>
  );
}

