/**
 * Шаги тура-путеводителя по платформе MyUnion.
 * Группировка по экранам/разделам, без дробления на мелкие поля.
 */

export interface TourStep {
  id: string;
  title: string;
  content: string;
  /** Подсказка по меню: куда нажать в сайдбаре (опционально) */
  sidebarHint?: string;
  /** Маршрут, на который можно перейти после шага (опционально) */
  targetRoute?: string;
  /** CSS-селектор элемента для подсветки (spotlight). Например [data-tour="membership-banner"] */
  targetSelector?: string;
  /** Расположение карточки подсказки относительно элемента */
  tooltipPlacement?: "top" | "bottom" | "left" | "right";
  /** Иконка-эмодзи или ключ для отображения */
  icon?: string;
}

/** Селекторы элементов для подсветки (spotlight). */
export const TOUR_TARGET = {
  SIDEBAR: "[data-tour=\"sidebar\"]",
  MEMBERSHIP_BANNER: "[data-tour=\"membership-banner\"]",
  MAIN_CONTENT: "[data-tour=\"main-content\"]",
  AI_WIDGET_BUTTON: "[data-tour=\"ai-widget-button\"]",
} as const;

export const TOUR_STORAGE_KEY = "tour_guide_dismissed";
export const TOUR_STORAGE_KEY_DEMO = "tour_guide_dismissed_demo";

/** Ключ «тур показан после принятия в члены» (один раз после APPROVED). */
export const TOUR_AFTER_APPROVAL_KEY = "tour_guide_shown_after_approval";
export const TOUR_AFTER_APPROVAL_KEY_DEMO = "tour_guide_shown_after_approval_demo";

/** Ключ хранилища в зависимости от режима (демо не смешивается с обычным аккаунтом). */
export function getTourStorageKey(isDemo?: boolean): string {
  return isDemo ? TOUR_STORAGE_KEY_DEMO : TOUR_STORAGE_KEY;
}

/** Ключ «тур показан после принятия в члены». */
export function getTourAfterApprovalKey(isDemo?: boolean): string {
  return isDemo ? TOUR_AFTER_APPROVAL_KEY_DEMO : TOUR_AFTER_APPROVAL_KEY;
}

export function getTourShownAfterApproval(isDemo?: boolean): boolean {
  if (typeof window === "undefined") return false;
  try {
    return localStorage.getItem(getTourAfterApprovalKey(isDemo)) === "true";
  } catch {
    return false;
  }
}

export function setTourShownAfterApproval(isDemo?: boolean): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(getTourAfterApprovalKey(isDemo), "true");
  } catch {
    // ignore
  }
}

export const TOUR_STEPS: TourStep[] = [
  {
    id: "welcome",
    title: "Добро пожаловать в MyUnion",
    content:
      "Это ваш личный кабинет члена профсоюза. Слева расположено меню: **Главная**, **Документы**, **Обращения**, **Новости**, **Чат**, **Скидки**, **Профиль**. Ниже мы кратко пройдём по каждому разделу.",
    sidebarHint: "Меню слева ведёт во все разделы платформы.",
    targetSelector: TOUR_TARGET.SIDEBAR,
    tooltipPlacement: "right",
    icon: "👋",
  },
  {
    id: "ai-widget",
    title: "Виджет с ИИ-помощником",
    content:
      "Справа внизу экрана — **плавающая кнопка** с иконкой ИИ. По нажатию открывается компактный чат с AI-ассистентом: можно быстро задать вопрос без перехода в раздел «Чат». Удобно для коротких вопросов: профсоюз, документы, скидки, обращения. Виджет доступен на главной и других страницах, кроме полноэкранного чата.",
    sidebarHint: "Выделенная кнопка справа внизу — быстрый доступ к ИИ-помощнику.",
    targetSelector: TOUR_TARGET.AI_WIDGET_BUTTON,
    tooltipPlacement: "left",
    targetRoute: "/dashboard",
    icon: "🤖",
  },
  {
    id: "anketa",
    title: "Эта карточка — анкета и заявка в профсоюз",
    content:
      "**Выделенная карточка** показывает прогресс вступления. Три стадии: **1) Заполнить профиль** — обязательные поля (имя, фамилия; отчество необязательно, дата рождения, контакты, место работы и др.). **2) Отправить документы** — после 100% профиля система сгенерирует заявление и заявление о взносах; их нужно подписать и отправить. **3) Стать членом профсоюза** — после одобрения председателем вы получите статус члена. Кнопка «Заполнить анкету» в этой карточке открывает модальное окно с полями профиля.",
    sidebarHint: "Если карточки нет — вы уже член профсоюза или заполнили всё необходимое.",
    targetSelector: TOUR_TARGET.MEMBERSHIP_BANNER,
    tooltipPlacement: "bottom",
    icon: "📋",
  },
  {
    id: "documents",
    title: "Раздел «Документы»",
    content:
      "Здесь хранятся ваши заявления: о вступлении в ППО и о взносах. После заполнения профиля на 100% вы можете **сгенерировать документы** из данных профиля, скачать их, подписать и загрузить подписанные файлы. Документы отправляются на проверку председателю. Статусы отображаются в списке (черновик, на рассмотрении, подписан и т.д.).",
    sidebarHint: "В меню слева нажмите «Документы».",
    targetRoute: "/dashboard/documents",
    targetSelector: TOUR_TARGET.MAIN_CONTENT,
    tooltipPlacement: "bottom",
    icon: "📄",
  },
  {
    id: "appeals",
    title: "Обращения",
    content:
      "Обращения — это способ задать вопрос председателю профсоюза, подать жалобу или предложение. Вы создаёте тикет с темой, типом (юридическое, бухгалтерское, кадровое, техническая поддержка) и текстом. Председатель видит обращение и может ответить; при необходимости создаётся чат по обращению. Создать обращение: раздел **Обращения** → кнопка **«Новое обращение»**.",
    sidebarHint: "В меню слева нажмите «Обращения», затем «Новое обращение».",
    targetRoute: "/dashboard/appeals",
    targetSelector: TOUR_TARGET.MAIN_CONTENT,
    tooltipPlacement: "bottom",
    icon: "💬",
  },
  {
    id: "news",
    title: "Новости",
    content:
      "В разделе «Новости» публикуются материалы вашей профсоюзной организации: анонсы, отчёты, объявления. Вы можете читать статьи, ставить лайки и комментировать. Свежие новости также отображаются на главной странице.",
    sidebarHint: "В меню слева нажмите «Новости».",
    targetRoute: "/dashboard/news",
    targetSelector: TOUR_TARGET.MAIN_CONTENT,
    tooltipPlacement: "bottom",
    icon: "📰",
  },
  {
    id: "discounts",
    title: "Скидки и как получить код",
    content:
      "В разделе «Скидки» — каталог партнёрских предложений для членов профсоюза. Чтобы **получить промокод**: откройте карточку скидки → нажмите **«Получить код»** или **«Активировать»** → при необходимости выберите вариант скидки → промокод появится в модальном окне; его можно скопировать и использовать у партнёра. Активированные скидки сохраняются в разделе «Мои скидки и льготы».",
    sidebarHint: "В меню слева: «Скидки» → «Все скидки» или «Мои скидки и льготы».",
    targetRoute: "/dashboard/discounts",
    targetSelector: TOUR_TARGET.MAIN_CONTENT,
    tooltipPlacement: "bottom",
    icon: "🏷️",
  },
  {
    id: "chat",
    title: "Чат",
    content:
      "Здесь вы общаетесь с коллегами и с **ИИ-помощником**. Кнопка **«Новый чат»** в боковой панели открывает выбор собеседника. Внизу экрана — **поле ввода** и кнопка отправки. В списке чатов есть **ИИ-Ассистент** — с ним можно задавать вопросы по профсоюзу, документам и правилам; бот отвечает на основе базы знаний платформы.",
    sidebarHint: "Выберите «ИИ-Ассистент» в списке слева, чтобы открыть чат с ботом.",
    targetRoute: "/dashboard/chat",
    targetSelector: TOUR_TARGET.MAIN_CONTENT,
    tooltipPlacement: "bottom",
    icon: "💭",
  },
  {
    id: "profile",
    title: "Профиль",
    content:
      "В разделе **Профиль** вы заполняете и редактируете личные данные. Есть вкладки: основные данные (ФИО, контакты, дата рождения, место работы, должность, образование и т.д.) и дополнительная информация (о себе, хобби, награды). Данные сохраняются кнопкой «Сохранить»; от заполненности профиля зависит прогресс вступления и генерация документов.",
    sidebarHint: "В меню слева нажмите «Профиль». Внизу страницы — кнопка аватара для перехода в профиль.",
    targetRoute: "/dashboard/profile",
    targetSelector: TOUR_TARGET.MAIN_CONTENT,
    tooltipPlacement: "bottom",
    icon: "👤",
  },
  {
    id: "finish",
    title: "Тур завершён",
    content:
      "Вы познакомились с основными разделами платформы. Если что-то забудете — в настройках или через меню можно снова запустить тур. Желаем продуктивной работы в MyUnion!",
    targetSelector: TOUR_TARGET.MAIN_CONTENT,
    tooltipPlacement: "bottom",
    icon: "✅",
  },
];

export function getTourDismissed(isDemo?: boolean): boolean {
  if (typeof window === "undefined") return false;
  try {
    const key = getTourStorageKey(isDemo);
    return localStorage.getItem(key) === "true";
  } catch {
    return false;
  }
}

export function setTourDismissed(value: boolean, isDemo?: boolean): void {
  if (typeof window === "undefined") return;
  try {
    const key = getTourStorageKey(isDemo);
    if (value) {
      localStorage.setItem(key, "true");
    } else {
      localStorage.removeItem(key);
    }
  } catch {
    // ignore
  }
}
