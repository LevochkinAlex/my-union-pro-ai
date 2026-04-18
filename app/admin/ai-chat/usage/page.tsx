"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { BarChartByDay, PieBySlice } from "@/components/admin/AIUsageCharts";

type UsageResponse = {
  days: number;
  totals: {
    requests: number;
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
    costKopecks: number;
    errors: number;
  };
  byDay: Array<{ date: string; totalTokens: number; costKopecks: number; requests: number }>;
  byModel: Array<{ key: string; totalTokens: number; costKopecks: number; requests: number }>;
  byOperation: Array<{ key: string; totalTokens: number; costKopecks: number; requests: number }>;
  byRoute: Array<{ key: string; totalTokens: number; costKopecks: number; requests: number }>;
  topUsers: Array<{
    userId: string;
    name: string;
    email: string | null;
    role: string | null;
    totalTokens: number;
    costKopecks: number;
    requests: number;
  }>;
  topBots: Array<{
    botId: string;
    name: string;
    model: string | null;
    totalTokens: number;
    costKopecks: number;
    requests: number;
  }>;
  recent: Array<{
    id: string;
    createdAt: string;
    operation: string;
    route: string;
    model: string;
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
    costKopecks: number;
    durationMs: number | null;
    status: string;
    userName: string | null;
  }>;
};

function formatCost(kopecks: number): string {
  const rub = kopecks / 100;
  if (rub >= 1000) return rub.toFixed(0) + " ₽";
  if (rub >= 1) return rub.toFixed(2) + " ₽";
  return (rub * 100).toFixed(0) + " коп.";
}

function formatNumber(n: number): string {
  return n.toLocaleString("ru-RU");
}

const ROUTE_LABELS: Record<string, string> = {
  "assistant/chat": "Ассистент (пользователи)",
  "assistant/chat:demo": "Ассистент (демо)",
  "assistant/demo-chat": "Демо-чат на лендинге",
  "chat/ai": "ИИ-чат (виджет)",
  "landing/chat": "Лендинг: чат с AI-помощником",
  "landing-chat": "Лендинг: лид-чат",
  "ai/improve-text": "Улучшение текста",
  "ai/generate-article": "Генерация статьи",
  "ai/rewrite-article": "Рерайт текста",
  "embedding/doc": "Эмбеддинг документа",
  "embedding/query": "Эмбеддинг запроса",
};

const MODEL_LABELS: Record<string, string> = {
  yandexgpt: "YandexGPT",
  "yandexgpt-lite": "YandexGPT Lite",
  "yandexgpt-32k": "YandexGPT 32k",
  "yandexgpt-5-pro": "YandexGPT 5 Pro",
  "yandexgpt-5-lite": "YandexGPT 5 Lite",
  "text-search-doc": "Эмбеддинг (документ)",
  "text-search-query": "Эмбеддинг (запрос)",
};

const OPERATION_LABELS: Record<string, string> = {
  chat: "Чат",
  embedding: "Эмбеддинги",
};

export default function AIUsagePage() {
  const [days, setDays] = useState(30);
  const [data, setData] = useState<UsageResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (d: number) => {
    setLoading(true);
    setError(null);
    try {
      const resp = await fetch(`/api/admin/ai/usage?days=${d}`, { cache: "no-store" });
      if (!resp.ok) throw new Error("Не удалось загрузить аналитику");
      const json = (await resp.json()) as UsageResponse;
      setData(json);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка загрузки");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load(days);
  }, [days, load]);

  const errorRate = useMemo(() => {
    if (!data || data.totals.requests === 0) return 0;
    return (data.totals.errors / data.totals.requests) * 100;
  }, [data]);

  return (
    <div className="space-y-6 min-w-0 w-full">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div className="min-w-0">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Аналитика расходов ИИ</h1>
          <p className="mt-1 text-gray-600 dark:text-gray-400">
            Расходы на Yandex Foundation Models в разрезе времени, моделей, пользователей и ботов.
            Каждый вызов чата и embedding логируется автоматически.
          </p>
        </div>
        <div className="inline-flex shrink-0 self-start gap-0.5 rounded-lg bg-gray-100 p-1 dark:bg-gray-800">
          {[7, 30, 90, 180].map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => setDays(d)}
              className={`whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                days === d
                  ? "bg-white shadow-sm text-gray-900 dark:bg-gray-700 dark:text-white"
                  : "text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white"
              }`}
            >
              {d} дн.
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800 dark:border-red-900/40 dark:bg-red-900/20 dark:text-red-200">
          {error}
        </div>
      )}

      {/* KPI cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          label="Запросов"
          value={data ? formatNumber(data.totals.requests) : "—"}
          sub={`за ${days} дн.`}
          loading={loading}
        />
        <KpiCard
          label="Токенов (всего)"
          value={data ? formatNumber(data.totals.totalTokens) : "—"}
          sub={
            data
              ? `in ${formatNumber(data.totals.inputTokens)} · out ${formatNumber(data.totals.outputTokens)}`
              : undefined
          }
          loading={loading}
        />
        <KpiCard
          label="Оценка стоимости"
          value={data ? formatCost(data.totals.costKopecks) : "—"}
          sub="по тарифам Yandex"
          loading={loading}
          accent="green"
        />
        <KpiCard
          label="Ошибок"
          value={data ? `${data.totals.errors}` : "—"}
          sub={data ? `${errorRate.toFixed(1)}% от всех` : undefined}
          loading={loading}
          accent={errorRate > 5 ? "red" : "gray"}
        />
      </div>

      {/* Bar + Pies */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          {data && <BarChartByDay data={data.byDay} />}
          {!data && <PlaceholderCard />}
        </div>
        <div className="space-y-4">
          {data && (
            <>
              <PieBySlice
                title="Чат vs эмбеддинги"
                data={data.byOperation}
                keyLabel={(k) => OPERATION_LABELS[k] ?? k}
              />
              <PieBySlice
                title="По моделям"
                data={data.byModel}
                keyLabel={(k) => MODEL_LABELS[k] ?? k}
              />
            </>
          )}
          {!data && (
            <>
              <PlaceholderCard />
              <PlaceholderCard />
            </>
          )}
        </div>
      </div>

      {/* By route */}
      <div className="rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
        <h3 className="mb-3 text-sm font-semibold text-gray-900 dark:text-white">
          Разрез по источникам запроса
        </h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-left text-xs uppercase tracking-wide text-gray-500 dark:border-gray-700 dark:text-gray-400">
                <th className="py-2">Источник</th>
                <th className="py-2 text-right">Запросов</th>
                <th className="py-2 text-right">Токенов</th>
                <th className="py-2 text-right">Стоимость</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
              {(data?.byRoute ?? []).map((r) => (
                <tr key={r.key}>
                  <td className="py-2 text-gray-900 dark:text-white">
                    {ROUTE_LABELS[r.key] ?? r.key}
                    <span className="ml-2 text-xs text-gray-500 dark:text-gray-400">{r.key}</span>
                  </td>
                  <td className="py-2 text-right tabular-nums text-gray-700 dark:text-gray-300">
                    {formatNumber(r.requests)}
                  </td>
                  <td className="py-2 text-right tabular-nums text-gray-700 dark:text-gray-300">
                    {formatNumber(r.totalTokens)}
                  </td>
                  <td className="py-2 text-right tabular-nums font-medium text-gray-900 dark:text-white">
                    {formatCost(r.costKopecks)}
                  </td>
                </tr>
              ))}
              {data && data.byRoute.length === 0 && (
                <tr>
                  <td colSpan={4} className="py-6 text-center text-sm text-gray-500 dark:text-gray-400">
                    Нет данных за период
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Top users + Top bots */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <TopTable
          title="Топ-10 пользователей"
          rows={(data?.topUsers ?? []).map((u) => ({
            id: u.userId,
            primary: u.name,
            secondary: u.email ?? u.role ?? "—",
            requests: u.requests,
            tokens: u.totalTokens,
            cost: u.costKopecks,
          }))}
        />
        <TopTable
          title="Топ-10 ботов"
          rows={(data?.topBots ?? []).map((b) => ({
            id: b.botId,
            primary: b.name,
            secondary: b.model ?? "—",
            requests: b.requests,
            tokens: b.totalTokens,
            cost: b.costKopecks,
          }))}
        />
      </div>

      {/* Recent events */}
      <div className="rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
        <h3 className="mb-3 text-sm font-semibold text-gray-900 dark:text-white">
          Последние события <span className="text-xs font-normal text-gray-500">(50)</span>
        </h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-left text-xs uppercase tracking-wide text-gray-500 dark:border-gray-700 dark:text-gray-400">
                <th className="py-2">Время</th>
                <th className="py-2">Источник</th>
                <th className="py-2">Модель</th>
                <th className="py-2">Пользователь</th>
                <th className="py-2 text-right">Токены</th>
                <th className="py-2 text-right">Стоимость</th>
                <th className="py-2 text-right">Статус</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
              {(data?.recent ?? []).map((ev) => (
                <tr key={ev.id}>
                  <td className="py-2 whitespace-nowrap text-xs text-gray-500 dark:text-gray-400">
                    {new Date(ev.createdAt).toLocaleString("ru-RU")}
                  </td>
                  <td className="py-2 text-xs text-gray-700 dark:text-gray-300">
                    {ROUTE_LABELS[ev.route] ?? ev.route}
                  </td>
                  <td className="py-2 text-xs text-gray-700 dark:text-gray-300">
                    {MODEL_LABELS[ev.model] ?? ev.model}
                  </td>
                  <td className="py-2 text-xs text-gray-700 dark:text-gray-300">{ev.userName ?? "—"}</td>
                  <td className="py-2 text-right tabular-nums text-gray-700 dark:text-gray-300">
                    {formatNumber(ev.totalTokens)}
                  </td>
                  <td className="py-2 text-right tabular-nums font-medium text-gray-900 dark:text-white">
                    {formatCost(ev.costKopecks)}
                  </td>
                  <td className="py-2 text-right">
                    {ev.status === "ok" ? (
                      <span className="inline-flex items-center rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-800 dark:bg-green-900/30 dark:text-green-300">
                        ok
                      </span>
                    ) : (
                      <span
                        className="inline-flex items-center rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-800 dark:bg-red-900/30 dark:text-red-300"
                        title={ev.status}
                      >
                        error
                      </span>
                    )}
                  </td>
                </tr>
              ))}
              {data && data.recent.length === 0 && (
                <tr>
                  <td colSpan={7} className="py-6 text-center text-sm text-gray-500 dark:text-gray-400">
                    Событий за период нет
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <p className="text-xs text-gray-500 dark:text-gray-400">
        Стоимость оценочная: считается локально по тарифам Yandex Foundation Models
        на момент вызова. Yandex в биллинге отдельно считает кэшированные входные
        токены (по тому же тарифу), их API usage не возвращает — поэтому наша
        итоговая сумма обычно совпадает с биллингом Yandex Cloud в пределах
        нескольких процентов. Точные расходы — в{" "}
        <a
          href="https://console.yandex.cloud/billing/detailing"
          target="_blank"
          rel="noopener noreferrer"
          className="underline hover:text-gray-700 dark:hover:text-gray-300"
        >
          Yandex Cloud Billing
        </a>
        .
      </p>
    </div>
  );
}

function KpiCard({
  label,
  value,
  sub,
  loading,
  accent = "blue",
}: {
  label: string;
  value: string;
  sub?: string;
  loading?: boolean;
  accent?: "blue" | "green" | "red" | "gray";
}) {
  const accentColor =
    accent === "green"
      ? "text-green-600 dark:text-green-400"
      : accent === "red"
        ? "text-red-600 dark:text-red-400"
        : accent === "gray"
          ? "text-gray-900 dark:text-white"
          : "text-blue-600 dark:text-blue-400";
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
      <p className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">{label}</p>
      <p className={`mt-1 text-2xl font-bold tabular-nums ${accentColor}`}>
        {loading ? "…" : value}
      </p>
      {sub && <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{sub}</p>}
    </div>
  );
}

function PlaceholderCard() {
  return (
    <div className="h-64 rounded-xl border border-dashed border-gray-200 bg-gray-50 dark:border-gray-700 dark:bg-gray-800/40 animate-pulse" />
  );
}

function TopTable({
  title,
  rows,
}: {
  title: string;
  rows: Array<{ id: string; primary: string; secondary: string; requests: number; tokens: number; cost: number }>;
}) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
      <h3 className="mb-3 text-sm font-semibold text-gray-900 dark:text-white">{title}</h3>
      {rows.length === 0 ? (
        <p className="py-6 text-center text-sm text-gray-500 dark:text-gray-400">Нет данных</p>
      ) : (
        <ul className="divide-y divide-gray-100 dark:divide-gray-700">
          {rows.map((r, i) => (
            <li key={r.id} className="flex items-center gap-3 py-2">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-gray-100 text-xs font-medium text-gray-600 dark:bg-gray-700 dark:text-gray-300">
                {i + 1}
              </span>
              <div className="flex-1 min-w-0">
                <p className="truncate text-sm font-medium text-gray-900 dark:text-white">{r.primary}</p>
                <p className="truncate text-xs text-gray-500 dark:text-gray-400">{r.secondary}</p>
              </div>
              <div className="text-right shrink-0">
                <p className="text-sm tabular-nums font-medium text-gray-900 dark:text-white">
                  {formatCost(r.cost)}
                </p>
                <p className="text-xs tabular-nums text-gray-500 dark:text-gray-400">
                  {formatNumber(r.tokens)} ток · {formatNumber(r.requests)} запр.
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
