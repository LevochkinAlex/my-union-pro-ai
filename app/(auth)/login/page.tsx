"use client";

import { signIn, useSession, getSession } from "next-auth/react";
import Image from "next/image";
import { useState, useEffect, Suspense, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { LOGIN_INPUT_HINT_EMAIL, LOGIN_INPUT_HINT_SMS } from "@/lib/login-copy";

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
  const { data: session, status, update: updateSession } = useSession();
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
  const [insideMax, setInsideMax] = useState(false);

  // Определяем, открыта ли страница внутри MAX (скрываем кнопку «Войти с MAX»)
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const ref = document.referrer || "";
    if (params.get("from") === "max" || ref.includes("max.ru")) {
      setInsideMax(true);
    }
  }, []);

  // Если уже авторизован — сразу в личный кабинет
  useEffect(() => {
    if (status === "authenticated" && session?.user) {
      const raw = searchParams.get("callbackUrl");
      const url = raw ? decodeURIComponent(raw) : "/dashboard";
      router.replace(url.startsWith("/") ? url : "/dashboard");
    }
  }, [status, session, router, searchParams]);

  // Получаем callbackUrl и error из query параметров при монтировании
  useEffect(() => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      const callback = params.get("callbackUrl");
      if (callback) {
        setCallbackUrl(decodeURIComponent(callback));
      }
      const err = params.get("error");
      if (err === "link_used_or_expired") {
        setError("Ссылка для входа уже использована или истекла. Запросите новую ссылку по email.");
      } else if (err === "invalid_token" || err === "token_expired" || err === "token_used") {
        setError("Ссылка недействительна или уже использована. Запросите новую ссылку для входа.");
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

  // Пока проверяем сессию — не показываем форму, чтобы не мигал экран перед редиректом
  if (status === "loading") {
    return (
      <div className="flex flex-col flex-1 w-full items-center justify-center min-h-[50vh]">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-r-transparent" />
        <p className="mt-4 text-sm text-muted-foreground">Загрузка...</p>
      </div>
    );
  }

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
                : deliveryMethod === "max"
                ? "Введите код из MAX"
                : "Введите код подтверждения"}
            </p>
          </div>
          <div>
            {error && (
              <>
                <div className="p-4 mb-4 text-sm rounded-lg bg-red-50 text-red-700 border border-red-200 dark:bg-red-900/20 dark:text-red-400 dark:border-red-800">
                  {error}
                </div>
                <div className="mb-6 text-center space-y-1">
                  <button
                    type="button"
                    onClick={() => {
                      setError("");
                      setLoginMethod("email");
                    }}
                    className="text-sm text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 underline"
                  >
                    Войти другим способом
                  </button>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    <a
                      href="https://t.me/myunionpro_bot"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="underline hover:text-gray-700 dark:hover:text-gray-300"
                    >
                      Проблема с регистрацией?
                    </a>
                  </p>
                </div>
              </>
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
                    {deliveryMethod === "sms"
                      ? "Код отправлен в SMS 📱"
                      : deliveryMethod === "max"
                      ? "Код отправлен в MAX 📲"
                      : deliveryMethod === "telegram"
                      ? "Код отправлен в Telegram 💬"
                      : `Код отправлен на ${formatPhoneForDisplay(input) || "+7 (___) ___-__-__"}`}
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

                <div className="text-center pt-2 space-y-1 border-t border-gray-200 dark:border-gray-700">
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    Не пришёл код?
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      setStep("input");
                      setPinCode("");
                      setError("");
                    }}
                    className="text-sm text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 underline"
                  >
                    Войти другим способом
                  </button>
                  <p className="pt-1">
                    <a
                      href="https://t.me/myunionpro_bot"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm text-gray-600 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300 underline"
                    >
                      Проблема с регистрацией?
                    </a>
                  </p>
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
                        ? LOGIN_INPUT_HINT_EMAIL
                        : LOGIN_INPUT_HINT_SMS}
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

                    {/* MAX — временно скрыта (CDN MAX не работает) */}
                    {/* {!insideMax && <MaxLoginButton />} */}

                    {/* VK ID (ВКонтакте / ОК / Mail) — stroke secondary */}
                    <a
                      href="/api/auth/vk-id"
                      className="w-full flex items-center justify-center gap-3 px-4 py-3 bg-transparent hover:bg-[#0077FF]/10 dark:hover:bg-[#0077FF]/20 text-[#0077FF] dark:text-white font-medium rounded-lg transition-colors border-2 border-[#0077FF]"
                    >
                      <svg className="w-6 h-6 flex-shrink-0" viewBox="0 0 90 90" fill="currentColor" xmlns="http://www.w3.org/2000/svg" aria-hidden>
                        <path fillRule="evenodd" d="M87.935 21.894c.626-2.086 0-3.619-2.977-3.619h-9.846c-2.504 0-3.658 1.324-4.283 2.785 0 0-5.008 12.204-12.101 20.132c-2.294 2.295-3.337 3.026-4.59 3.026c-.625 0-1.531-.731-1.531-2.816V21.894c0-2.503-.727-3.619-2.813-3.619H34.32c-1.564 0-2.506 1.162-2.506 2.264 0 2.373 3.547 2.921 3.913 9.597v14.499c0 3.179-.574 3.757-1.826 3.757c-3.337 0-11.457-12.26-16.273-26.288c-.944-2.727-1.89-3.828-4.406-3.828H3.376C.562 18.275 0 19.599 0 21.059c0 2.608 3.337 15.543 15.542 32.65c8.136 11.682 19.599 18.016 30.031 18.016c6.258 0 7.033-1.407 7.033-3.83v-8.829c0-2.814.593-3.375 2.575-3.375c1.46 0 3.963.729 9.805 6.362c6.676 6.676 7.776 9.671 11.532 9.671h9.846c2.812 0 4.219-1.407 3.408-4.182c-.889-2.767-4.076-6.781-8.305-11.538c-2.295-2.712-5.738-5.633-6.781-7.094c-1.461-1.877-1.043-2.711 0-4.381C74.687 44.53 86.684 27.631 87.935 21.894z"/>
                      </svg>
                      <span>Войти с VK ID</span>
                    </a>

                    {/* Яндекс — stroke secondary */}
                    <button
                      type="button"
                      onClick={() => signIn("yandex", { callbackUrl: "/dashboard" })}
                      className="w-full flex items-center justify-center gap-3 px-4 py-3 bg-transparent hover:bg-[#FC3F1D]/10 dark:hover:bg-[#FC3F1D]/20 text-[#FC3F1D] dark:text-white font-medium rounded-lg transition-colors border-2 border-[#FC3F1D]"
                    >
                      <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <path d="M12 13L6 7" stroke="currentColor" strokeWidth="3" strokeLinecap="round"/>
                        <path d="M12 13L18 7" stroke="currentColor" strokeWidth="3" strokeLinecap="round"/>
                        <path d="M12 13V21" stroke="currentColor" strokeWidth="3" strokeLinecap="round"/>
                      </svg>
                      <span>Войти с Яндекс</span>
                    </button>

                    {/* Госуслуги (ЕСИА) — пока отключено, tooltip «Скоро» */}
                    <span
                      title="Скоро"
                      className="w-full flex items-center justify-center gap-3 px-4 py-3 bg-transparent opacity-60 cursor-not-allowed text-gray-400 dark:text-gray-500 font-medium rounded-lg border-2 border-gray-300 dark:border-gray-600"
                    >
                      <img
                        src="/gosusligi-logo.svg"
                        alt="Госуслуги"
                        className="w-6 h-6 flex-shrink-0 object-contain dark:brightness-0 dark:invert opacity-70"
                      />
                      <span>Войти через Госуслуги</span>
                    </span>
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
              <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-sm">
                <a
                  href="https://t.me/myunionpro_bot"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 underline"
                >
                  Проблема с регистрацией?
                </a>
                <a
                  href="/privacy"
                  className="text-gray-600 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300 underline"
                >
                  Политика конфиденциальности
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
      className="w-full flex items-center justify-center gap-3 px-4 py-3 bg-transparent hover:bg-[#0088cc]/10 dark:hover:bg-[#0088cc]/20 text-[#0088cc] dark:text-white font-medium rounded-lg transition-colors border-2 border-[#0088cc]"
    >
      <svg className="w-5 h-5 flex-shrink-0" viewBox="0 0 24 24" fill="currentColor">
        <path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm5.562 8.161c-.18 1.897-.962 6.502-1.359 8.627-.168.9-.5 1.201-.82 1.23-.697.064-1.226-.461-1.901-.903-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.139-5.062 3.345-.479.329-.913.489-1.302.481-.428-.009-1.252-.242-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.831-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635.099-.002.321.023.465.141.121.1.154.234.17.331.015.098.034.321.019.496z"/>
      </svg>
      <span>Войти с Telegram</span>
    </button>
  );
}

function MaxLoginButton() {
  const isMobile =
    typeof window !== "undefined" &&
    /android|webos|iphone|ipad|ipod|blackberry|iemobile|opera mini/i.test((navigator.userAgent || "").toLowerCase());
  const href = isMobile ? "/auth/max/launch" : "/auth/max";

  return (
    <a
      href={href}
      className="w-full flex items-center justify-center gap-3 px-4 py-3 bg-gray-800 hover:bg-gray-700 dark:bg-gray-700 dark:hover:bg-gray-600 text-white font-medium rounded-lg transition-colors border border-gray-700 dark:border-gray-600"
    >
      <Image
        src="/max-messenger-sign-logo.svg"
        alt="MAX"
        width={24}
        height={24}
        className="w-6 h-6 flex-shrink-0"
      />
      <span>Войти с MAX</span>
    </a>
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
