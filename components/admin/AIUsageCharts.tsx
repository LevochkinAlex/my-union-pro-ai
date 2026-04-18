"use client";

import { useMemo } from "react";

/**
 * Нативные SVG-диаграммы для админской аналитики расходов ИИ.
 * Без внешних зависимостей (recharts/chart.js/...) — легче в бандле,
 * проще в гидратации и не ломается на Next.js 16.
 */

type DayPoint = {
  date: string;
  totalTokens: number;
  costKopecks: number;
  requests: number;
};
type SliceItem = {
  key: string;
  totalTokens: number;
  costKopecks: number;
  requests: number;
};

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

/**
 * Округление до «красивого» числа вверх: 1204 → 1500, 83 → 100.
 * Используется для верхней границы оси Y, чтобы подписи были
 * ровные (0 / 500 / 1000 / 1500), а не 0/401/803/1204.
 */
function niceCeil(v: number): number {
  if (v <= 0) return 1;
  const mag = Math.pow(10, Math.floor(Math.log10(v)));
  const norm = v / mag;
  let nice: number;
  if (norm <= 1) nice = 1;
  else if (norm <= 2) nice = 2;
  else if (norm <= 2.5) nice = 2.5;
  else if (norm <= 5) nice = 5;
  else nice = 10;
  return nice * mag;
}

export function BarChartByDay({ data }: { data: DayPoint[] }) {
  const rawMax = useMemo(() => Math.max(0, ...data.map((d) => d.totalTokens)), [data]);
  const max = rawMax === 0 ? 1 : niceCeil(rawMax);

  const W = 800;
  const H = 240;
  const PAD_L = 48;
  const PAD_R = 12;
  const PAD_T = 12;
  const PAD_B = 28;
  const chartW = W - PAD_L - PAD_R;
  const chartH = H - PAD_T - PAD_B;

  // Расстояние между колонками регулируем, чтобы единичный столбец не выглядел
  // как толстая полоса на всю ширину — ограничиваем максимальную ширину.
  const slotW = chartW / Math.max(1, data.length);
  const barW = Math.min(28, Math.max(3, slotW - 3));
  const barGap = Math.max(1, slotW - barW);

  // 5 делений по оси Y, ровные значения
  const yTicks = [0, max / 4, max / 2, (max * 3) / 4, max];

  // Подписи оси X: максимум ~10 ярлыков
  const labelStep = Math.max(1, Math.ceil(data.length / 10));

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
      <div className="mb-2 flex items-baseline justify-between">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Токены по дням</h3>
        <span className="text-xs text-gray-500 dark:text-gray-400">
          макс: {formatNumber(rawMax)}
        </span>
      </div>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="h-auto w-full"
        role="img"
        aria-label="Токены по дням"
      >
        {/* Горизонтальные линии сетки */}
        {yTicks.map((v, i) => {
          const y = PAD_T + chartH - (v / max) * chartH;
          return (
            <g key={`y-${i}`}>
              <line
                x1={PAD_L}
                x2={PAD_L + chartW}
                y1={y}
                y2={y}
                stroke="currentColor"
                className="text-gray-200 dark:text-gray-700"
                strokeDasharray={i === 0 ? "0" : "2 3"}
              />
              <text
                x={PAD_L - 6}
                y={y + 3}
                textAnchor="end"
                className="fill-gray-500 dark:fill-gray-400"
                fontSize="10"
              >
                {formatNumber(Math.round(v))}
              </text>
            </g>
          );
        })}

        {/* Столбцы */}
        {data.map((d, i) => {
          const cx = PAD_L + (i + 0.5) * slotW;
          const x = cx - barW / 2;
          const h = (d.totalTokens / max) * chartH;
          const y = PAD_T + chartH - h;
          return (
            <g key={`b-${i}`}>
              <title>
                {d.date}: {d.totalTokens.toLocaleString("ru-RU")} ток · {formatCost(d.costKopecks)} ·{" "}
                {d.requests} запр.
              </title>
              {/* Невидимая «hit-зона» на всю колонку для удобного hover */}
              <rect
                x={PAD_L + i * slotW}
                y={PAD_T}
                width={slotW}
                height={chartH}
                fill="transparent"
              />
              {d.totalTokens > 0 && (
                <rect
                  x={x}
                  y={y}
                  width={barW}
                  height={Math.max(1, h)}
                  rx={2}
                  className="fill-blue-500 hover:fill-blue-600"
                />
              )}
              {i % labelStep === 0 && (
                <text
                  x={cx}
                  y={H - 10}
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

        {/* Подсказка для «одно событие за 30 дней» */}
        {rawMax === 0 && (
          <text
            x={W / 2}
            y={H / 2}
            textAnchor="middle"
            className="fill-gray-400 dark:fill-gray-500"
            fontSize="14"
          >
            Нет запросов за период
          </text>
        )}
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

  // Кольцевой (donut) вариант — заметно аккуратнее, чем сплошной круг при
  // 100% одного сегмента: дырка в центре даёт ощущение «чарта», а не просто
  // залитого кружка.
  const R_OUT = 100;
  const R_IN = 58;
  const C = 120;

  type Slice = {
    path: string | null; // null = единственный сегмент (рисуем ring)
    color: string;
    label: string;
    pct: number;
    tokens: number;
  };
  const slices: Slice[] = [];
  const EPS = 1e-6;

  if (total > 0) {
    const nonZero = data.filter((d) => d.totalTokens > 0);

    // Частный случай: 100% у одного сегмента. SVG arc 0→2π возвращается
    // в ту же точку и путь не рисуется. Рендерим кольцо (два круга fill-rule evenodd).
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
        const xo0 = C + R_OUT * Math.cos(a0);
        const yo0 = C + R_OUT * Math.sin(a0);
        const xo1 = C + R_OUT * Math.cos(a1);
        const yo1 = C + R_OUT * Math.sin(a1);
        const xi1 = C + R_IN * Math.cos(a1);
        const yi1 = C + R_IN * Math.sin(a1);
        const xi0 = C + R_IN * Math.cos(a0);
        const yi0 = C + R_IN * Math.sin(a0);
        const large = frac > 0.5 ? 1 : 0;
        slices.push({
          path:
            `M ${xo0} ${yo0} A ${R_OUT} ${R_OUT} 0 ${large} 1 ${xo1} ${yo1} ` +
            `L ${xi1} ${yi1} A ${R_IN} ${R_IN} 0 ${large} 0 ${xi0} ${yi0} Z`,
          color: CHART_PALETTE[i % CHART_PALETTE.length],
          label: keyLabel ? keyLabel(d.key) : d.key,
          pct: frac * 100,
          tokens: d.totalTokens,
        });
        acc += frac;
      });
    }
  }

  // Метка в центре — всегда. Либо общая сумма токенов, либо «—».
  const centerMain = formatNumber(total);
  const centerSub = total > 0 ? "ток." : "нет данных";

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
      <h3 className="mb-3 text-sm font-semibold text-gray-900 dark:text-white">{title}</h3>
      <div className="flex items-center gap-4">
        <svg viewBox="0 0 240 240" className="h-32 w-32 shrink-0 md:h-36 md:w-36" aria-hidden>
          {total === 0 ? (
            <>
              {/* Пустой donut с обводкой */}
              <circle
                cx={C}
                cy={C}
                r={(R_OUT + R_IN) / 2}
                className="fill-none stroke-gray-200 dark:stroke-gray-700"
                strokeWidth={R_OUT - R_IN}
              />
            </>
          ) : (
            slices.map((s, i) =>
              s.path === null ? (
                // Donut единственного сегмента: внешний круг, вырез внутри
                <g key={i}>
                  <circle cx={C} cy={C} r={R_OUT} fill={s.color}>
                    <title>
                      {s.label}: 100% · {s.tokens.toLocaleString("ru-RU")} ток.
                    </title>
                  </circle>
                  <circle
                    cx={C}
                    cy={C}
                    r={R_IN}
                    className="fill-white dark:fill-gray-800"
                  />
                </g>
              ) : (
                <path key={i} d={s.path} fill={s.color}>
                  <title>
                    {s.label}: {s.pct.toFixed(1)}% · {s.tokens.toLocaleString("ru-RU")} ток.
                  </title>
                </path>
              ),
            )
          )}

          {/* Центральная метка (всегда) */}
          <text
            x={C}
            y={C - 4}
            textAnchor="middle"
            className="fill-gray-900 dark:fill-white"
            fontSize="26"
            fontWeight="700"
          >
            {centerMain}
          </text>
          <text
            x={C}
            y={C + 18}
            textAnchor="middle"
            className="fill-gray-500 dark:fill-gray-400"
            fontSize="12"
          >
            {centerSub}
          </text>
        </svg>

        <ul className="min-w-0 flex-1 space-y-1.5 text-xs">
          {slices.length === 0 ? (
            <li className="text-gray-500 dark:text-gray-400">Нет данных за период</li>
          ) : (
            slices.map((a, i) => (
              <li key={i} className="flex items-center gap-2">
                {/* Цветной маркер — SVG rect, без inline style (webhint). */}
                <svg width={10} height={10} aria-hidden className="shrink-0">
                  <rect width={10} height={10} rx={2} ry={2} fill={a.color} />
                </svg>
                <span
                  className="flex-1 truncate text-gray-700 dark:text-gray-300"
                  title={a.label}
                >
                  {a.label}
                </span>
                <span className="shrink-0 tabular-nums text-gray-500 dark:text-gray-400">
                  {a.pct.toFixed(1)}%
                </span>
              </li>
            ))
          )}
        </ul>
      </div>
    </div>
  );
}
