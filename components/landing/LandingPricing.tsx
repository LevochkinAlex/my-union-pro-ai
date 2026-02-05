"use client";

import { useState } from "react";
import { PRICING_TIERS, type PricingPeriod } from "@/lib/constants/landing";
import { cn } from "@/lib/design-system";

const PERIODS: { key: PricingPeriod; label: string; priceKey: "monthPrice" | "quarterPrice" | "halfYearPrice" | "yearPrice"; perUserKey: "perUserMonth" | "perUserQuarter" | "perUserHalfYear" | "perUserYear"; periodLabel: string }[] = [
  { key: "month", label: "Месяц", priceKey: "monthPrice", perUserKey: "perUserMonth", periodLabel: "месяц" },
  { key: "quarter", label: "Квартал", priceKey: "quarterPrice", perUserKey: "perUserQuarter", periodLabel: "квартал" },
  { key: "halfyear", label: "Полгода", priceKey: "halfYearPrice", perUserKey: "perUserHalfYear", periodLabel: "полгода" },
  { key: "year", label: "Год", priceKey: "yearPrice", perUserKey: "perUserYear", periodLabel: "год" },
];

function formatPrice(v: number): string {
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)} млн`;
  return Math.round(v).toLocaleString("ru-RU");
}

const MIN_INDEX = 0;
const MAX_INDEX = PRICING_TIERS.length - 1;

export default function LandingPricing() {
  const [period, setPeriod] = useState<PricingPeriod>("year");
  const [sliderIndex, setSliderIndex] = useState(4); // 200 users by default

  const currentPeriod = PERIODS.find((p) => p.key === period)!;
  const row = PRICING_TIERS[sliderIndex];
  const users = row.users;
  const totalPrice = row[currentPeriod.priceKey] as number;
  const perUser = row[currentPeriod.perUserKey] as number;

  const periodLabel = currentPeriod.periodLabel;

  return (
    <section id="pricing" className="scroll-mt-20 py-16 md:py-24">
      <div className="container mx-auto px-4">
        <h2 className="mb-2 text-center text-3xl font-bold tracking-tight text-foreground md:text-4xl landing-animate-in">
          Калькулятор стоимости
        </h2>
        <p className="mx-auto mb-10 max-w-2xl text-center text-muted-foreground landing-animate-in landing-animate-in-delay-1">
          Выберите количество пользователей и период — стоимость рассчитается автоматически.
        </p>

        <div className="mx-auto max-w-2xl rounded-2xl border border-border bg-card p-6 shadow-sm transition-shadow hover:shadow-md md:p-8 landing-animate-in landing-animate-in-delay-2">
          {/* Период */}
          <div className="mb-6">
            <p className="mb-2 text-sm font-medium text-muted-foreground">Период оплаты</p>
            <div className="flex flex-wrap gap-2">
              {PERIODS.map((p) => (
                <button
                  key={p.key}
                  type="button"
                  onClick={() => setPeriod(p.key)}
                  className={cn(
                    "rounded-lg px-4 py-2 text-sm font-medium transition-colors",
                    period === p.key
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-muted-foreground hover:bg-muted/80"
                  )}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          {/* Ползунок */}
          <div className="mb-8">
            <div className="mb-2 flex items-center justify-between">
              <label htmlFor="pricing-slider" className="text-sm font-medium text-foreground">
                Пользователей
              </label>
              <span className="text-lg font-semibold tabular-nums text-foreground">
                {users.toLocaleString("ru-RU")}
              </span>
            </div>
            <input
              id="pricing-slider"
              type="range"
              min={MIN_INDEX}
              max={MAX_INDEX}
              value={sliderIndex}
              onChange={(e) => setSliderIndex(Number(e.target.value))}
              className="h-3 w-full cursor-pointer appearance-none rounded-full bg-muted accent-primary [&::-webkit-slider-thumb]:h-5 [&::-webkit-slider-thumb]:w-5 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border-0 [&::-webkit-slider-thumb]:bg-primary [&::-webkit-slider-thumb]:shadow-md [&::-moz-range-thumb]:h-5 [&::-moz-range-thumb]:w-5 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:bg-primary"
            />
            <div className="mt-1 flex justify-between text-xs text-muted-foreground">
              <span>{PRICING_TIERS[MIN_INDEX].users}</span>
              <span>{PRICING_TIERS[MAX_INDEX].users}</span>
            </div>
          </div>

          {/* Итог */}
          <div className="rounded-xl bg-primary/10 p-6 text-center dark:bg-primary/15">
            <p className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
              Стоимость за {periodLabel}
            </p>
            <p className="mt-2 text-3xl font-bold tabular-nums text-foreground md:text-4xl">
              {formatPrice(totalPrice)} ₽
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              {perUser} ₽ за пользователя в месяц
            </p>
            {period !== "month" && (
              <p className="mt-1 text-xs text-green-600 dark:text-green-400">
                Экономия {Math.round((1 - perUser / row.perUserMonth!) * 100)}% при оплате за {periodLabel}
              </p>
            )}
          </div>
        </div>

        <p className="mt-6 text-center text-sm text-muted-foreground">
          Более 3600 пользователей —{" "}
          <a href="#contacts" className="font-medium text-primary hover:underline">
            индивидуальный расчёт
          </a>
          .
        </p>
      </div>
    </section>
  );
}
