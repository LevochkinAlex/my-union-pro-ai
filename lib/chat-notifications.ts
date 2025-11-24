/**
 * Chat Notifications - звуки и веб-пуши для ответов бота
 */

// Флаг для отслеживания взаимодействия пользователя с документом
let userInteracted = false;

// Явная функция для установки флага взаимодействия (можно вызвать из формы)
export function markUserInteracted() {
  if (!userInteracted) {
    userInteracted = true;
    console.log("[Chat] ✅ User interaction detected, sound enabled");
  }
}

// Инициализация - отслеживание первого взаимодействия пользователя
if (typeof window !== "undefined") {
  // Слушаем различные типы взаимодействий
  // Используем { once: true } чтобы автоматически удалить после первого срабатывания
  document.addEventListener("click", markUserInteracted, { once: true });
  document.addEventListener("keydown", markUserInteracted, { once: true });
  document.addEventListener("touchstart", markUserInteracted, { once: true });
  document.addEventListener("submit", markUserInteracted, { once: true }); // Отправка формы
  document.addEventListener("input", markUserInteracted, { once: true }); // Ввод текста
}

// Генерация звука уведомления через Web Audio API
function generateNotificationSound(): void {
  try {
    // Проверяем поддержку Web Audio API
    if (typeof window === "undefined" || !window.AudioContext && !(window as any).webkitAudioContext) {
      console.warn("[Chat] Web Audio API not supported");
      return;
    }

    const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
    const audioContext = new AudioContext();
    
    // Генерируем простой "beep" звук (800 Hz, 200ms)
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();
    
    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);
    
    oscillator.frequency.value = 800; // Частота в Hz
    oscillator.type = "sine"; // Тип волны
    
    gainNode.gain.setValueAtTime(0, audioContext.currentTime);
    gainNode.gain.linearRampToValueAtTime(0.3, audioContext.currentTime + 0.01); // Быстрый старт
    gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.2); // Затухание
    
    oscillator.start(audioContext.currentTime);
    oscillator.stop(audioContext.currentTime + 0.2); // Длительность 200ms
    
    // Закрываем контекст после воспроизведения
    oscillator.onended = () => {
      audioContext.close().catch(() => {
        // Игнорируем ошибки закрытия
      });
    };
    
    console.log("[Chat] ✅ Notification sound played via Web Audio API");
  } catch (error) {
    console.error("[Chat] Error generating notification sound:", error);
    // Fallback на файл, если Web Audio API не работает
    playSoundFromFile();
  }
}

// Fallback: воспроизведение звука из файла
function playSoundFromFile(): void {
  try {
    const audio = new Audio("/notification-sound.mp3");
    audio.volume = 0.3;
    audio.play().catch((error) => {
      console.warn("[Chat] Failed to play sound from file:", error.name);
    });
  } catch (error) {
    console.error("[Chat] Error creating audio from file:", error);
  }
}

// Воспроизведение звука уведомления
export async function playNotificationSound() {
  // Проверяем, взаимодействовал ли пользователь с документом
  if (!userInteracted) {
    console.warn("[Chat] Cannot play sound - user hasn't interacted with document yet");
    return;
  }

  // Проверяем настройки пользователя
  try {
    const settingsResponse = await fetch("/api/settings");
    if (settingsResponse.ok) {
      const settings = await settingsResponse.json();
      if (settings.pushSoundEnabled === false) {
        console.log("[Chat] Sound disabled in user settings");
        return;
      }
    }
  } catch (error) {
    console.error("[Chat] Error loading notification settings:", error);
    // Продолжаем воспроизведение если не удалось загрузить настройки
  }

  // Используем Web Audio API (не требует файл)
  generateNotificationSound();
}

// Показ веб-уведомления для ответа бота
export async function showChatNotification(message: string, sessionType?: "STATEMENT" | "APPEAL" | null) {
  console.log("[Chat] 🔔 Attempting to show notification, permission:", Notification.permission);
  
  // Проверяем настройки пользователя для push уведомлений
  try {
    const settingsResponse = await fetch("/api/settings");
    if (settingsResponse.ok) {
      const settings = await settingsResponse.json();
      if (settings.pushNotificationsEnabled === false) {
        console.log("[Chat] Push notifications disabled in user settings");
        return;
      }
    }
  } catch (error) {
    console.error("[Chat] Error loading notification settings:", error);
    // Продолжаем показ уведомления если не удалось загрузить настройки
  }
  
  // Проверяем поддержку уведомлений
  if (!("Notification" in window)) {
    console.warn("[Chat] ❌ Browser doesn't support notifications");
    return;
  }

  // Проверяем разрешение
  const permission = Notification.permission;
  console.log("[Chat] Current notification permission:", permission);
  
  if (permission !== "granted") {
    console.warn(`[Chat] ❌ Notification permission not granted (${permission}). Requesting...`);
    // Попробуем запросить разрешение автоматически
    requestNotificationPermission().then((granted) => {
      if (granted) {
        console.log("[Chat] ✅ Permission granted, showing notification now");
        // Показываем уведомление после получения разрешения
        showChatNotification(message, sessionType);
      } else {
        console.warn("[Chat] ❌ Permission denied by user");
      }
    });
    return;
  }

  try {
    // Определяем заголовок в зависимости от типа сессии
    const title = sessionType === "APPEAL" 
      ? "Бот обращений ответил" 
      : "AI Ассистент ответил";

    // Обрезаем длинное сообщение
    const body = message.length > 100 
      ? message.substring(0, 97) + "..." 
      : message;

    console.log("[Chat] 📢 Creating notification:", { title, bodyLength: body.length, sessionType });

    const notification = new Notification(title, {
      body,
      icon: "/icon.png",
      badge: "/icon.png",
      tag: "chat-message", // Заменяет предыдущее уведомление
      silent: true, // Не воспроизводить системный звук (используем свой)
    });

    console.log("[Chat] ✅ Notification created successfully");

    // Автоматически закрываем через 5 секунд
    setTimeout(() => {
      notification.close();
      console.log("[Chat] 🔕 Notification auto-closed");
    }, 5000);

    // При клике на уведомление - фокусируем окно
    notification.onclick = () => {
      console.log("[Chat] 👆 Notification clicked, focusing window");
      window.focus();
      notification.close();
    };

    // Обработка ошибок уведомления
    notification.onerror = (error) => {
      console.error("[Chat] ❌ Notification error:", error);
    };
  } catch (error) {
    console.error("[Chat] ❌ Error showing notification:", error);
  }
}

// Запрос разрешения на уведомления (если еще не запрошено)
export async function requestNotificationPermission(): Promise<boolean> {
  if (!("Notification" in window)) {
    return false;
  }

  if (Notification.permission === "granted") {
    return true;
  }

  if (Notification.permission === "denied") {
    return false;
  }

  try {
    const permission = await Notification.requestPermission();
    return permission === "granted";
  } catch (error) {
    console.error("[Chat] Error requesting notification permission:", error);
    return false;
  }
}

// Комбинированная функция: звук + уведомление
export async function notifyBotResponse(message: string, sessionType?: "STATEMENT" | "APPEAL" | null) {
  await playNotificationSound();
  await showChatNotification(message, sessionType);
}

