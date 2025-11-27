"use client";

import { signIn } from "next-auth/react";
import Link from "next/link";
import { useState, useEffect, Suspense, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";

/**
 * Нормализация номера телефона к формату +7XXXXXXXXXX
 */
function normalizePhone(phone: string): string {
  let cleaned = phone.replace(/[\s\-\(\)]/g, "");
  if (cleaned.startsWith("8")) {
    cleaned = "+7" + cleaned.slice(1);
  }
  if (cleaned.startsWith("7") && !cleaned.startsWith("+")) {
    cleaned = "+" + cleaned;
  }
  return cleaned;
}

/**
 * Форматирование номера для отображения
 */
function formatPhoneForDisplay(phone: string): string {
  const cleaned = phone.replace(/\D/g, "");
  if (cleaned.length === 11 && cleaned.startsWith("7")) {
    return `+7 (${cleaned.slice(1, 4)}) ${cleaned.slice(4, 7)}-${cleaned.slice(7, 9)}-${cleaned.slice(9)}`;
  }
  return phone;
}

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [phone, setPhone] = useState("");
  const [pinCode, setPinCode] = useState("");
  const [step, setStep] = useState<"phone" | "pin">("phone");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const [callbackUrl, setCallbackUrl] = useState("/dashboard");
  const [requiresTelegram, setRequiresTelegram] = useState(false);
  const [telegramLink, setTelegramLink] = useState<string | null>(null);
  const [deliveryMethod, setDeliveryMethod] = useState<string | null>(null);

  // Получаем callbackUrl из query параметров при монтировании
  useEffect(() => {
    const callback = searchParams.get("callbackUrl");
    if (callback) {
      setCallbackUrl(decodeURIComponent(callback));
    }
  }, [searchParams]);

  // Таймер для повторной отправки SMS
  useEffect(() => {
    if (countdown > 0) {
      const timer = setTimeout(() => setCountdown(countdown - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [countdown]);

  // Функция для форматирования номера телефона с маской
  const formatPhoneInput = useCallback((value: string): string => {
    // Убираем все нецифровые символы
    const cleaned = value.replace(/\D/g, "");
    
    // Ограничиваем до 11 цифр (7 + 10 цифр номера)
    const limited = cleaned.slice(0, 11);
    
    // Если номер начинается с 8, заменяем на 7
    const normalized = limited.startsWith("8") ? "7" + limited.slice(1) : limited;
    
    // Форматируем в маску +7 (999) 999-99-99
    if (normalized.length === 0) {
      return "";
    } else if (normalized.length <= 1) {
      return `+${normalized}`;
    } else if (normalized.length <= 4) {
      return `+${normalized[0]} (${normalized.slice(1)}`;
    } else if (normalized.length <= 7) {
      return `+${normalized[0]} (${normalized.slice(1, 4)}) ${normalized.slice(4)}`;
    } else if (normalized.length <= 9) {
      return `+${normalized[0]} (${normalized.slice(1, 4)}) ${normalized.slice(4, 7)}-${normalized.slice(7)}`;
    } else {
      return `+${normalized[0]} (${normalized.slice(1, 4)}) ${normalized.slice(4, 7)}-${normalized.slice(7, 9)}-${normalized.slice(9, 11)}`;
    }
  }, []);

  // Обработчик изменения номера телефона
  const handlePhoneChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const formatted = formatPhoneInput(e.target.value);
    setPhone(formatted);
  }, [formatPhoneInput]);

  const handlePhoneSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      // Проверяем, что номер заполнен
      if (!phone || phone.replace(/\D/g, "").length < 10) {
        setError("Введите полный номер телефона");
        setLoading(false);
        return;
      }

      const normalizedPhone = normalizePhone(phone);
      console.log("[Login] Отправка запроса на отправку PIN-кода. Номер:", normalizedPhone);
      
      const response = await fetch("/api/auth/sms/send-pin", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ phone: normalizedPhone }),
      });

      const data = await response.json();
      console.log("[Login] Ответ сервера:", { status: response.status, data });

      if (!response.ok || !data.success) {
        // Если требуется привязка Telegram
        if (data.requiresTelegram) {
          setRequiresTelegram(true);
          
          // Получаем ссылку для привязки Telegram
          const linkResponse = await fetch("/api/telegram/link", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ phone: normalizedPhone }),
          });
          
          if (linkResponse.ok) {
            const linkData = await linkResponse.json();
            setTelegramLink(linkData.deepLink);
          }
          
          setError(data.message || "Необходимо привязать Telegram");
          setLoading(false);
          return;
        }
        
        // Убеждаемся, что errorMessage всегда строка
        let errorMessage = "Ошибка при отправке кода";
        
        if (data.error) {
          errorMessage = typeof data.error === "string" ? data.error : String(data.error);
        } else if (data.details?.error) {
          errorMessage = typeof data.details.error === "string" 
            ? data.details.error 
            : String(data.details.error);
        } else if (data.details?.message) {
          errorMessage = typeof data.details.message === "string"
            ? data.details.message
            : String(data.details.message);
        }
        
        console.error("[Login] Ошибка отправки кода:", errorMessage, data.details);
        setError(errorMessage);
        setLoading(false);
        return;
      }

      // В режиме разработки показываем PIN-код
      if (process.env.NODE_ENV === "development" && data.pinCode) {
        console.log("🔑 PIN-код (только для разработки):", data.pinCode);
      }

      // Сохраняем метод доставки
      setDeliveryMethod(data.deliveryMethod || null);
      setStep("pin");
      setCountdown(60); // 60 секунд до возможности повторной отправки
      setLoading(false);
    } catch (err) {
      console.error("[Login] Исключение при отправке SMS:", err);
      setError(err instanceof Error ? err.message : "Ошибка при отправке SMS. Проверьте подключение к интернету.");
      setLoading(false);
    }
  };

  const handlePinSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const normalizedPhone = normalizePhone(phone);

      const result = await signIn("sms", {
        phone: normalizedPhone,
        pinCode,
        redirect: false,
      });

      if (result?.error || !result?.ok) {
        setError("Неверный PIN-код");
        setLoading(false);
      } else {
        // Перенаправляем на callbackUrl, сохраняя query параметры
        router.push(callbackUrl);
        router.refresh();
      }
    } catch (err) {
      setError("Ошибка при входе");
      setLoading(false);
    }
  };

  const handleResendSMS = async () => {
    if (countdown > 0) return;
    
    setError("");
    setLoading(true);

    try {
      const normalizedPhone = normalizePhone(phone);
      
      const response = await fetch("/api/auth/sms/send-pin", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ phone: normalizedPhone }),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        setError(data.error || "Ошибка при отправке кода");
      } else {
        setCountdown(60);
        setError("");
        setDeliveryMethod(data.deliveryMethod || null);
        // В режиме разработки показываем PIN-код
        if (process.env.NODE_ENV === "development" && data.pinCode) {
          console.log("🔑 PIN-код (только для разработки):", data.pinCode);
        }
      }
    } catch (err) {
      setError("Ошибка при отправке SMS");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col flex-1 w-full">
      <div className="flex flex-col justify-center flex-1 w-full max-w-md px-8 mx-auto">
        <div>
          <div className="mb-10">
            <h1 className="mb-3 text-3xl font-bold text-gray-900 dark:text-white">
              Вход в систему
            </h1>
            <p className="text-base text-gray-600 dark:text-gray-400">
              {step === "phone"
                ? "Введите номер телефона для получения кода"
                : deliveryMethod === "telegram"
                ? "Введите код из Telegram"
                : deliveryMethod === "whatsapp"
                ? "Введите код из WhatsApp"
                : "Введите код подтверждения"}
            </p>
          </div>
          <div>
            {error && (
              <div className="p-4 mb-6 text-sm rounded-lg bg-red-50 text-red-700 border border-red-200 dark:bg-red-900/20 dark:text-red-400 dark:border-red-800">
                {error}
              </div>
            )}

            {step === "phone" ? (
              <form onSubmit={handlePhoneSubmit} className="space-y-5">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Номер телефона
                  </label>
                  <input
                    type="tel"
                    value={phone}
                    onChange={handlePhoneChange}
                    onKeyDown={(e) => {
                      // Разрешаем удаление, навигацию и специальные клавиши
                      if (
                        e.key === "Backspace" ||
                        e.key === "Delete" ||
                        e.key === "ArrowLeft" ||
                        e.key === "ArrowRight" ||
                        e.key === "Tab" ||
                        e.key === "Home" ||
                        e.key === "End" ||
                        (e.ctrlKey && (e.key === "a" || e.key === "c" || e.key === "v" || e.key === "x"))
                      ) {
                        return;
                      }
                      // Разрешаем только цифры
                      if (!/^\d$/.test(e.key)) {
                        e.preventDefault();
                      }
                    }}
                    placeholder="+7 (999) 123-45-67"
                    required
                    className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-colors bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  />
                  <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                    Код будет отправлен в Telegram или WhatsApp
                  </p>
                </div>

                {requiresTelegram && telegramLink && (
                  <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg dark:bg-blue-900/20 dark:border-blue-800">
                    <p className="text-sm text-blue-700 dark:text-blue-400 mb-3">
                      📱 Необходимо привязать Telegram для получения кодов
                    </p>
                    <a
                      href={telegramLink}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block w-full px-4 py-2 bg-blue-600 text-white text-center font-medium rounded-lg hover:bg-blue-700 transition-colors"
                    >
                      Открыть Telegram
                    </a>
                    <p className="mt-2 text-xs text-blue-600 dark:text-blue-400 text-center">
                      После привязки вернитесь сюда и повторите попытку
                    </p>
                  </div>
                )}

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full px-4 py-3 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {loading ? "Отправка..." : "Получить код"}
                </button>
              </form>
            ) : (
              <form onSubmit={handlePinSubmit} className="space-y-5">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Код подтверждения
                  </label>
                  <input
                    type="text"
                    value={pinCode}
                    onChange={(e) => setPinCode(e.target.value.replace(/\D/g, "").slice(0, 4))}
                    placeholder="0000"
                    required
                    maxLength={4}
                    className="w-full px-4 py-3 text-center text-2xl tracking-widest border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-colors bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  />
                  <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                    {deliveryMethod === "telegram" && "Код отправлен в Telegram 📱"}
                    {deliveryMethod === "whatsapp" && "Код отправлен в WhatsApp 💬"}
                    {!deliveryMethod && `Код отправлен на ${formatPhoneForDisplay(phone) || "+7 (___) ___-__-__"}`}
                  </p>
                </div>

                <button
                  type="submit"
                  disabled={loading || pinCode.length !== 4}
                  className="w-full px-4 py-3 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {loading ? "Проверка..." : "Войти"}
                </button>

                <div className="text-center">
                  <button
                    type="button"
                    onClick={handleResendSMS}
                    disabled={countdown > 0 || loading}
                    className="text-sm text-blue-600 hover:text-blue-700 dark:text-blue-400 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {countdown > 0
                      ? `Отправить код повторно через ${countdown} сек`
                      : "Отправить код повторно"}
                  </button>
                </div>

                <div className="text-center">
                  <button
                    type="button"
                    onClick={() => {
                      setStep("phone");
                      setPinCode("");
                      setError("");
                    }}
                    className="text-sm text-gray-600 hover:text-gray-700 dark:text-gray-400"
                  >
                    Изменить номер телефона
                  </button>
                </div>
              </form>
            )}

            <div className="mt-5 text-center">
              <p className="text-sm text-gray-700 dark:text-gray-400">
                Нет аккаунта?{" "}
                <span className="text-gray-500 dark:text-gray-500">
                  Регистрация происходит автоматически при первом входе
                </span>
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={
      <div className="flex flex-col flex-1 w-full items-center justify-center">
        <div className="text-center">
          <div className="mb-4 inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-blue-500 border-r-transparent"></div>
          <p className="text-gray-600 dark:text-gray-400">Загрузка...</p>
        </div>
      </div>
    }>
      <LoginForm />
    </Suspense>
  );
}
