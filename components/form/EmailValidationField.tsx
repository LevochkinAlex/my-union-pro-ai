"use client";

import { useState, useEffect } from "react";

interface EmailValidationFieldProps {
  email: string;
  emailVerified: Date | null;
  onEmailChange: (email: string) => void;
  onVerified: () => void;
}

export default function EmailValidationField({
  email,
  emailVerified,
  onEmailChange,
  onVerified,
}: EmailValidationFieldProps) {
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
        body: JSON.stringify({ email }),
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

    setLoading(true);
    setError("");

    try {
      const response = await fetch("/api/auth/email/verify-pin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, pin }),
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
            ✓ Подтвержден
          </span>
        )}
        {mode === "pin-sent" && (
          <span className="ml-2 text-xs text-orange-600 dark:text-orange-400">
            ⚠ Ожидает подтверждения
          </span>
        )}
      </label>

      {mode === "initial" || mode === "verified" ? (
        // Режим ввода email
        <>
          <div className="flex gap-2 items-start">
            <input
              type="email"
              value={email || ""}
              onChange={(e) => onEmailChange(e.target.value)}
              placeholder="example@mail.com"
              disabled={mode === "verified"}
              className="flex-1 h-11 appearance-none rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm text-gray-900 shadow-sm transition-colors placeholder:text-gray-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 disabled:opacity-50 disabled:cursor-not-allowed dark:border-gray-600 dark:bg-gray-800 dark:text-white dark:placeholder:text-gray-400"
            />
            {mode === "initial" && (
              <button
                type="button"
                onClick={handleSendPin}
                disabled={loading || !email || !email.trim()}
                className="h-11 px-4 py-2.5 text-sm bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg transition-colors whitespace-nowrap"
              >
                {loading ? "Отправка..." : "Валидировать"}
              </button>
            )}
          </div>
          {mode === "verified" && (
            <>
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                💡 Email подтвержден и используется для доступа к скидкам от партнеров. Изменение невозможно.
              </p>
              <p className="mt-1 text-xs text-green-600 dark:text-green-400">
                ✓ Email {email} подтвержден
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
                if (value.length === 6) {
                  setPin(value);
                  // Небольшая задержка для UX
                  setTimeout(() => {
                    setLoading(true);
                    fetch("/api/auth/email/verify-pin", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ email, pin: value }),
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
              disabled={loading}
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

      {mode === "initial" && !emailVerified && email && (
        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
          Для доступа к скидкам от партнеров подтвердите email
        </p>
      )}
    </div>
  );
}

