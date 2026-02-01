/**
 * Тарифы по прайсу «Расчет цены.xlsx».
 * Кол-во участников → цена за месяц / квартал / полгода / год (в рублях).
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
export const TARIFF_PLANS: TariffPlan[] = [
  { key: "50", memberLimit: 50, label: "До 50 участников", pricePerMonth: 2250, pricePerQuarter: 6412.5, pricePerHalfYear: 12150, pricePerYear: 21600, pricePerUserPerMonth: 45, pricePerUserPerYear: 432 },
  { key: "100", memberLimit: 100, label: "До 100 участников", pricePerMonth: 4000, pricePerQuarter: 11400, pricePerHalfYear: 21600, pricePerYear: 38400, pricePerUserPerMonth: 40, pricePerUserPerYear: 384 },
  { key: "150", memberLimit: 150, label: "До 150 участников", pricePerMonth: 6000, pricePerQuarter: 17100, pricePerHalfYear: 32400, pricePerYear: 57600, pricePerUserPerMonth: 40, pricePerUserPerYear: 384 },
  { key: "200", memberLimit: 200, label: "До 200 участников", pricePerMonth: 7000, pricePerQuarter: 19950, pricePerHalfYear: 37800, pricePerYear: 67200, pricePerUserPerMonth: 35, pricePerUserPerYear: 336 },
  { key: "250", memberLimit: 250, label: "До 250 участников", pricePerMonth: 8750, pricePerQuarter: 24937.5, pricePerHalfYear: 47250, pricePerYear: 84000, pricePerUserPerMonth: 35, pricePerUserPerYear: 336 },
  { key: "300", memberLimit: 300, label: "До 300 участников", pricePerMonth: 10500, pricePerQuarter: 29925, pricePerHalfYear: 56700, pricePerYear: 100800, pricePerUserPerMonth: 35, pricePerUserPerYear: 336 },
  { key: "350", memberLimit: 350, label: "До 350 участников", pricePerMonth: 12250, pricePerQuarter: 34912.5, pricePerHalfYear: 66150, pricePerYear: 117600, pricePerUserPerMonth: 35, pricePerUserPerYear: 336 },
  { key: "400", memberLimit: 400, label: "До 400 участников", pricePerMonth: 14000, pricePerQuarter: 39900, pricePerHalfYear: 75600, pricePerYear: 134400, pricePerUserPerMonth: 35, pricePerUserPerYear: 336 },
  { key: "450", memberLimit: 450, label: "До 450 участников", pricePerMonth: 15750, pricePerQuarter: 44887.5, pricePerHalfYear: 85050, pricePerYear: 151200, pricePerUserPerMonth: 35, pricePerUserPerYear: 336 },
  { key: "500", memberLimit: 500, label: "До 500 участников", pricePerMonth: 17500, pricePerQuarter: 49875, pricePerHalfYear: 94500, pricePerYear: 168000, pricePerUserPerMonth: 35, pricePerUserPerYear: 336 },
  { key: "600", memberLimit: 600, label: "До 600 участников", pricePerMonth: 19800, pricePerQuarter: 56430, pricePerHalfYear: 106920, pricePerYear: 190080, pricePerUserPerMonth: 33, pricePerUserPerYear: 316.8 },
  { key: "700", memberLimit: 700, label: "До 700 участников", pricePerMonth: 23100, pricePerQuarter: 65835, pricePerHalfYear: 124740, pricePerYear: 221760, pricePerUserPerMonth: 33, pricePerUserPerYear: 316.8 },
  { key: "800", memberLimit: 800, label: "До 800 участников", pricePerMonth: 26400, pricePerQuarter: 75240, pricePerHalfYear: 142560, pricePerYear: 253440, pricePerUserPerMonth: 33, pricePerUserPerYear: 316.8 },
  { key: "900", memberLimit: 900, label: "До 900 участников", pricePerMonth: 29700, pricePerQuarter: 84645, pricePerHalfYear: 160380, pricePerYear: 285120, pricePerUserPerMonth: 33, pricePerUserPerYear: 316.8 },
  { key: "1000", memberLimit: 1000, label: "До 1000 участников", pricePerMonth: 33000, pricePerQuarter: 94050, pricePerHalfYear: 178200, pricePerYear: 316800, pricePerUserPerMonth: 33, pricePerUserPerYear: 316.8 },
  { key: "1250", memberLimit: 1250, label: "До 1250 участников", pricePerMonth: 41250, pricePerQuarter: 117562.5, pricePerHalfYear: 222750, pricePerYear: 395568, pricePerUserPerMonth: 33, pricePerUserPerYear: 316.8 },
  { key: "1500", memberLimit: 1500, label: "До 1500 участников", pricePerMonth: 49500, pricePerQuarter: 141075, pricePerHalfYear: 267300, pricePerYear: 475200, pricePerUserPerMonth: 33, pricePerUserPerYear: 316.8 },
  { key: "1750", memberLimit: 1750, label: "До 1750 участников", pricePerMonth: 57750, pricePerQuarter: 164587.5, pricePerHalfYear: 311850, pricePerYear: 554400, pricePerUserPerMonth: 33, pricePerUserPerYear: 316.8 },
  { key: "2000", memberLimit: 2000, label: "До 2000 участников", pricePerMonth: 66000, pricePerQuarter: 188100, pricePerHalfYear: 356400, pricePerYear: 633600, pricePerUserPerMonth: 33, pricePerUserPerYear: 316.8 },
  { key: "2500", memberLimit: 2500, label: "До 2500 участников", pricePerMonth: 75000, pricePerQuarter: 213750, pricePerHalfYear: 405000, pricePerYear: 720000, pricePerUserPerMonth: 30, pricePerUserPerYear: 288 },
  { key: "3000", memberLimit: 3000, label: "До 3000 участников", pricePerMonth: 90000, pricePerQuarter: 256500, pricePerHalfYear: 486000, pricePerYear: 864000, pricePerUserPerMonth: 30, pricePerUserPerYear: 288 },
  { key: "3600", memberLimit: 3600, label: "До 3600 участников", pricePerMonth: 108000, pricePerQuarter: 307800, pricePerHalfYear: 583200, pricePerYear: 1036800, pricePerUserPerMonth: 30, pricePerUserPerYear: 288 },
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
