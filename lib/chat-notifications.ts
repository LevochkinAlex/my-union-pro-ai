<<<<<<< Current (Your changes)
=======
/**
 * Chat Notifications - звуки и веб-пуши для ответов бота
 */

// Флаг для отслеживания взаимодействия пользователя с документом
let userInteracted = false;

// Явная функция для установки флага взаимодействия (можно вызвать из формы)
export function markUserInteracted() {
  if (!userInteracted) {
    userInteracted = true;
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
  } catch (error) {
    // Fallback на файл, если Web Audio API не работает
    playSoundFromFile();
  }
}

// Fallback: воспроизведение звука из файла
function playSoundFromFile(): void {
  try {
    const audio = new Audio("/notification-sound.mp3");
    audio.volume = 0.3;
    audio.play().catch(() => {
      // Игнорируем ошибки воспроизведения
    });
  } catch (error) {
    // Игнорируем ошибки создания аудио
  }
}

// Воспроизведение звука уведомления
export function playNotificationSound() {
  // Проверяем, взаимодействовал ли пользователь с документом
  if (!userInteracted) {
    return;
  }

  // Используем Web Audio API (не требует файл)
  generateNotificationSound();
}

// Показ веб-уведомления для ответа бота
export function showChatNotification(message: string, sessionType?: "STATEMENT" | "APPEAL" | null) {
  // Проверяем поддержку уведомлений
  if (!("Notification" in window)) {
    return;
  }

  // Проверяем разрешение
  const permission = Notification.permission;
  
  if (permission !== "granted") {
    // Попробуем запросить разрешение автоматически
    requestNotificationPermission().then((granted) => {
      if (granted) {
        // Показываем уведомление после получения разрешения
        showChatNotification(message, sessionType);
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

    const notification = new Notification(title, {
      body,
      icon: "/icon.png",
      badge: "/icon.png",
      tag: "chat-message", // Заменяет предыдущее уведомление
      silent: true, // Не воспроизводить системный звук (используем свой)
    });

    // Автоматически закрываем через 5 секунд
    setTimeout(() => {
      notification.close();
    }, 5000);

    // При клике на уведомление - фокусируем окно
    notification.onclick = () => {
      window.focus();
      notification.close();
    };
  } catch (error) {
    // Игнорируем ошибки уведомлений
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
export function notifyBotResponse(message: string, sessionType?: "STATEMENT" | "APPEAL" | null) {
  playNotificationSound();
  showChatNotification(message, sessionType);
}

>>>>>>> Incoming (Background Agent changes)
