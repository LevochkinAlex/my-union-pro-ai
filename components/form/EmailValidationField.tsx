"use client";

import { useState, useEffect } from "react";

interface EmailValidationFieldProps {
  email: string;
  emailVerified: Date | null;
  onEmailChange: (email: string) => void;
  onVerified: () => void;
  /** Фамилия и имя в форме профиля / анкеты — без них нельзя запросить код (см. API). */
  firstName?: string;
  lastName?: string;
  /** Связка профиля с BestBenefits (скидки у партнёров). Без этого подтверждённый email не означает доступ к активации промокодов. */
  bestBenefitsLinked?: boolean;
}

export default function EmailValidationField({
  email,
  emailVerified,
  onEmailChange,
  onVerified,
  firstName,
  lastName,
  bestBenefitsLinked,
}: EmailValidationFieldProps) {
  const nameGate =
    firstName !== undefined && lastName !== undefined;
  const namesFilled =
    Boolean(String(firstName ?? "").trim()) && Boolean(String(lastName ?? "").trim());
  const canStartEmailValidation = !nameGate || namesFilled;
  const [mode, setMode] = useState<"initial" | "pin-sent" | "verified">(
    emailVerified ? "verified" : "initial"
  );
  const [pin, setPin] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Синхронизация состояния с prop emailVerified
  useEffect(() => {
    if (emailVerified) {
      setMode("verified");
    } else if (mode === "verified" && !emailVerified) {
      // Если emailVerified стал null, возвращаемся в initial режим
      setMode("initial");
    }
  }, [emailVerified]);

  // Отправка PIN на email
  const handleSendPin = async () => {
    if (!email) {
      setError("Введите email");
      return;
    }
    if (nameGate && !namesFilled) {
      setError("Сначала укажите фамилию и имя в форме профиля.");
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      setError("Некорректный email адрес");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const response = await fetch("/api/auth/email/send-pin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          ...(nameGate ? { firstName, lastName } : {}),
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error || "Ошибка при отправке кода");
        return;
      }

      setMode("pin-sent");
      setPin("");
    } catch (err) {
      console.error("Failed to send PIN:", err);
      setError("Не удалось отправить код. Попробуйте позже.");
    } finally {
      setLoading(false);
    }
  };

  // Проверка PIN
  const handleVerifyPin = async () => {
    if (!pin || pin.length !== 6) {
      setError("Введите 6-значный код");
      return;
    }
    if (nameGate && !namesFilled) {
      setError("Сначала укажите фамилию и имя в форме профиля.");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const response = await fetch("/api/auth/email/verify-pin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          pin,
          ...(nameGate ? { firstName, lastName } : {}),
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error || "Неверный код");
        return;
      }

      // Успешная верификация
      setMode("verified");
      onVerified();
    } catch (err) {
      console.error("Failed to verify PIN:", err);
      setError("Ошибка при проверке кода");
    } finally {
      setLoading(false);
    }
  };

  // Изменение email (сброс состояния)
  const handleChangeEmail = () => {
    setMode("initial");
    setPin("");
    setError("");
  };

  return (
    <div>
      <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
        Email <span className="text-red-500">*</span>
        {mode === "verified" && (
          <span className="ml-2 text-xs text-green-600 dark:text-green-400">
            Подтвержден
          </span>
        )}
        {mode === "pin-sent" && (
          <span className="ml-2 text-xs text-orange-600 dark:text-orange-400">
            Ожидает подтверждения
          </span>
        )}
      </label>

      {mode === "initial" || mode === "verified" ? (
        // Режим ввода email
        <>
          <div className="flex flex-col sm:flex-row gap-2 items-stretch sm:items-start">
            <input
              type="email"
              value={email || ""}
              onChange={(e) => onEmailChange(e.target.value)}
              placeholder="example@mail.com"
              disabled={mode === "verified"}
              className="flex-1 min-w-0 h-11 appearance-none rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm text-gray-900 shadow-sm transition-colors placeholder:text-gray-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 disabled:opacity-50 disabled:cursor-not-allowed dark:border-gray-600 dark:bg-gray-800 dark:text-white dark:placeholder:text-gray-400"
            />
            {mode === "initial" && (
              <button
                type="button"
                onClick={handleSendPin}
                disabled={
                  loading ||
                  !email ||
                  !email.trim() ||
                  !canStartEmailValidation
                }
                className="h-11 px-4 py-2.5 text-sm bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg transition-colors whitespace-nowrap flex-shrink-0 w-full sm:w-auto"
              >
                {loading ? "Отправка..." : "Валидировать"}
              </button>
            )}
          </div>
          {mode === "verified" && (
            <>
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                Email подтверждён. Изменение адреса недоступно. Подтверждённый адрес используется для входа и сервисных уведомлений.
              </p>
              {bestBenefitsLinked === true && (
                <p className="mt-1 text-xs text-green-600 dark:text-green-400">
                  Скидки у партнёров: аккаунт BestBenefits связан с профилем — можно активировать промокоды в разделе «Скидки».
                </p>
              )}
              {bestBenefitsLinked === false && (
                <p className="mt-1 text-xs text-amber-700 dark:text-amber-300">
                  Скидки у партнёров: связка с BestBenefits пока не создана. Если имя и фамилия уже указаны в профиле, нажмите «Сохранить изменения» — подключение к партнёрским скидкам выполнится автоматически. Иначе заполните ФИО и сохраните профиль. При повторных ошибках обратитесь в поддержку.
                </p>
              )}
              <p className="mt-1 text-xs text-green-600 dark:text-green-400">
                Email {email} подтверждён
              </p>
            </>
          )}
        </>
      ) : (
        // Режим ввода PIN
        <div className="space-y-2">
          <div className="flex flex-col sm:flex-row gap-2">
            <input
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={6}
              value={pin}
              onChange={(e) => {
                const value = e.target.value.replace(/\D/g, "");
                setPin(value);
                // Автоматическая проверка при вводе 6 цифр
                if (value.length === 6 && !canStartEmailValidation) {
                  setError("Сначала укажите фамилию и имя в профиле.");
                  return;
                }
                if (value.length === 6 && canStartEmailValidation) {
                  setPin(value);
                  // Небольшая задержка для UX
                  setTimeout(() => {
                    setLoading(true);
                    fetch("/api/auth/email/verify-pin", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({
                        email,
                        pin: value,
                        ...(nameGate ? { firstName, lastName } : {}),
                      }),
                    })
                      .then((res) => res.json())
                      .then((data) => {
                        if (data.success) {
                          setMode("verified");
                          onVerified();
                          setError("");
                        } else {
                          setError(data.error || "Неверный код");
                        }
                      })
                      .catch(() => {
                        setError("Ошибка при проверке кода");
                      })
                      .finally(() => {
                        setLoading(false);
                      });
                  }, 100);
                }
              }}
              placeholder="Введите 6-значный код"
              className="flex-1 h-11 appearance-none rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm text-center text-gray-900 shadow-sm transition-colors placeholder:text-gray-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 disabled:opacity-50 disabled:cursor-not-allowed dark:border-gray-600 dark:bg-gray-800 dark:text-white dark:placeholder:text-gray-400"
            />
            <button
              type="button"
              onClick={handleSendPin}
              disabled={loading || !canStartEmailValidation}
              className="h-11 px-4 py-2.5 text-sm bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white rounded-lg transition-colors whitespace-nowrap w-full sm:w-auto"
            >
              {loading ? "Отправка..." : "Отправить повторно"}
            </button>
          </div>
          
          <div className="flex items-center justify-between">
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Код отправлен на {email}
            </p>
            <button
              type="button"
              onClick={handleChangeEmail}
              className="text-xs text-blue-600 dark:text-blue-400 hover:underline"
            >
              Изменить почту
            </button>
          </div>
        </div>
      )}

      {error && (
        <p className="mt-1 text-xs text-red-600 dark:text-red-400">{error}</p>
      )}

      {nameGate && !namesFilled && mode === "initial" && !emailVerified && (
        <p className="mt-1 text-xs text-amber-700 dark:text-amber-300">
          Сначала укажите фамилию и имя в форме выше — после этого можно запросить код подтверждения email.
        </p>
      )}
      {mode === "initial" && !emailVerified && email && canStartEmailValidation && (
        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
          Подтвердите email — он нужен для входа в сервис и восстановления доступа.
        </p>
      )}
    </div>
  );
}

