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
} as const;

export const CONTACTS = [
  {
    name: "Анастасия Стрелкова",
    role: "Отдел продаж",
    email: "sales@myunion.pro",
    phone: "+7 995 095 55 93",
  },
  {
    name: "Ренат Усманов",
    role: "Генеральный директор",
    email: "ceo@yappix.ru",
    phone: "+7 987 415 78 97",
  },
  {
    name: "Алексей Новиков",
    role: "Безопасность и инфраструктура",
    email: "security@myunion.pro",
    phone: "+7 995 095 55 93",
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

/** Цены из файла «Расчет цены.xlsx»: пользователи, орги, работающие, цены за период и за пользователя */
export const PRICING_ROWS: PricingRow[] = [
  { users: 50, orgs: 11, employees: 246, monthPrice: 2250, quarterPrice: 6412.5, halfYearPrice: 12150, yearPrice: 21600, perUserMonth: 45, perUserQuarter: 42.75, perUserHalfYear: 40.5, perUserYear: 36 },
  { users: 100, orgs: 13, employees: 1081, monthPrice: 4000, quarterPrice: 11400, halfYearPrice: 21600, yearPrice: 38400, perUserMonth: 40, perUserQuarter: 38, perUserHalfYear: 36, perUserYear: 32 },
  { users: 150, orgs: 8, employees: 1015, monthPrice: 6000, quarterPrice: 17100, halfYearPrice: 32400, yearPrice: 57600, perUserMonth: 40, perUserQuarter: 38, perUserHalfYear: 36, perUserYear: 32 },
  { users: 200, orgs: 8, employees: 1336, monthPrice: 7000, quarterPrice: 19950, halfYearPrice: 37800, yearPrice: 67200, perUserMonth: 35, perUserQuarter: 33.25, perUserHalfYear: 31.5, perUserYear: 28 },
  { users: 250, orgs: 5, employees: 1104, monthPrice: 8750, quarterPrice: 24937.5, halfYearPrice: 47250, yearPrice: 84000, perUserMonth: 35, perUserQuarter: 33.25, perUserHalfYear: 31.5, perUserYear: 28 },
  { users: 300, orgs: 7, employees: 1970, monthPrice: 10500, quarterPrice: 29925, halfYearPrice: 56700, yearPrice: 100800, perUserMonth: 35, perUserQuarter: 33.25, perUserHalfYear: 31.5, perUserYear: 28 },
  { users: 350, orgs: 6, employees: 1924, monthPrice: 12250, quarterPrice: 34912.5, halfYearPrice: 66150, yearPrice: 117600, perUserMonth: 35, perUserQuarter: 33.25, perUserHalfYear: 31.5, perUserYear: 28 },
  { users: 400, orgs: 2, employees: 739, monthPrice: 14000, quarterPrice: 39900, halfYearPrice: 75600, yearPrice: 134400, perUserMonth: 35, perUserQuarter: 33.25, perUserHalfYear: 31.5, perUserYear: 28 },
  { users: 450, orgs: 4, employees: 1681, monthPrice: 15750, quarterPrice: 44887.5, halfYearPrice: 85050, yearPrice: 151200, perUserMonth: 35, perUserQuarter: 33.25, perUserHalfYear: 31.5, perUserYear: 28 },
  { users: 500, orgs: 4, employees: 1848, monthPrice: 17500, quarterPrice: 49875, halfYearPrice: 94500, yearPrice: 168000, perUserMonth: 35, perUserQuarter: 33.25, perUserHalfYear: 31.5, perUserYear: 28 },
  { users: 600, orgs: 6, employees: 3271, monthPrice: 19800, quarterPrice: 56430, halfYearPrice: 106920, yearPrice: 190080, perUserMonth: 33, perUserQuarter: 31.5, perUserHalfYear: 29.7, perUserYear: 26.4 },
  { users: 700, orgs: 3, employees: 1897, monthPrice: 23100, quarterPrice: 65835, halfYearPrice: 124740, yearPrice: 221760, perUserMonth: 33, perUserQuarter: 31.5, perUserHalfYear: 29.7, perUserYear: 26.4 },
  { users: 800, orgs: 4, employees: 2925, monthPrice: 26400, quarterPrice: 75240, halfYearPrice: 142560, yearPrice: 253440, perUserMonth: 33, perUserQuarter: 31.5, perUserHalfYear: 29.7, perUserYear: 26.4 },
  { users: 900, orgs: 5, employees: 4257, monthPrice: 29700, quarterPrice: 84645, halfYearPrice: 160380, yearPrice: 285120, perUserMonth: 33, perUserQuarter: 31.5, perUserHalfYear: 29.7, perUserYear: 26.4 },
  { users: 1000, orgs: 3, employees: 2831, monthPrice: 33000, quarterPrice: 94050, halfYearPrice: 178200, yearPrice: 316800, perUserMonth: 33, perUserQuarter: 31.5, perUserHalfYear: 29.7, perUserYear: 26.4 },
  { users: 1250, orgs: 8, employees: 8931, monthPrice: 41250, quarterPrice: 117562.5, halfYearPrice: 222750, yearPrice: 395568, perUserMonth: 33, perUserQuarter: 31.5, perUserHalfYear: 29.7, perUserYear: 26.4 },
  { users: 1500, orgs: 7, employees: 9719, monthPrice: 49500, quarterPrice: 141075, halfYearPrice: 267300, yearPrice: 475200, perUserMonth: 33, perUserQuarter: 31.5, perUserHalfYear: 29.7, perUserYear: 26.4 },
  { users: 1750, orgs: 5, employees: 8270, monthPrice: 57750, quarterPrice: 164587.5, halfYearPrice: 311850, yearPrice: 554400, perUserMonth: 33, perUserQuarter: 31.5, perUserHalfYear: 29.7, perUserYear: 26.4 },
  { users: 2000, orgs: 2, employees: 3737, monthPrice: 66000, quarterPrice: 188100, halfYearPrice: 356400, yearPrice: 633600, perUserMonth: 33, perUserQuarter: 31.5, perUserHalfYear: 29.7, perUserYear: 26.4 },
  { users: 2500, orgs: 4, employees: 9458, monthPrice: 75000, quarterPrice: 213750, halfYearPrice: 405000, yearPrice: 720000, perUserMonth: 30, perUserQuarter: 28.5, perUserHalfYear: 27, perUserYear: 24 },
  { users: 3000, orgs: 7, employees: 18822, monthPrice: 90000, quarterPrice: 256500, halfYearPrice: 486000, yearPrice: 864000, perUserMonth: 30, perUserQuarter: 28.5, perUserHalfYear: 27, perUserYear: 24 },
  { users: 3600, orgs: 3, employees: 9687, monthPrice: 108000, quarterPrice: 307800, halfYearPrice: 583200, yearPrice: 1036800, perUserMonth: 30, perUserQuarter: 28.5, perUserHalfYear: 27, perUserYear: 24 },
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
