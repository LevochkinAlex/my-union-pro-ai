/**
 * Тарифы по обновленному прайсу:
 * цена за 1 пользователя в месяц при оплате на 6 или 12 месяцев.
 */

export type TariffPeriod = "month" | "quarter" | "half_year" | "year";

export interface TariffPlan {
  key: string;
  memberLimit: number | null; // null = безлимит (договорная)
  label: string;
  pricePerMonth: number;
  pricePerQuarter: number;
  pricePerHalfYear: number;
  pricePerYear: number;
  pricePerUserPerMonth: number;
  pricePerUserPerYear: number;
  isUnlimited?: boolean;
}

/** Тарифные планы по количеству участников (из прайса) */
const PRICE_BANDS = [
  { max: 50, sixMonthRate: 79, yearRate: 71 },
  { max: 150, sixMonthRate: 76, yearRate: 68 },
  { max: 300, sixMonthRate: 70, yearRate: 63 },
  { max: 500, sixMonthRate: 65, yearRate: 59 },
  { max: 800, sixMonthRate: 59, yearRate: 53 },
  { max: 1500, sixMonthRate: 52, yearRate: 47 },
  { max: 2500, sixMonthRate: 50, yearRate: 45 },
  { max: 3500, sixMonthRate: 48, yearRate: 43 },
  { max: Infinity, sixMonthRate: 45, yearRate: 41 },
] as const;

function getBandRates(memberLimit: number) {
  const band = PRICE_BANDS.find((b) => memberLimit <= b.max)!;
  return { sixMonthRate: band.sixMonthRate, yearRate: band.yearRate };
}

function buildPlan(key: string, memberLimit: number, label: string): TariffPlan {
  const { sixMonthRate, yearRate } = getBandRates(memberLimit);
  const pricePerMonth = memberLimit * sixMonthRate;
  const pricePerQuarter = pricePerMonth * 3;
  const pricePerHalfYear = pricePerMonth * 6;
  const pricePerYear = memberLimit * yearRate * 12;

  return {
    key,
    memberLimit,
    label,
    pricePerMonth,
    pricePerQuarter,
    pricePerHalfYear,
    pricePerYear,
    pricePerUserPerMonth: sixMonthRate,
    pricePerUserPerYear: yearRate * 12,
  };
}

export const TARIFF_PLANS: TariffPlan[] = [
  buildPlan("50", 50, "До 50 участников"),
  buildPlan("100", 100, "До 100 участников"),
  buildPlan("150", 150, "До 150 участников"),
  buildPlan("200", 200, "До 200 участников"),
  buildPlan("250", 250, "До 250 участников"),
  buildPlan("300", 300, "До 300 участников"),
  buildPlan("350", 350, "До 350 участников"),
  buildPlan("400", 400, "До 400 участников"),
  buildPlan("450", 450, "До 450 участников"),
  buildPlan("500", 500, "До 500 участников"),
  buildPlan("600", 600, "До 600 участников"),
  buildPlan("700", 700, "До 700 участников"),
  buildPlan("800", 800, "До 800 участников"),
  buildPlan("900", 900, "До 900 участников"),
  buildPlan("1000", 1000, "До 1000 участников"),
  buildPlan("1250", 1250, "До 1250 участников"),
  buildPlan("1500", 1500, "До 1500 участников"),
  buildPlan("1750", 1750, "До 1750 участников"),
  buildPlan("2000", 2000, "До 2000 участников"),
  buildPlan("2500", 2500, "До 2500 участников"),
  buildPlan("3000", 3000, "До 3000 участников"),
  buildPlan("3600", 3600, "До 3600 участников"),
  { key: "UNLIMITED", memberLimit: null, label: "Более 3600 (договорная)", pricePerMonth: 0, pricePerQuarter: 0, pricePerHalfYear: 0, pricePerYear: 0, pricePerUserPerMonth: 0, pricePerUserPerYear: 0, isUnlimited: true },
];

export const TRIAL_DAYS = 14;
export const RENEWAL_REMINDER_DAYS = 7;

export function getTariffByKey(key: string): TariffPlan | undefined {
  return TARIFF_PLANS.find((p) => p.key === key);
}

export function getTariffByMemberCount(members: number): TariffPlan | undefined {
  const withLimit = TARIFF_PLANS.filter((p) => p.memberLimit != null) as (TariffPlan & { memberLimit: number })[];
  const suitable = withLimit.filter((p) => p.memberLimit >= members).sort((a, b) => a.memberLimit - b.memberLimit);
  return suitable[0] ?? TARIFF_PLANS.find((p) => p.key === "UNLIMITED");
}

export function getPriceForPeriod(plan: TariffPlan, period: TariffPeriod): number {
  switch (period) {
    case "month":
      return plan.pricePerMonth;
    case "quarter":
      return plan.pricePerQuarter;
    case "half_year":
      return plan.pricePerHalfYear;
    case "year":
      return plan.pricePerYear;
    default:
      return plan.pricePerMonth;
  }
}

export function getPeriodDays(period: TariffPeriod): number {
  switch (period) {
    case "month":
      return 30;
    case "quarter":
      return 90;
    case "half_year":
      return 180;
    case "year":
      return 365;
    default:
      return 30;
  }
}

export function formatPrice(rub: number): string {
  if (rub === 0) return "Договорная";
  return new Intl.NumberFormat("ru-RU", { style: "currency", currency: "RUB", maximumFractionDigits: 0 }).format(rub);
}
