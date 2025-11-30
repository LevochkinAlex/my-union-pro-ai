"use client";

import { useState, useEffect } from "react";
import PhoneInput from "@/components/form/PhoneInput";
import MergeAccountsModal from "./MergeAccountsModal";

interface ChangePhoneModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentPhone: string;
  onPhoneChanged: (newPhone: string) => void;
}

type Step = "phone" | "sms" | "merge";

interface AccountData {
  id: string;
  phone: string | null;
  email: string | null;
  firstName: string | null;
  lastName: string | null;
  middleName: string | null;
  dateOfBirth: Date | null;
  address: string | null;
  jobTitle: string | null;
  profession: string | null;
  education: string | null;
  avatarUrl: string | null;
  membershipStatus: string | null;
  unionCardNumber: string | null;
  organizationName: string | null;
  createdAt: Date;
  documentsCount?: number;
  sessionsCount?: number;
}

export default function ChangePhoneModal({
  isOpen,
  onClose,
  currentPhone,
  onPhoneChanged,
}: ChangePhoneModalProps) {
  const [step, setStep] = useState<Step>("phone");
  const [newPhone, setNewPhone] = useState("");
  const [smsCode, setSmsCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [countdown, setCountdown] = useState(0);
  
  // Данные для слияния
  const [currentAccount, setCurrentAccount] = useState<AccountData | null>(null);
  const [existingAccount, setExistingAccount] = useState<AccountData | null>(null);
  const [showMergeModal, setShowMergeModal] = useState(false);

  // Сброс при открытии
  useEffect(() => {
    if (isOpen) {
      setStep("phone");
      setNewPhone("");
      setSmsCode("");
      setError("");
      setCountdown(0);
    }
  }, [isOpen]);

  // Таймер для повторной отправки SMS
  useEffect(() => {
    if (countdown > 0) {
      const timer = setTimeout(() => setCountdown(countdown - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [countdown]);

  const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setNewPhone(e.target.value);
    setError("");
  };

  // Шаг 1: Проверка номера и отправка SMS
  const handleCheckPhone = async () => {
    if (!newPhone || newPhone.length < 16) {
      setError("Введите корректный номер телефона");
      return;
    }

    setLoading(true);
    setError("");

    try {
      // Проверяем номер
      const checkResponse = await fetch("/api/user/check-phone", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: newPhone }),
      });

      const checkData = await checkResponse.json();

      if (checkData.status === "same") {
        setError("Этот номер уже привязан к вашему аккаунту");
        setLoading(false);
        return;
      }

      if (checkData.status === "conflict") {
        // Сохраняем данные для слияния
        setCurrentAccount(checkData.currentAccount);
        setExistingAccount(checkData.existingAccount);
      }

      // Отправляем SMS
      const smsResponse = await fetch("/api/auth/sms/send-pin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: newPhone }),
      });

      if (!smsResponse.ok) {
        const smsError = await smsResponse.json();
        throw new Error(smsError.error || "Не удалось отправить SMS");
      }

      setStep("sms");
      setCountdown(60);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Произошла ошибка");
    } finally {
      setLoading(false);
    }
  };

  // Шаг 2: Проверка SMS кода
  const handleVerifySms = async () => {
    if (smsCode.length !== 4) {
      setError("Введите 4-значный код");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const response = await fetch("/api/auth/sms/verify-pin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: newPhone, pin: smsCode }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Неверный код");
      }

      // Код верный - проверяем нужно ли слияние
      if (existingAccount) {
        setShowMergeModal(true);
      } else {
        // Просто меняем номер
        await updatePhone();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Неверный код");
    } finally {
      setLoading(false);
    }
  };

  // Обновление номера (без слияния)
  const updatePhone = async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: newPhone }),
      });

      if (!response.ok) {
        throw new Error("Не удалось обновить номер");
      }

      onPhoneChanged(newPhone);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка");
    } finally {
      setLoading(false);
    }
  };

  // Повторная отправка SMS
  const handleResendSms = async () => {
    if (countdown > 0) return;
    
    setLoading(true);
    try {
      const response = await fetch("/api/auth/sms/send-pin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: newPhone }),
      });

      if (response.ok) {
        setCountdown(60);
        setError("");
      }
    } catch (err) {
      // ignore
    } finally {
      setLoading(false);
    }
  };

  // После успешного слияния
  const handleMergeComplete = (newPhone: string) => {
    setShowMergeModal(false);
    onPhoneChanged(newPhone);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <>
      {/* Overlay */}
      <div className="fixed inset-0 bg-black/50 z-50" onClick={onClose} />

      {/* Modal */}
      <div className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-full max-w-md bg-white dark:bg-gray-800 rounded-xl shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-xl font-bold text-gray-900 dark:text-white">
            {step === "phone" && "Изменить номер телефона"}
            {step === "sms" && "Подтверждение"}
          </h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="px-6 py-6">
          {step === "phone" && (
            <div className="space-y-4">
              <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
                <p className="text-sm text-blue-800 dark:text-blue-200">
                  📱 Текущий номер: <strong>{currentPhone}</strong>
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Новый номер телефона
                </label>
                <PhoneInput
                  name="newPhone"
                  value={newPhone}
                  onChange={handlePhoneChange}
                  placeholder="+7 (___) ___-__-__"
                  className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-lg"
                />
              </div>

              {error && (
                <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
              )}

              <p className="text-xs text-gray-500 dark:text-gray-400">
                На новый номер будет отправлен SMS-код для подтверждения. 
                Если номер уже привязан к другому аккаунту, вы сможете объединить аккаунты.
              </p>
            </div>
          )}

          {step === "sms" && (
            <div className="space-y-4">
              <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-4">
                <p className="text-sm text-green-800 dark:text-green-200">
                  ✉️ SMS-код отправлен на <strong>{newPhone}</strong>
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Введите код из SMS
                </label>
                <input
                  type="text"
                  value={smsCode}
                  onChange={(e) => {
                    const value = e.target.value.replace(/\D/g, "").slice(0, 4);
                    setSmsCode(value);
                    setError("");
                  }}
                  placeholder="____"
                  maxLength={4}
                  className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-center text-2xl tracking-[0.5em] font-mono"
                  autoFocus
                />
              </div>

              {error && (
                <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
              )}

              <div className="flex items-center justify-between text-sm">
                <button
                  onClick={() => setStep("phone")}
                  className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                >
                  ← Изменить номер
                </button>
                <button
                  onClick={handleResendSms}
                  disabled={countdown > 0 || loading}
                  className="text-blue-600 hover:text-blue-800 dark:text-blue-400 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {countdown > 0 ? `Отправить снова (${countdown}с)` : "Отправить снова"}
                </button>
              </div>

              {existingAccount && (
                <div className="mt-4 bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800 rounded-lg p-4">
                  <p className="text-sm text-orange-800 dark:text-orange-200">
                    ⚠️ Этот номер привязан к другому аккаунту ({existingAccount.firstName} {existingAccount.lastName}).
                    После подтверждения кода вы сможете объединить аккаунты.
                  </p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-200 dark:border-gray-700 flex justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"
          >
            Отмена
          </button>
          
          {step === "phone" && (
            <button
              onClick={handleCheckPhone}
              disabled={loading || !newPhone}
              className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {loading ? (
                <>
                  <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Отправка...
                </>
              ) : (
                "Получить код"
              )}
            </button>
          )}

          {step === "sms" && (
            <button
              onClick={handleVerifySms}
              disabled={loading || smsCode.length !== 4}
              className="px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {loading ? (
                <>
                  <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Проверка...
                </>
              ) : (
                "Подтвердить"
              )}
            </button>
          )}
        </div>
      </div>

      {/* Merge Modal */}
      {showMergeModal && currentAccount && existingAccount && (
        <MergeAccountsModal
          isOpen={showMergeModal}
          onClose={() => setShowMergeModal(false)}
          currentAccount={currentAccount}
          existingAccount={existingAccount}
          newPhone={newPhone}
          onMergeComplete={handleMergeComplete}
        />
      )}
    </>
  );
}

