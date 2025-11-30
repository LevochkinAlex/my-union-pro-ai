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
      <label className="block text-sm font-medium mb-1">
        Email *
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
          <div className="flex gap-2">
            <input
              type="email"
              value={email || ""}
              onChange={(e) => onEmailChange(e.target.value)}
              placeholder="example@mail.com"
              disabled={mode === "verified"}
              className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
            />
            {mode === "initial" && email && email.trim() && (
              <button
                type="button"
                onClick={handleSendPin}
                disabled={loading}
                className="px-4 py-2 text-sm bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white rounded-lg transition-colors whitespace-nowrap"
              >
                {loading ? "Отправка..." : "Валидировать"}
              </button>
            )}
          </div>
          {mode === "verified" && (
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              💡 Email подтвержден и используется для доступа к скидкам BestBenefits. Изменение невозможно.
            </p>
          )}
        </>
      ) : (
        // Режим ввода PIN
        <div className="space-y-2">
          <div className="flex gap-2">
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
              className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-center text-2xl tracking-widest font-mono"
            />
            <button
              type="button"
              onClick={handleSendPin}
              disabled={loading}
              className="px-4 py-2 text-sm bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white rounded-lg transition-colors whitespace-nowrap"
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
          Для доступа к скидкам BestBenefits подтвердите email
        </p>
      )}
    </div>
  );
}

