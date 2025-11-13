// Translation strings
export const translations = {
  ru: {
    chat: {
      welcome: "Добро пожаловать!",
      appeal_welcome: "Создание обращения",
      profile_fill: "Начните диалог, чтобы заполнить свой профиль",
      appeal_description: "Опишите вашу проблему или вопрос. Я помогу вам составить обращение к профсоюзу.",
      enter_message: "Введите ваше сообщение...",
      send_hint: "Нажмите Enter для отправки, Shift+Enter для новой строки",
      labor_dispute: "💼 Трудовой спор",
      complaint: "📋 Жалоба",
      consultation: "⚖️ Консультация",
      benefits: "🛡️ Льготы",
      profile_complete: "Профиль заполнен!",
      documents_ready: "Ваши документы готовы к скачиванию",
      download_documents: "Скачать документы",
      typing: "Печатает...",
    },
    profile: {
      title: "Профиль",
      security: "Безопасность",
      personal_info: "Личная информация",
      professional_info: "Профессиональная информация",
      save: "Сохранить",
      saving: "Сохранение...",
    },
    documents: {
      title: "Мои документы",
      description: "Здесь хранятся все ваши документы: заявления, обращения и другие файлы",
      empty: "Документов пока нет",
      fill_profile: "Заполните профиль через AI чат, чтобы система сгенерировала ваши заявления",
      download: "Скачать",
      membership_app: "Заявление о вступлении",
      contribution_app: "Заявление о взносах",
      appeal: "Обращение",
    },
    common: {
      loading: "Загрузка...",
      error: "Ошибка",
      success: "Успешно",
      cancel: "Отмена",
      delete: "Удалить",
      edit: "Редактировать",
      save: "Сохранить",
      close: "Закрыть",
    },
  },
  en: {
    chat: {
      welcome: "Welcome!",
      appeal_welcome: "Create Appeal",
      profile_fill: "Start a conversation to fill out your profile.",
      appeal_description: "Describe your issue or question. I will help you create an appeal to the union.",
      enter_message: "Enter your message...",
      send_hint: "Press Enter to send, Shift+Enter for new line",
      labor_dispute: "💼 Labor Dispute",
      complaint: "📋 Complaint",
      consultation: "⚖️ Legal Consultation",
      benefits: "🛡️ Benefits",
      profile_complete: "Profile Complete!",
      documents_ready: "Your documents are ready to download",
      download_documents: "Download Documents",
      typing: "Typing...",
    },
    profile: {
      title: "Profile",
      security: "Security",
      personal_info: "Personal Information",
      professional_info: "Professional Information",
      save: "Save",
      saving: "Saving...",
    },
    documents: {
      title: "My Documents",
      description: "All your documents are stored here: applications, appeals, and other files",
      empty: "No documents yet",
      fill_profile: "Fill out your profile through the AI chat to generate your applications",
      download: "Download",
      membership_app: "Membership Application",
      contribution_app: "Contribution Application",
      appeal: "Appeal",
    },
    common: {
      loading: "Loading...",
      error: "Error",
      success: "Success",
      cancel: "Cancel",
      delete: "Delete",
      edit: "Edit",
      save: "Save",
      close: "Close",
    },
  },
};

export type Language = "ru" | "en";

export function getTranslation(lang: Language, key: string): string {
  const parts = key.split(".");
  let current: any = translations[lang];

  for (const part of parts) {
    if (current && typeof current === "object" && part in current) {
      current = current[part];
    } else {
      // Fallback to Russian if translation not found
      current = translations.ru;
      for (const p of parts) {
        if (current && typeof current === "object" && p in current) {
          current = current[p];
        } else {
          return key; // Return key if translation not found
        }
      }
      return current;
    }
  }

  return typeof current === "string" ? current : key;
}

export function t(lang: Language | undefined, key: string): string {
  return getTranslation(lang || "ru", key);
}

