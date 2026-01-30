"use client";

import { signIn, useSession, getSession } from "next-auth/react";
import Image from "next/image";
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
  const { update: updateSession } = useSession();
  const [loginMethod, setLoginMethod] = useState<"sms" | "email">("sms"); // Вкладка: SMS или Email (magic link)
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
  const [devMagicLink, setDevMagicLink] = useState<string | null>(null);

  // Получаем callbackUrl из query параметров при монтировании
  useEffect(() => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      const callback = params.get("callbackUrl");
      if (callback) {
        setCallbackUrl(decodeURIComponent(callback));
      }
    }
  }, []);

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
    
    // Если есть @, значит email (приоритет)
    if (value.includes("@")) {
      return "email";
    }
    
    // Если начинается с + или 8, или содержит только цифры и форматирование телефона - это телефон
    const trimmed = value.trim();
    if (trimmed.startsWith("+") || trimmed.startsWith("8") || /^[\d\s\-\(\)]+$/.test(trimmed)) {
      // Но только если нет букв (кроме форматирования)
      if (!/[a-zA-Zа-яА-Я]/.test(trimmed)) {
        return "phone";
      }
    }
    
    // Если есть буквы и нет @ - возможно email (ждём @)
    if (/[a-zA-Zа-яА-Я]/.test(value)) {
      return null; // Ждём @ для подтверждения
    }
    
    // По умолчанию null (ждём больше символов)
    return null;
  }, []);

  // Функция для форматирования номера телефона с маской
  const formatPhoneInput = useCallback((value: string): string => {
    // Убираем все нецифровые символы
    const cleaned = value.replace(/\D/g, "");
    
    // Если пользователь ввел +7, сохраняем его
    let hasPlus = value.includes("+");
    
    // Ограничиваем до 11 цифр (7 + 10 цифр номера)
    const limited = cleaned.slice(0, 11);
    
    // Если номер начинается с 8, заменяем на 7
    let normalized = limited.startsWith("8") ? "7" + limited.slice(1) : limited;
    
    // Если номер не начинается с 7, добавляем 7
    if (normalized.length > 0 && !normalized.startsWith("7")) {
      normalized = "7" + normalized;
      normalized = normalized.slice(0, 11); // Ограничиваем до 11 цифр
    }
    
    // Форматируем в маску +7 (999) 999-99-99
    if (normalized.length === 0) {
      return hasPlus ? "+7" : "";
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
    
    // Если выбран метод входа по Email
    if (loginMethod === "email") {
      setInputType("email");
      setInput(value);
      return;
    }
    
    // Если выбран метод входа по SMS - всегда телефон
    if (loginMethod === "sms") {
      setInputType("phone");
      // Автопрефикс +7: если поле пустое или начинается с цифры (не с +7), добавляем +7
      if (value === "" || (!value.startsWith("+") && /^\d/.test(value))) {
        const formatted = formatPhoneInput(value);
        setInput(formatted);
      } else if (value.startsWith("+7")) {
        // Если уже есть +7, просто форматируем
        const formatted = formatPhoneInput(value);
        setInput(formatted);
      } else if (value.startsWith("+") && !value.startsWith("+7")) {
        // Если начинается с другого +, заменяем на +7
        const cleaned = value.replace(/\D/g, "");
        const formatted = formatPhoneInput("7" + cleaned);
        setInput(formatted);
      } else {
        const formatted = formatPhoneInput(value);
        setInput(formatted);
      }
      return;
    }
    
    // Старая логика для универсального поля (если понадобится)
    const type = detectInputType(value);
    setInputType(type);
    
    if (type === "phone") {
      const formatted = formatPhoneInput(value);
      setInput(formatted);
    } else {
      setInput(value);
    }
  }, [loginMethod, detectInputType, formatPhoneInput]);
  
  // Обработчик фокуса на поле телефона - добавляем +7 если пусто
  const handlePhoneFocus = useCallback((e: React.FocusEvent<HTMLInputElement>) => {
    if (loginMethod === "sms" && !input) {
      setInput("+7");
    }
  }, [loginMethod, input]);

  const handleInputSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      // Определяем тип ввода на основе выбранного метода
      const type = loginMethod === "email" ? "email" : "phone";
      
      // Если это EMAIL (magic link)
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

        // Если в режиме разработки - сохраняем magic link для показа
        if (data.devMode && data.magicLink) {
          setDevMagicLink(data.magicLink);
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

      // Авторизуем напрямую через NextAuth (он сам проверит PIN)
      const result = await signIn("sms", {
        phone: normalizedPhone,
        pinCode,
        redirect: false,
      });

      if (result?.error) {
        // Обрабатываем ошибки от NextAuth
        if (result.error === "CredentialsSignin") {
          setError("Неверный PIN-код");
        } else {
          setError("Ошибка при авторизации");
        }
        setLoading(false);
        return;
      }

      if (!result?.ok) {
        setError("Ошибка при авторизации");
        setLoading(false);
        return;
      }

      // Авторизация успешна - перенаправляем на callbackUrl
      console.log("[Login] ✅ Авторизация успешна, редирект на:", callbackUrl);
      console.log("[Login] Метод доставки PIN:", deliveryMethod, "hasTelegram:", hasTelegram);
      
      // Обновляем сессию на клиенте
      await updateSession();
      
      // Показываем рекомендацию о Telegram только если PIN был отправлен по SMS и нет Telegram
      if (deliveryMethod === "sms" && !hasTelegram) {
        // Показываем рекомендацию, но не блокируем редирект
        setShowTelegramRecommendation(true);
        setLoading(false);
        // Автоматически редиректим через 3 секунды
        setTimeout(async () => {
          console.log("[Login] Автоматический редирект после показа рекомендации");
          // Проверяем сессию перед редиректом
          const session = await getSession();
          if (session?.user?.id) {
            console.log("[Login] Сессия подтверждена, редирект");
            window.location.href = callbackUrl;
          } else {
            console.warn("[Login] Сессия не найдена, повторная попытка через 1 секунду");
            setTimeout(() => {
              window.location.href = callbackUrl;
            }, 1000);
          }
        }, 3000);
      } else {
        // Сразу перенаправляем (PIN был отправлен в Telegram или уже есть привязка)
        // Используем задержку 1.5 секунды, чтобы cookie сессии успел установиться
        setTimeout(async () => {
          console.log("[Login] Выполняем редирект на:", callbackUrl);
          // Проверяем сессию перед редиректом
          const session = await getSession();
          if (session?.user?.id) {
            console.log("[Login] Сессия подтверждена, редирект");
            window.location.href = callbackUrl;
          } else {
            console.warn("[Login] Сессия не найдена, повторная попытка через 1 секунду");
            setTimeout(() => {
              window.location.href = callbackUrl;
            }, 1000);
          }
        }, 1500);
        // Не сбрасываем loading - показываем индикатор загрузки во время перехода
      }
    } catch (err) {
      console.error("[Login] Ошибка при проверке PIN:", err);
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 dark:bg-black/70 backdrop-blur-md dark:backdrop-blur-lg">
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
                ? loginMethod === "email" ? "Введите email для входа" : "Введите номер телефона"
                : step === "email-sent"
                ? "Проверьте вашу почту"
                : deliveryMethod === "sms"
                ? "Введите код из SMS"
                : deliveryMethod === "telegram"
                ? "Введите код из Telegram"
                : "Введите код подтверждения"}
            </p>
          </div>
          <div>
            {error && (
              <div className="p-4 mb-6 text-sm rounded-lg bg-red-50 text-red-700 border border-red-200 dark:bg-red-900/20 dark:text-red-400 dark:border-red-800">
                {error}
              </div>
            )}

            {step === "input" && (
              <div className="mb-6">
                {/* Вкладки для выбора метода входа */}
                <div className="flex gap-2 p-1 bg-gray-100 dark:bg-gray-800 rounded-lg">
                  <button
                    type="button"
                    onClick={() => {
                      setLoginMethod("sms");
                      setInput("");
                      setInputType("phone");
                      setError("");
                    }}
                    className={`flex-1 py-2 px-4 rounded-md text-sm font-medium transition-colors ${
                      loginMethod === "sms"
                        ? "bg-white text-gray-900 shadow-sm dark:bg-gray-600 dark:text-white"
                        : "text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white"
                    }`}
                  >
                    По SMS
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setLoginMethod("email");
                      setInput("");
                      setInputType("email");
                      setError("");
                    }}
                    className={`flex-1 py-2 px-4 rounded-md text-sm font-medium transition-colors ${
                      loginMethod === "email"
                        ? "bg-white text-gray-900 shadow-sm dark:bg-gray-600 dark:text-white"
                        : "text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white"
                    }`}
                  >
                    По Email
                  </button>
                </div>
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
                    {devMagicLink ? "🔧 Режим разработки" : "Проверьте вашу почту ✉️"}
                  </h3>
                  <p className="text-gray-600 dark:text-gray-400 mb-4">
                    {devMagicLink ? (
                      <>Email не отправлен (SMTP не настроен)<br/>Используйте ссылку ниже:</>
                    ) : (
                      <>Мы отправили ссылку для входа на<br/><strong>{input}</strong></>
                    )}
                  </p>
                  
                  {/* Dev mode: показываем кликабельную magic link */}
                  {devMagicLink && (
                    <div className="mt-4 mb-6">
                      <a
                        href={devMagicLink}
                        className="inline-flex items-center gap-2 px-6 py-3 bg-green-600 hover:bg-green-700 text-white font-medium rounded-lg transition-colors"
                      >
                        🔐 Войти сейчас
                      </a>
                      <p className="mt-3 text-xs text-gray-500 dark:text-gray-500 break-all">
                        {devMagicLink}
                      </p>
                    </div>
                  )}
                  
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
                    setDevMagicLink(null);
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
                      {loginMethod === "email" ? "Email" : "Номер телефона"}
                    </label>
                    <input
                      id="input"
                      type={loginMethod === "email" ? "email" : "tel"}
                      value={input}
                      onChange={handleInputChange}
                      onFocus={loginMethod === "sms" ? handlePhoneFocus : undefined}
                      placeholder={loginMethod === "email" ? "email@example.com" : "+7 (999) 123-45-67"}
                      required
                      className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-colors bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                    />
                    <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                      {loginMethod === "email" 
                        ? "Отправим ссылку для входа на email ✉️" 
                        : "Отправим код в SMS 📱 (или в Telegram, если привязан)"}
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
                  {/* Социальные сети */}
                  <div className="flex flex-col gap-3">
                    {/* Telegram - кастомная кнопка */}
                    <TelegramLoginButton />

                    {/* MAX */}
                    <button
                      type="button"
                      disabled
                      className="w-full flex items-center justify-center gap-3 px-4 py-3 bg-gray-200 dark:bg-gray-800 text-gray-500 dark:text-gray-400 font-medium rounded-lg cursor-not-allowed border border-gray-300 dark:border-gray-700"
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
                      className="w-full flex items-center justify-center gap-3 px-4 py-3 bg-gray-200 dark:bg-gray-800 text-gray-500 dark:text-gray-400 font-medium rounded-lg cursor-not-allowed border border-gray-300 dark:border-gray-700"
                    >
                      <svg className="w-6 h-6" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <path d="M0 23.04C0 12.1788 0 6.74826 3.37413 3.37413C6.74826 0 12.1788 0 23.04 0H24.96C35.8212 0 41.2517 0 44.6259 3.37413C48 6.74826 48 12.1788 48 23.04V24.96C48 35.8212 48 41.2517 44.6259 44.6259C41.2517 48 35.8212 48 24.96 48H23.04C12.1788 48 6.74826 48 3.37413 44.6259C0 41.2517 0 35.8212 0 24.96V23.04Z" fill="#0077FF"/>
                        <path d="M25.54 34.5801C14.6 34.5801 8.3601 27.0801 8.1001 14.6001H13.5801C13.7601 23.7601 17.8 27.6401 21 28.4401V14.6001H26.1602V22.5001C29.3202 22.1601 32.6398 18.5601 33.7598 14.6001H38.9199C38.0599 19.4801 34.4599 23.0801 31.8999 24.5601C34.4599 25.7601 38.5601 28.9001 40.1201 34.5801H34.4399C33.2199 30.7801 30.1802 27.8401 26.1602 27.4401V34.5801H25.54Z" fill="white"/>
                      </svg>
                      <span>Войти с VK</span>
                    </button>

                    {/* Яндекс */}
                    <button
                      type="button"
                      onClick={() => signIn("yandex", { callbackUrl: "/dashboard" })}
                      className="w-full flex items-center justify-center gap-3 px-4 py-3 bg-[#FC3F1D] hover:bg-[#E0350F] text-white font-medium rounded-lg transition-colors"
                    >
                      <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <path d="M12 13L6 7" stroke="white" strokeWidth="3" strokeLinecap="round"/>
                        <path d="M12 13L18 7" stroke="white" strokeWidth="3" strokeLinecap="round"/>
                        <path d="M12 13V21" stroke="white" strokeWidth="3" strokeLinecap="round"/>
                      </svg>
                      <span>Войти с Яндекс</span>
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

function TelegramLoginButton() {
  const handleTelegramLogin = () => {
    // Определяем мобильное устройство напрямую из userAgent
    const userAgent = navigator.userAgent || navigator.vendor || "";
    const isMobile = /android|webos|iphone|ipad|ipod|blackberry|iemobile|opera mini/i.test(userAgent.toLowerCase());
    
    // Deeplink для входа через бота
    const loginDeeplink = "https://t.me/myunionpro_bot?start=login";
    
    if (isMobile) {
      // На мобильных просто открываем ссылку - Telegram перехватит её
      window.location.href = loginDeeplink;
    } else {
      // На десктопе открываем в новом окне
      window.open(loginDeeplink, "_blank");
    }
  };

  return (
    <button
      type="button"
      onClick={handleTelegramLogin}
      className="w-full flex items-center justify-center gap-3 px-4 py-3 bg-[#0088cc] hover:bg-[#0077b3] text-white font-medium rounded-lg transition-colors border border-[#0088cc]"
    >
      <svg className="w-5 h-5 flex-shrink-0" viewBox="0 0 24 24" fill="currentColor">
        <path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm5.562 8.161c-.18 1.897-.962 6.502-1.359 8.627-.168.9-.5 1.201-.82 1.23-.697.064-1.226-.461-1.901-.903-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.139-5.062 3.345-.479.329-.913.489-1.302.481-.428-.009-1.252-.242-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.831-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635.099-.002.321.023.465.141.121.1.154.234.17.331.015.098.034.321.019.496z"/>
      </svg>
      <span>Войти с Telegram</span>
    </button>
  );
}

export default function LoginPage() {
  return (
    <Suspense 
      fallback={
        <div className="flex min-h-screen bg-gray-50 dark:bg-gray-900">
          <div className="flex flex-1 w-full lg:w-1/2 bg-white dark:bg-gray-800">
            <div className="flex flex-col flex-1 w-full items-center justify-center">
              <div className="text-center">
                <div className="mb-4 inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-blue-500 border-r-transparent"></div>
                <p className="text-gray-600 dark:text-gray-400">Загрузка...</p>
              </div>
            </div>
          </div>
          <div className="hidden lg:flex lg:w-1/2 relative overflow-hidden bg-gradient-to-br from-blue-600 via-indigo-600 to-purple-700">
            <div className="relative z-10 flex items-center justify-center w-full p-12">
              <div className="text-center text-white max-w-md">
                <p className="text-xl text-white/90">Современная платформа для управления профсоюзом</p>
              </div>
            </div>
          </div>
        </div>
      }
    >
      <LoginForm />
    </Suspense>
  );
}
