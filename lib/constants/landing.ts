/**
 * Константы для лендинга MyUnion Pro
 * Контакты, реквизиты, дорожная карта
 */

export const COMPANY = {
  name: "ООО ЯППИКС",
  product: "MyUnion Pro",
  tagline: "Единая панель управления профсоюзом",
  address: "127055, г. Москва, муниципальный округ Тверской, ул. Палиха, д. 7-9, к. 4, помещ. 1/1",
  addressNote: "",
  workingHours: "пн–пт 09:00–18:00",
  /** Сообщество проекта во ВКонтакте */
  vkGroupUrl: "https://vk.com/my_union_pro",
  /** Канал в Telegram */
  telegramChannelUrl: "https://t.me/myunionpro",
} as const;

export const CONTACTS = [
  {
    name: "Анастасия Стрелкова",
    role: "Отдел продаж",
    email: "sales@myunion.pro",
    phone: "+7 995 095 55 93",
    photo: "/nastya.png",
  },
  {
    name: "Ренат Усманов",
    role: "Генеральный директор",
    email: "ceo@yappix.ru",
    phone: "+7 987 415 78 97",
    photo: "/renat.png",
  },
  {
    name: "Алексей Новиков",
    role: "Безопасность и инфраструктура",
    email: "security@myunion.pro",
    phone: "+7 995 095 55 93",
    photo: "/alex.png",
  },
] as const;

/** Данные для блока «Цены» из расчёта (месяц / квартал / полгода / год) */
export type PricingPeriod = "month" | "quarter" | "halfyear" | "year";

export interface PricingRow {
  users: number | "3600+";
  orgs: number;
  employees: number;
  monthPrice: number | null;
  quarterPrice: number | null;
  halfYearPrice: number | null;
  yearPrice: number | null;
  perUserMonth: number | null;
  perUserQuarter: number | null;
  perUserHalfYear: number | null;
  perUserYear: number | null;
}

const PRICING_BANDS = [
  { maxUsers: 50, sixMonthRate: 79, yearRate: 71 },
  { maxUsers: 150, sixMonthRate: 76, yearRate: 68 },
  { maxUsers: 300, sixMonthRate: 70, yearRate: 63 },
  { maxUsers: 500, sixMonthRate: 65, yearRate: 59 },
  { maxUsers: 800, sixMonthRate: 59, yearRate: 53 },
  { maxUsers: 1500, sixMonthRate: 52, yearRate: 47 },
  { maxUsers: 2500, sixMonthRate: 50, yearRate: 45 },
  { maxUsers: 3500, sixMonthRate: 48, yearRate: 43 },
  { maxUsers: Infinity, sixMonthRate: 45, yearRate: 41 },
] as const;

function getPricingRates(users: number) {
  return PRICING_BANDS.find((b) => users <= b.maxUsers)!;
}

function buildPricingRow(users: number, orgs: number, employees: number): PricingRow {
  const { sixMonthRate, yearRate } = getPricingRates(users);
  const monthPrice = users * sixMonthRate;
  const quarterPrice = monthPrice * 3;
  const halfYearPrice = monthPrice * 6;
  const yearPrice = users * yearRate * 12;

  return {
    users,
    orgs,
    employees,
    monthPrice,
    quarterPrice,
    halfYearPrice,
    yearPrice,
    perUserMonth: sixMonthRate,
    perUserQuarter: sixMonthRate,
    perUserHalfYear: sixMonthRate,
    perUserYear: yearRate,
  };
}

/** Цены по новой сетке (6 и 12 месяцев), совместимо с калькулятором периодов. */
export const PRICING_ROWS: PricingRow[] = [
  buildPricingRow(50, 11, 246),
  buildPricingRow(100, 13, 1081),
  buildPricingRow(150, 8, 1015),
  buildPricingRow(200, 8, 1336),
  buildPricingRow(250, 5, 1104),
  buildPricingRow(300, 7, 1970),
  buildPricingRow(350, 6, 1924),
  buildPricingRow(400, 2, 739),
  buildPricingRow(450, 4, 1681),
  buildPricingRow(500, 4, 1848),
  buildPricingRow(600, 6, 3271),
  buildPricingRow(700, 3, 1897),
  buildPricingRow(800, 4, 2925),
  buildPricingRow(900, 5, 4257),
  buildPricingRow(1000, 3, 2831),
  buildPricingRow(1250, 8, 8931),
  buildPricingRow(1500, 7, 9719),
  buildPricingRow(1750, 5, 8270),
  buildPricingRow(2000, 2, 3737),
  buildPricingRow(2500, 4, 9458),
  buildPricingRow(3000, 7, 18822),
  buildPricingRow(3600, 3, 9687),
  { users: "3600+", orgs: 1, employees: 9521, monthPrice: null, quarterPrice: null, halfYearPrice: null, yearPrice: null, perUserMonth: null, perUserQuarter: null, perUserHalfYear: null, perUserYear: null },
];

/** Уровни для калькулятора (только числовые пользователи, без 3600+) */
export const PRICING_TIERS = PRICING_ROWS.filter(
  (r): r is PricingRow & { users: number } => typeof r.users === "number"
);

/** Дорожная карта на 1–2 года */
export const ROADMAP = [
  {
    period: "Ближайшее время",
    items: [
      "Отслеживание безопасности через ИИ (мониторинг инцидентов, рекомендации)",
      "Расширение документооборота (шаблоны, согласования, архивы)",
      "Больше скидок и партнёров для членов профсоюза",
    ],
  },
  {
    period: "6–12 месяцев",
    items: [
      "Образовательные курсы и материалы для профактива",
      "Подписки на западные сервисы (интеграции по запросу)",
    ],
  },
  {
    period: "1–2 года",
    items: [
      "Созвоны и видео-встречи прямо в чатах платформы",
      "Единое пространство для общения и совещаний",
    ],
  },
] as const;
