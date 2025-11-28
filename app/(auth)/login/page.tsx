"use client";

import { signIn } from "next-auth/react";
import Link from "next/link";
import Image from "next/image";
import { useState, useEffect, Suspense, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Script from "next/script";

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
  const [input, setInput] = useState(""); // Универсальное поле: телефон или email
  const [inputType, setInputType] = useState<"phone" | "email" | null>(null);
  const [pinCode, setPinCode] = useState("");
  const [step, setStep] = useState<"input" | "pin" | "email-sent">("input");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const [callbackUrl, setCallbackUrl] = useState("/dashboard");
  const [requiresTelegram, setRequiresTelegram] = useState(false);
  const [telegramLink, setTelegramLink] = useState<string | null>(null);
  const [deliveryMethod, setDeliveryMethod] = useState<string | null>(null);
  const [showTelegramRecommendation, setShowTelegramRecommendation] = useState(false);
  const [isNewUser, setIsNewUser] = useState(false);
  const [hasTelegram, setHasTelegram] = useState(false);

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

  // Определяем тип ввода: телефон или email
  const detectInputType = useCallback((value: string): "phone" | "email" | null => {
    if (!value) return null;
    
    // Если есть @, значит email
    if (value.includes("@")) {
      return "email";
    }
    
    // Если есть цифры или +, значит телефон
    if (/[\d+]/.test(value)) {
      return "phone";
    }
    
    // По умолчанию null (ждём больше символов)
    return null;
  }, []);

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

  // Обработчик изменения универсального поля
  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    const type = detectInputType(value);
    
    setInputType(type);
    
    // Если это телефон, форматируем
    if (type === "phone") {
      const formatted = formatPhoneInput(value);
      setInput(formatted);
    } else {
      // Для email просто сохраняем как есть
      setInput(value);
    }
  }, [detectInputType, formatPhoneInput]);

  const handleInputSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      // Определяем тип ввода
      const type = inputType || detectInputType(input);
      
      if (!type) {
        setError("Введите номер телефона или email");
        setLoading(false);
        return;
      }

      // Если это EMAIL
      if (type === "email") {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(input)) {
          setError("Неверный формат email");
          setLoading(false);
          return;
        }

        console.log("[Login] Отправка magic link на email:", input);
        
        const response = await fetch("/api/auth/email/send-magic-link", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ email: input }),
        });

        const data = await response.json();

        if (!response.ok || !data.success) {
          // Убеждаемся, что остаемся на шаге ввода и email сохраняется
          setStep("input");
          setError(data.error || "Ошибка при отправке письма");
          setLoading(false);
          return;
        }

        // Показываем экран "Проверьте email"
        setStep("email-sent");
        setLoading(false);
        return;
      }

      // Если это ТЕЛЕФОН
      if (!input || input.replace(/\D/g, "").length < 10) {
        setError("Введите полный номер телефона");
        setLoading(false);
        return;
      }

      const normalizedPhone = normalizePhone(input);
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
        // Если требуется привязка мессенджера (Telegram или MAX)
        if (data.requiresMessenger || data.requiresTelegram) {
          setRequiresTelegram(true);
          
          // Получаем ссылку для привязки Telegram
          const linkResponse = await fetch("/api/telegram/link", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ phone: normalizedPhone }),
          });
          
          if (linkResponse.ok) {
            const linkData = await linkResponse.json();
            setTelegramLink(linkData.deepLink || data.telegramLink);
          } else if (data.telegramLink) {
            setTelegramLink(data.telegramLink);
          }
          
          // Убеждаемся, что остаемся на шаге ввода и номер сохраняется
          setStep("input");
          setError(data.message || "Необходимо привязать Telegram или MAX");
          setLoading(false);
          return;
        }
        
        // Убеждаемся, что errorMessage всегда строка
        let errorMessage = "Ошибка при отправке кода";
        
        console.error("[Login] Полный ответ сервера:", JSON.stringify(data, null, 2));
        
        if (data.error && data.error !== "undefined") {
          errorMessage = typeof data.error === "string" ? data.error : JSON.stringify(data.error);
        } else if (data.message) {
          errorMessage = typeof data.message === "string" ? data.message : String(data.message);
        } else if (data.details?.error) {
          errorMessage = typeof data.details.error === "string" 
            ? data.details.error 
            : JSON.stringify(data.details.error);
        } else if (data.details?.message) {
          errorMessage = typeof data.details.message === "string"
            ? data.details.message
            : JSON.stringify(data.details.message);
        } else if (data.details) {
          errorMessage = `Ошибка: ${JSON.stringify(data.details)}`;
        }
        
        console.error("[Login] Итоговая ошибка:", errorMessage);
        // Убеждаемся, что остаемся на шаге ввода и номер сохраняется
        setStep("input");
        setError(errorMessage);
        setLoading(false);
        return;
      }

      // В режиме разработки показываем PIN-код
      if (process.env.NODE_ENV === "development" && data.pinCode) {
        console.log("🔑 PIN-код (только для разработки):", data.pinCode);
      }

      // Сохраняем метод доставки и информацию о пользователе
      setDeliveryMethod(data.deliveryMethod || null);
      setIsNewUser(!data.isExistingUser);
      setHasTelegram(data.hasTelegram || false);
      
      // Если код отправлен по SMS и нет Telegram - подготовим ссылку для рекомендации
      if (data.deliveryMethod === "sms" && !data.hasTelegram) {
        setTelegramLink(`https://t.me/myunionpro_bot?start=link_phone_${normalizedPhone.replace(/^\+/, "")}`);
      }
      
      // Если есть ссылка на Telegram, показываем предложение привязать
      if (data.telegramLink || data.requiresTelegramLink) {
        setTelegramLink(data.telegramLink || `https://t.me/myunionpro_bot?start=link_phone_${normalizedPhone.replace(/^\+/, "")}`);
        if (data.message) {
          // Показываем информационное сообщение, но не ошибку
          console.log("[Login] Информация:", data.message);
        }
      }
      
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
      const normalizedPhone = normalizePhone(input);

      const result = await signIn("sms", {
        phone: normalizedPhone,
        pinCode,
        redirect: false,
      });

      if (result?.error || !result?.ok) {
        setError("Неверный PIN-код");
        setLoading(false);
      } else {
        // Если код был отправлен по SMS и у пользователя нет Telegram - показываем рекомендацию
        if (deliveryMethod === "sms" && !hasTelegram) {
          setShowTelegramRecommendation(true);
          setLoading(false);
        } else {
          // Перенаправляем на callbackUrl
          router.push(callbackUrl);
          router.refresh();
        }
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
      const normalizedPhone = normalizePhone(input);
      
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

  // Функция для закрытия модалки и перехода в dashboard
  const handleCloseTelegramModal = () => {
    setShowTelegramRecommendation(false);
    router.push(callbackUrl);
    router.refresh();
  };

  return (
    <div className="flex flex-col flex-1 w-full">
      {/* Модалка с рекомендацией привязать Telegram */}
      {showTelegramRecommendation && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="bg-white dark:bg-gray-800 rounded-2xl p-8 max-w-md mx-4 shadow-2xl">
            <div className="text-center">
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-blue-100 dark:bg-blue-900/30 mb-4">
                <svg className="w-8 h-8 text-blue-500" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm5.562 8.161c-.18 1.897-.962 6.502-1.359 8.627-.168.9-.5 1.201-.82 1.23-.697.064-1.226-.461-1.901-.903-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.139-5.062 3.345-.479.329-.913.489-1.302.481-.428-.009-1.252-.242-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.831-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635.099-.002.321.023.465.141.121.1.154.234.17.331.015.098.034.321.019.496z"/>
                </svg>
              </div>
              <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-3">
                💡 Экономьте на SMS!
              </h3>
              <p className="text-gray-600 dark:text-gray-300 mb-6">
                Привяжите <strong>Telegram</strong> чтобы получать коды для входа бесплатно вместо платных SMS.
              </p>
              <div className="space-y-3">
                <a
                  href={telegramLink || "https://t.me/myunionpro_bot"}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-center gap-2 w-full py-3 px-4 bg-[#0088cc] hover:bg-[#0077b5] text-white font-medium rounded-xl transition-colors"
                >
                  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm5.562 8.161c-.18 1.897-.962 6.502-1.359 8.627-.168.9-.5 1.201-.82 1.23-.697.064-1.226-.461-1.901-.903-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.139-5.062 3.345-.479.329-.913.489-1.302.481-.428-.009-1.252-.242-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.831-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635.099-.002.321.023.465.141.121.1.154.234.17.331.015.098.034.321.019.496z"/>
                  </svg>
                  Привязать Telegram
                </a>
                <button
                  onClick={handleCloseTelegramModal}
                  className="w-full py-3 px-4 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white font-medium transition-colors"
                >
                  Пропустить
                </button>
              </div>
              <p className="text-xs text-gray-400 dark:text-gray-500 mt-4">
                Вы сможете привязать Telegram позже в настройках профиля
              </p>
            </div>
          </div>
        </div>
      )}

      <div className="flex flex-col justify-center flex-1 w-full max-w-md px-8 mx-auto">
        <div>
          <div className="mb-10">
            <h1 className="mb-3 text-3xl font-bold text-gray-900 dark:text-white">
              Вход в систему
            </h1>
            <p className="text-base text-gray-600 dark:text-gray-400">
              {step === "input"
                ? "Введите номер телефона или email"
                : step === "email-sent"
                ? "Проверьте вашу почту"
                : deliveryMethod === "sms"
                ? "Введите код из SMS"
                : "Введите код подтверждения"}
            </p>
          </div>
          <div>
            {error && (
              <div className="p-4 mb-6 text-sm rounded-lg bg-red-50 text-red-700 border border-red-200 dark:bg-red-900/20 dark:text-red-400 dark:border-red-800">
                {error}
              </div>
            )}

            {step === "email-sent" && (
              <div className="text-center py-8">
                <div className="mb-6">
                  <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-blue-100 dark:bg-blue-900/30 mb-4">
                    <svg className="w-8 h-8 text-blue-600 dark:text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                    </svg>
                  </div>
                  <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
                    Проверьте вашу почту ✉️
                  </h3>
                  <p className="text-gray-600 dark:text-gray-400 mb-4">
                    Мы отправили ссылку для входа на<br/>
                    <strong>{input}</strong>
                  </p>
                  <p className="text-sm text-gray-500 dark:text-gray-500">
                    Ссылка действительна 15 минут
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setStep("input");
                    setInput("");
                    setError("");
                  }}
                  className="text-sm text-gray-600 hover:text-gray-700 dark:text-gray-400"
                >
                  Изменить email
                </button>
              </div>
            )}

            {step === "pin" && (
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
                    {deliveryMethod === "sms" ? "Код отправлен в SMS 📱" : `Код отправлен на ${formatPhoneForDisplay(input) || "+7 (___) ___-__-__"}`}
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
                      setStep("input");
                      setPinCode("");
                      setError("");
                    }}
                    className="text-sm text-gray-600 hover:text-gray-700 dark:text-gray-400"
                  >
                    Изменить {inputType === "email" ? "email" : "номер телефона"}
                  </button>
                </div>
              </form>
            )}

            {step === "input" && (
              <>
                <form onSubmit={handleInputSubmit} className="space-y-5">
                  <div>
                    <label
                      htmlFor="input"
                      className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2"
                    >
                      Телефон или Email
                    </label>
                    <input
                      id="input"
                      type="text"
                      value={input}
                      onChange={handleInputChange}
                      placeholder="+7 (999) 123-45-67 или email@example.com"
                      required
                      className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-colors bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                    />
                    <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                      {inputType === "email" ? "Отправим ссылку для входа на email ✉️" : inputType === "phone" ? "Отправим код в SMS 📱" : "Введите номер телефона или email"}
                    </p>
                </div>

              <button
                    type="submit"
                    disabled={loading}
                className="w-full px-4 py-3 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    {loading ? "Отправка..." : "Продолжить"}
              </button>
            </form>

                <div className="mt-8">
                  <div className="relative">
                    <div className="absolute inset-0 flex items-center">
                      <div className="w-full border-t border-gray-300 dark:border-gray-600"></div>
                    </div>
                    <div className="relative flex justify-center text-sm">
                      <span className="px-4 bg-white dark:bg-gray-800 text-gray-500 dark:text-gray-400 font-medium">
                        или войти через
                      </span>
                    </div>
                  </div>

                  {/* Социальные сети */}
                  <div className="mt-6 flex flex-col gap-3">
                    {/* Telegram */}
                    <div 
                      id="telegram-login-container" 
                      className="flex items-center justify-center min-h-[48px] rounded-lg border border-gray-300 dark:border-gray-700 overflow-hidden"
                    >
                      {/* Виджет Telegram Login будет вставлен сюда */}
                    </div>

                    {/* MAX */}
                    <button
                      type="button"
                      disabled
                      className="w-full flex items-center justify-center gap-3 px-4 py-3 bg-gray-100 dark:bg-gray-800 text-gray-400 dark:text-gray-600 font-medium rounded-lg cursor-not-allowed border border-gray-300 dark:border-gray-700"
                    >
                      <Image
                        src="/max-messenger-sign-logo.svg"
                        alt="MAX"
                        width={24}
                        height={24}
                        className="w-6 h-6"
                      />
                      <span>Войти с MAX</span>
                    </button>

                    {/* VK */}
                    <button
                      type="button"
                      disabled
                      className="w-full flex items-center justify-center gap-3 px-4 py-3 bg-gray-100 dark:bg-gray-800 text-gray-400 dark:text-gray-600 font-medium rounded-lg cursor-not-allowed border border-gray-300 dark:border-gray-700"
                    >
                      <svg className="w-6 h-6" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <path d="M0 23.04C0 12.1788 0 6.74826 3.37413 3.37413C6.74826 0 12.1788 0 23.04 0H24.96C35.8212 0 41.2517 0 44.6259 3.37413C48 6.74826 48 12.1788 48 23.04V24.96C48 35.8212 48 41.2517 44.6259 44.6259C41.2517 48 35.8212 48 24.96 48H23.04C12.1788 48 6.74826 48 3.37413 44.6259C0 41.2517 0 35.8212 0 24.96V23.04Z" fill="#0077FF"/>
                        <path d="M25.54 34.5801C14.6 34.5801 8.3601 27.0801 8.1001 14.6001H13.5801C13.7601 23.7601 17.8 27.6401 21 28.4401V14.6001H26.1602V22.5001C29.3202 22.1601 32.6398 18.5601 33.7598 14.6001H38.9199C38.0599 19.4801 34.4599 23.0801 31.8999 24.5601C34.4599 25.7601 38.5601 28.9001 40.1201 34.5801H34.4399C33.2199 30.7801 30.1802 27.8401 26.1602 27.4401V34.5801H25.54Z" fill="white"/>
                      </svg>
                      <span>Войти с VK</span>
                    </button>

                    {/* Google */}
                    <button
                      type="button"
                      disabled
                      className="w-full flex items-center justify-center gap-3 px-4 py-3 bg-gray-100 dark:bg-gray-800 text-gray-400 dark:text-gray-600 font-medium rounded-lg cursor-not-allowed border border-gray-300 dark:border-gray-700"
                    >
                      <svg className="w-5 h-5" viewBox="0 0 24 24">
                        <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                        <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                        <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                        <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                      </svg>
                      <span>Войти с Google</span>
                    </button>
                  </div>
                </div>
              </>
            )}

            <div className="mt-5 text-center space-y-2">
              <p className="text-sm text-gray-700 dark:text-gray-400">
                Нет аккаунта?{" "}
                <span className="text-gray-500 dark:text-gray-500">
                  Регистрация происходит автоматически при первом входе
                </span>
              </p>
              <div>
                <a
                  href="https://t.me/myunionpro_bot"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 underline"
                >
                  Проблема с регистрацией?
                </a>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function TelegramLoginWrapper() {
  useEffect(() => {
    // Инициализация Telegram Login Widget
    const initTelegramWidget = () => {
      const container = document.getElementById("telegram-login-container");
      if (!container) return;
      
      // Очищаем предыдущий виджет
      container.innerHTML = "";
      
      // Проверяем, что домен настроен (иначе виджет покажет ошибку)
      // Используем текущий origin с правильным протоколом
      const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 
                      (window.location.protocol === "https:" 
                        ? window.location.origin 
                        : window.location.origin.replace("https://", "http://"));
      const isProduction = baseUrl.includes("myunion.pro");
      
      if (!isProduction) {
        // В разработке показываем обычную кнопку, которая открывает бота
        const button = document.createElement("button");
        button.type = "button";
        button.className = "w-full flex items-center justify-center gap-3 px-4 py-3 bg-[#0088cc] hover:bg-[#0077b3] text-white font-medium rounded-lg transition-colors";
        button.innerHTML = `
          <svg class="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm5.562 8.161l-1.702 8.008c-.128.568-.473.706-.957.44l-2.644-1.947-1.275 1.227c-.141.141-.259.259-.533.259l.19-2.706 4.906-4.432c.213-.19-.046-.295-.33-.105l-6.062 3.817-2.612-.816c-.568-.178-.58-.568.119-.841l10.213-3.937c.473-.178.887.105.733.841z"/>
          </svg>
          <span>Войти с Telegram</span>
        `;
        button.onclick = () => {
          window.open('https://t.me/myunionpro_bot?start=login', '_blank');
        };
        container.appendChild(button);
        return;
      }
      
      // В продакшене загружаем официальный виджет
      const script = document.createElement("script");
      script.src = "https://telegram.org/js/telegram-widget.js?22";
      script.async = true;
      script.setAttribute("data-telegram-login", "myunionpro_bot");
      script.setAttribute("data-size", "large");
      script.setAttribute("data-radius", "8");
      script.setAttribute("data-auth-url", `${baseUrl}/api/auth/telegram/callback`);
      script.setAttribute("data-request-access", "write");
      
      container.appendChild(script);
      
      console.log("[Telegram Login] Виджет инициализирован");
    };

    // Даём время для загрузки DOM
    const timer = setTimeout(initTelegramWidget, 500);
    return () => clearTimeout(timer);
  }, []);

  return null;
}

export default function LoginPage() {
  return (
    <>
      <style jsx global>{`
        /* Стили для Telegram Login Widget */
        #telegram-login-container {
          display: block !important;
          width: 100% !important;
        }
        
        #telegram-login-container iframe {
          width: 100% !important;
          max-width: 100% !important;
          height: 48px !important;
          border-radius: 8px !important;
          display: block !important;
        }
        
        /* Скрываем стандартные отступы виджета */
        #telegram-login-container > * {
          margin: 0 !important;
          width: 100% !important;
        }
        
        /* Скрываем аватар пользователя, который может появиться */
        #telegram-login-container img:not([src*="telegram"]) {
          display: none !important;
        }
      `}</style>
      <Script
        src="https://telegram.org/js/telegram-widget.js?22"
        strategy="lazyOnload"
      />
      <Suspense fallback={
        <div className="flex flex-col flex-1 w-full items-center justify-center">
          <div className="text-center">
            <div className="mb-4 inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-blue-500 border-r-transparent"></div>
            <p className="text-gray-600 dark:text-gray-400">Загрузка...</p>
          </div>
        </div>
      }>
        <TelegramLoginWrapper />
        <LoginForm />
      </Suspense>
    </>
  );
}
