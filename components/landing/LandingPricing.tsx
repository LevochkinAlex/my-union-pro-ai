"use client";

import { useState } from "react";
import { cn } from "@/lib/design-system";

const PRICING_BANDS = [
  { label: "0–50", users: 50, halfYear: 79, year: 71 },
  { label: "51–150", users: 150, halfYear: 76, year: 68 },
  { label: "151–300", users: 300, halfYear: 70, year: 63 },
  { label: "301–500", users: 500, halfYear: 65, year: 59 },
  { label: "501–800", users: 800, halfYear: 59, year: 53 },
  { label: "801–1 500", users: 1500, halfYear: 52, year: 47 },
  { label: "1 501–2 500", users: 2500, halfYear: 50, year: 45 },
  { label: "2 501–3 500", users: 3500, halfYear: 48, year: 43 },
  { label: "от 3 501", users: 5000, halfYear: 45, year: 41 },
] as const;

type Period = "halfYear" | "year";
const PERIODS: { key: Period; label: string; months: number }[] = [
  { key: "halfYear", label: "6 месяцев", months: 6 },
  { key: "year", label: "12 месяцев", months: 12 },
];

function fmt(n: number): string {
  return Math.round(n).toLocaleString("ru-RU");
}

export default function LandingPricing() {
  const [period, setPeriod] = useState<Period>("year");
  const [bandIdx, setBandIdx] = useState(3);

  const band = PRICING_BANDS[bandIdx];
  const rate = band[period];
  const months = PERIODS.find((p) => p.key === period)!.months;
  const total = band.users * rate * months;

  return (
    <section id="pricing" className="scroll-mt-20 py-16 md:py-24">
      <div className="container mx-auto px-4">
        <h2 className="mb-2 text-center text-3xl font-bold tracking-tight text-foreground md:text-4xl landing-animate-in">
          Стоимость
        </h2>
        <p className="mx-auto mb-10 max-w-2xl text-center text-muted-foreground landing-animate-in landing-animate-in-delay-1">
          Цена за одного пользователя в месяц (руб.). Минимальный период — 6 месяцев.
        </p>

        {/* Таблица */}
        <div className="mx-auto max-w-2xl overflow-x-auto rounded-xl border border-border bg-card shadow-sm landing-animate-in landing-animate-in-delay-2">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/50">
                <th className="px-4 py-3 text-left font-semibold text-foreground">Пользователей</th>
                <th className="px-4 py-3 text-center font-semibold text-foreground">6 мес.</th>
                <th className="px-4 py-3 text-center font-semibold text-foreground">12 мес.</th>
              </tr>
            </thead>
            <tbody>
              {PRICING_BANDS.map((b, i) => (
                <tr
                  key={i}
                  onClick={() => setBandIdx(i)}
                  className={cn(
                    "cursor-pointer border-b border-border last:border-0 transition-colors",
                    bandIdx === i
                      ? "bg-primary/10 dark:bg-primary/15"
                      : "hover:bg-muted/30"
                  )}
                >
                  <td className="px-4 py-2.5 font-medium text-foreground whitespace-nowrap">{b.label}</td>
                  <td className="px-4 py-2.5 text-center tabular-nums text-muted-foreground">{b.halfYear} ₽</td>
                  <td className="px-4 py-2.5 text-center tabular-nums text-muted-foreground">{b.year} ₽</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Калькулятор */}
        <div className="mx-auto mt-8 max-w-2xl rounded-2xl border border-border bg-card p-4 sm:p-6 md:p-8 shadow-sm landing-animate-in landing-animate-in-delay-3">
          <p className="mb-3 text-sm font-medium text-muted-foreground">Калькулятор</p>

          {/* Период */}
          <div className="mb-4 flex gap-2">
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

          {/* Ползунок */}
          <div className="mb-6">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-sm font-medium text-foreground">Пользователей</span>
              <span className="text-lg font-semibold tabular-nums text-foreground">{band.label}</span>
            </div>
            <input
              type="range"
              min={0}
              max={PRICING_BANDS.length - 1}
              value={bandIdx}
              onChange={(e) => setBandIdx(Number(e.target.value))}
              aria-label="Количество пользователей"
              title="Выберите количество пользователей"
              className="h-3 w-full cursor-pointer appearance-none rounded-full bg-muted accent-primary [&::-webkit-slider-thumb]:h-5 [&::-webkit-slider-thumb]:w-5 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border-0 [&::-webkit-slider-thumb]:bg-primary [&::-webkit-slider-thumb]:shadow-md [&::-webkit-slider-thumb]:cursor-pointer [&::-moz-range-thumb]:h-5 [&::-moz-range-thumb]:w-5 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:bg-primary [&::-moz-range-thumb]:cursor-pointer [&::-moz-range-track]:bg-muted [&::-moz-range-track]:rounded-full"
            />
          </div>

          {/* Итог */}
          <div className="rounded-xl bg-primary/10 p-4 sm:p-6 text-center dark:bg-primary/15">
            <p className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
              {rate} ₽ / пользователь / мес.
            </p>
            <p className="mt-2 text-2xl sm:text-3xl md:text-4xl font-bold tabular-nums text-foreground">
              {fmt(total)} ₽
            </p>
            <p className="mt-1 text-xs sm:text-sm text-muted-foreground">
              за {months} мес. на {fmt(band.users)} польз.
            </p>
            {period === "year" && (
              <p className="mt-1 text-xs text-green-600 dark:text-green-400">
                Экономия {Math.round((1 - band.year / band.halfYear) * 100)}% при оплате за год
              </p>
            )}
          </div>
        </div>

        <p className="mt-6 text-center text-sm text-muted-foreground">
          Более 3 500 пользователей —{" "}
          <a href="#contacts" className="font-medium text-primary hover:underline">
            индивидуальный расчёт
          </a>
          .
        </p>
      </div>
    </section>
  );
}
