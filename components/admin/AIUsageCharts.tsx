"use client";

import { useMemo } from "react";

/**
 * Нативные SVG-диаграммы для админской аналитики расходов ИИ.
 * Без внешних зависимостей (recharts/chart.js/...) — легче в бандле,
 * проще в гидратации и не ломается на Next.js 16.
 */

type DayPoint = { date: string; totalTokens: number; costKopecks: number; requests: number };
type SliceItem = { key: string; totalTokens: number; costKopecks: number; requests: number };

const CHART_PALETTE = [
  "#2563eb", // blue-600
  "#16a34a", // green-600
  "#f59e0b", // amber-500
  "#ef4444", // red-500
  "#8b5cf6", // violet-500
  "#0ea5e9", // sky-500
  "#14b8a6", // teal-500
  "#d946ef", // fuchsia-500
];

function formatCost(kopecks: number): string {
  const rub = kopecks / 100;
  if (rub >= 1000) return rub.toFixed(0) + " ₽";
  if (rub >= 1) return rub.toFixed(2) + " ₽";
  return (rub * 100).toFixed(0) + " коп.";
}

function formatNumber(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1) + "k";
  return String(n);
}

export function BarChartByDay({ data }: { data: DayPoint[] }) {
  const max = useMemo(
    () => Math.max(1, ...data.map((d) => d.totalTokens)),
    [data],
  );

  const W = 800;
  const H = 260;
  const PAD_L = 56;
  const PAD_R = 16;
  const PAD_T = 16;
  const PAD_B = 36;
  const chartW = W - PAD_L - PAD_R;
  const chartH = H - PAD_T - PAD_B;
  const barGap = 3;
  const barW = Math.max(3, (chartW - (data.length - 1) * barGap) / data.length);

  // 4 подписи оси Y (0, ⅓, ⅔, max)
  const yTicks = [0, Math.round(max / 3), Math.round((max * 2) / 3), max];

  // Показываем только каждый N-й ярлык оси X, чтобы не накладывались
  const labelStep = Math.max(1, Math.ceil(data.length / 10));

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
      <div className="mb-2 flex items-baseline justify-between">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Токены по дням</h3>
        <span className="text-xs text-gray-500 dark:text-gray-400">макс: {formatNumber(max)}</span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" role="img" aria-label="Токены по дням">
        {/* Y ticks */}
        {yTicks.map((v, i) => {
          const y = PAD_T + chartH - (v / max) * chartH;
          return (
            <g key={`y-${i}`}>
              <line x1={PAD_L} x2={PAD_L + chartW} y1={y} y2={y} stroke="currentColor" className="text-gray-200 dark:text-gray-700" strokeDasharray="2 3" />
              <text x={PAD_L - 6} y={y + 3} textAnchor="end" className="fill-gray-500 dark:fill-gray-400" fontSize="10">
                {formatNumber(v)}
              </text>
            </g>
          );
        })}

        {/* Bars */}
        {data.map((d, i) => {
          const x = PAD_L + i * (barW + barGap);
          const h = (d.totalTokens / max) * chartH;
          const y = PAD_T + chartH - h;
          return (
            <g key={`b-${i}`}>
              <title>
                {d.date}: {d.totalTokens.toLocaleString("ru-RU")} ток · {formatCost(d.costKopecks)} · {d.requests} запр.
              </title>
              <rect
                x={x}
                y={y}
                width={barW}
                height={Math.max(1, h)}
                rx={2}
                className="fill-blue-500 hover:fill-blue-600"
              />
              {i % labelStep === 0 && (
                <text
                  x={x + barW / 2}
                  y={H - 14}
                  textAnchor="middle"
                  className="fill-gray-500 dark:fill-gray-400"
                  fontSize="10"
                >
                  {d.date.slice(5)}
                </text>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
}

export function PieBySlice({
  title,
  data,
  keyLabel,
}: {
  title: string;
  data: SliceItem[];
  keyLabel?: (k: string) => string;
}) {
  const total = data.reduce((s, x) => s + x.totalTokens, 0);

  const R = 90;
  const C = 120;
  type Slice = {
    path: string | null; // null = единственный сегмент (рисуем circle)
    color: string;
    label: string;
    pct: number;
    tokens: number;
  };
  const slices: Slice[] = [];
  const EPS = 1e-6;

  if (total > 0) {
    // Считаем ненулевые сегменты
    const nonZero = data.filter((d) => d.totalTokens > 0);

    // Частный случай: ровно один ненулевой сегмент = 100%. SVG arc от -π/2 к 3π/2
    // возвращается в ту же точку → путь "M L A Z" не рисуется. Рендерим круг.
    if (nonZero.length === 1) {
      const d = nonZero[0];
      const idx = data.indexOf(d);
      slices.push({
        path: null,
        color: CHART_PALETTE[idx % CHART_PALETTE.length],
        label: keyLabel ? keyLabel(d.key) : d.key,
        pct: 100,
        tokens: d.totalTokens,
      });
    } else {
      let acc = 0;
      data.forEach((d, i) => {
        const frac = d.totalTokens / total;
        if (frac <= 0) return;
        // Если какой-то сегмент ≈ 100% внутри multi-slice (численная погрешность) —
        // всё равно рисуем его кругом.
        if (frac >= 1 - EPS) {
          slices.push({
            path: null,
            color: CHART_PALETTE[i % CHART_PALETTE.length],
            label: keyLabel ? keyLabel(d.key) : d.key,
            pct: 100,
            tokens: d.totalTokens,
          });
          acc += frac;
          return;
        }
        const a0 = acc * Math.PI * 2 - Math.PI / 2;
        const a1 = (acc + frac) * Math.PI * 2 - Math.PI / 2;
        const x0 = C + R * Math.cos(a0);
        const y0 = C + R * Math.sin(a0);
        const x1 = C + R * Math.cos(a1);
        const y1 = C + R * Math.sin(a1);
        const large = frac > 0.5 ? 1 : 0;
        slices.push({
          path: `M ${C} ${C} L ${x0} ${y0} A ${R} ${R} 0 ${large} 1 ${x1} ${y1} Z`,
          color: CHART_PALETTE[i % CHART_PALETTE.length],
          label: keyLabel ? keyLabel(d.key) : d.key,
          pct: frac * 100,
          tokens: d.totalTokens,
        });
        acc += frac;
      });
    }
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
      <h3 className="mb-3 text-sm font-semibold text-gray-900 dark:text-white">{title}</h3>
      <div className="flex items-center gap-6">
        <svg viewBox="0 0 240 240" className="h-40 w-40 shrink-0">
          {total === 0 ? (
            <>
              <circle cx={C} cy={C} r={R} className="fill-none stroke-gray-200 dark:stroke-gray-700" strokeWidth={18} />
              <text x={C} y={C + 5} textAnchor="middle" className="fill-gray-400" fontSize="14">
                нет данных
              </text>
            </>
          ) : (
            slices.map((s, i) =>
              s.path === null ? (
                <circle key={i} cx={C} cy={C} r={R} fill={s.color}>
                  <title>
                    {s.label}: 100% · {s.tokens.toLocaleString("ru-RU")} ток.
                  </title>
                </circle>
              ) : (
                <path key={i} d={s.path} fill={s.color}>
                  <title>
                    {s.label}: {s.pct.toFixed(1)}% · {s.tokens.toLocaleString("ru-RU")} ток.
                  </title>
                </path>
              ),
            )
          )}
        </svg>
        <ul className="flex-1 space-y-1 text-xs">
          {slices.map((a, i) => (
            <li key={i} className="flex items-center gap-2">
              {/* Цвет кубика берём из палитры — атрибут `fill` у SVG rect,
                  чтобы не использовать инлайн-CSS (webhint no-inline-styles). */}
              <svg
                width={12}
                height={12}
                aria-hidden
                className="shrink-0"
              >
                <rect width={12} height={12} rx={2} ry={2} fill={a.color} />
              </svg>
              <span className="flex-1 truncate text-gray-700 dark:text-gray-300" title={a.label}>
                {a.label}
              </span>
              <span className="text-gray-500 dark:text-gray-400">{a.pct.toFixed(1)}%</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
