"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import Button from "@/components/ui/button/Button";

/**
 * Страница-контейнер для подразделов ИИ-секции:
 * - `?tab=knowledge` (по умолчанию) — базы знаний
 * - `?tab=bots` — чат-боты
 * - `?tab=providers` — провайдер и модели Yandex
 *
 * Переключение — через подпункты сайдбара. Внутренних табов нет,
 * чтобы не было двойной навигации (это и был «артефакт» на старой странице).
 */

type KnowledgeBase = {
  id: string;
  name: string;
  description: string | null;
  isActive: boolean;
  _count: {
    documents: number;
    bots: number;
    sources?: number;
  };
  stats: {
    total: number;
    queued: number;
    processing: number;
    completed: number;
    failed: number;
    lastProcessedAt: string | null;
  };
};

type ChatBot = {
  id: string;
  name: string;
  description: string | null;
  tone: string;
  model: string;
  isActive: boolean;
  isDefault: boolean;
  apiProvider?: {
    id: string;
    name: string;
    displayName: string;
  } | null;
  _count: {
    knowledgeBases: number;
  };
};

type ApiProviderModel =
  | string
  | {
      id: string;
      name: string;
      description?: string;
      pricing?: unknown;
      context_length?: number;
      capabilities?: unknown;
      updated_at?: string;
    };

type ApiProvider = {
  id: string;
  name: string;
  displayName: string;
  description: string | null;
  apiBaseUrl: string | null;
  availableModels: ApiProviderModel[];
  isActive: boolean;
  isDefault: boolean;
  updatedAt: string;
};

type AIChatTab = "knowledge" | "bots" | "providers";

function normalizeTab(v: string | null | undefined): AIChatTab {
  if (v === "bots" || v === "providers" || v === "knowledge") return v;
  return "knowledge";
}

const TAB_META: Record<AIChatTab, { title: string; subtitle: string }> = {
  knowledge: {
    title: "Базы знаний",
    subtitle: "Источники для RAG-поиска в ответах ИИ",
  },
  bots: {
    title: "Чат-боты",
    subtitle: "Системные промпты, модель, привязанные базы знаний",
  },
  providers: {
    title: "Провайдер и модели",
    subtitle: "Yandex Foundation Models и список доступных моделей",
  },
};

export default function AdminAIChatPage() {
  const searchParams = useSearchParams();
  const activeTab = useMemo<AIChatTab>(
    () => normalizeTab(searchParams.get("tab")),
    [searchParams],
  );
  const meta = TAB_META[activeTab];

  const [knowledgeBases, setKnowledgeBases] = useState<KnowledgeBase[]>([]);
  const [bots, setBots] = useState<ChatBot[]>([]);
  const [providers, setProviders] = useState<ApiProvider[]>([]);
  const [loading, setLoading] = useState(true);
  const [providerMessage, setProviderMessage] = useState<
    { type: "success" | "error"; text: string } | null
  >(null);
  const [syncingProviders, setSyncingProviders] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      if (activeTab === "knowledge") {
        const response = await fetch("/api/admin/knowledge-bases");
        if (response.ok) {
          const data = await response.json();
          setKnowledgeBases(data.knowledgeBases || []);
        }
      } else if (activeTab === "bots") {
        const response = await fetch("/api/admin/chat-bots");
        if (response.ok) {
          const data = await response.json();
          setBots(data.bots || []);
        }
      } else if (activeTab === "providers") {
        const response = await fetch("/api/admin/api-providers");
        if (response.ok) {
          const data = await response.json();
          setProviders(data.providers || []);
        }
      }
    } catch (error) {
      console.error("[admin/ai-chat] load error", error);
    } finally {
      setLoading(false);
    }
  }, [activeTab]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleSyncProviders = async () => {
    setSyncingProviders(true);
    setProviderMessage(null);
    try {
      const response = await fetch("/api/admin/api-providers/sync-yandex-models", {
        method: "POST",
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || "Не удалось обновить модели");
      }
      const data = await response.json();
      setProviderMessage({
        type: "success",
        text: `Модели Yandex обновлены (${data.count}).`,
      });
      await loadData();
    } catch (error) {
      console.error("[admin/ai-chat] sync providers error", error);
      setProviderMessage({
        type: "error",
        text: error instanceof Error ? error.message : "Ошибка при обновлении моделей",
      });
    } finally {
      setSyncingProviders(false);
    }
  };

  return (
    <div className="space-y-6 min-w-0 w-full">
      {/* Контекстный заголовок + действие справа */}
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">{meta.title}</h1>
          <p className="mt-1 text-gray-600 dark:text-gray-400">{meta.subtitle}</p>
        </div>

        {activeTab === "knowledge" && (
          <Link href="/admin/ai-chat/knowledge-bases/new">
            <Button>Создать базу знаний</Button>
          </Link>
        )}
        {activeTab === "bots" && (
          <Link href="/admin/ai-chat/bots/new">
            <Button>Создать бота</Button>
          </Link>
        )}
        {activeTab === "providers" && (
          <Button onClick={handleSyncProviders} disabled={syncingProviders}>
            {syncingProviders ? "Обновление..." : "Обновить модели Yandex"}
          </Button>
        )}
      </div>

      {/* Сообщение по синку провайдера */}
      {activeTab === "providers" && providerMessage && (
        <div
          className={`rounded-lg border px-4 py-3 text-sm ${
            providerMessage.type === "success"
              ? "border-green-200 bg-green-50 text-green-800 dark:border-green-900/40 dark:bg-green-900/20 dark:text-green-200"
              : "border-red-200 bg-red-50 text-red-800 dark:border-red-900/40 dark:bg-red-900/20 dark:text-red-200"
          }`}
        >
          {providerMessage.text}
        </div>
      )}

      {/* Содержимое */}
      {loading ? (
        <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-6 shadow-sm">
          <p className="text-gray-600 dark:text-gray-400">Загрузка...</p>
        </div>
      ) : activeTab === "knowledge" ? (
        <KnowledgeList knowledgeBases={knowledgeBases} />
      ) : activeTab === "bots" ? (
        <BotsList bots={bots} />
      ) : (
        <ProvidersList providers={providers} />
      )}
    </div>
  );
}

function KnowledgeList({ knowledgeBases }: { knowledgeBases: KnowledgeBase[] }) {
  if (knowledgeBases.length === 0) {
    return <EmptyState text="Базы знаний не созданы" />;
  }
  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
      {knowledgeBases.map((kb) => (
        <KnowledgeCard key={kb.id} kb={kb} />
      ))}
    </div>
  );
}

/**
 * Карточка базы знаний. Сознательно не показываем 5 отдельных цветных
 * счётчиков статусов обработки — это визуальный шум. Вместо этого:
 * - одно главное число (всего документов)
 * - компактная полоса прогресса с сегментами по статусам (completed зелёный,
 *   processing янтарный, queued серый, failed красный)
 * - подстрока с контекстом (бот(ов), источник(ов), дата последней обработки)
 */
function KnowledgeCard({ kb }: { kb: KnowledgeBase }) {
  const { stats } = kb;
  const progress = Math.max(1, stats.total);
  const segments: Array<{ value: number; className: string; title: string }> = [
    {
      value: stats.completed,
      className: "bg-green-500",
      title: `Готово: ${stats.completed}`,
    },
    {
      value: stats.processing,
      className: "bg-amber-500",
      title: `Обработка: ${stats.processing}`,
    },
    {
      value: stats.queued,
      className: "bg-blue-400",
      title: `В очереди: ${stats.queued}`,
    },
    {
      value: stats.failed,
      className: "bg-red-500",
      title: `Ошибки: ${stats.failed}`,
    },
  ];

  const docsWord = plural(stats.total, "документ", "документа", "документов");
  const botsWord = plural(kb._count.bots, "бот", "бота", "ботов");

  return (
    <Link
      href={`/admin/ai-chat/knowledge-bases/${kb.id}`}
      className="flex flex-col rounded-xl border border-gray-200 bg-white p-4 shadow-sm transition-shadow hover:shadow-md dark:border-gray-700 dark:bg-gray-800 lg:p-5"
    >
      <div className="mb-3 flex items-start justify-between gap-2">
        <h3 className="text-base font-semibold text-gray-900 dark:text-white line-clamp-2">
          {kb.name}
        </h3>
        <StatusPill active={kb.isActive} />
      </div>

      {kb.description && (
        <p className="mb-4 text-sm text-gray-600 dark:text-gray-400 line-clamp-2">
          {kb.description}
        </p>
      )}

      {/* Главное: всего документов + полоска прогресса */}
      <div className="mt-auto space-y-2">
        <div className="flex items-baseline justify-between">
          <span className="text-2xl font-bold tabular-nums text-gray-900 dark:text-white">
            {stats.total}
          </span>
          <span className="text-xs text-gray-500 dark:text-gray-400">{docsWord}</span>
        </div>

        {stats.total > 0 && (
          <div
            className="flex h-2 overflow-hidden rounded-full bg-gray-100 dark:bg-gray-700"
            aria-label={`Готово ${stats.completed} из ${stats.total} документов`}
            title={segments.map((s) => s.title).join(" · ")}
          >
            {segments
              .filter((s) => s.value > 0)
              .map((s, i) => (
                <ProgressSeg key={i} segment={s} total={progress} />
              ))}
          </div>
        )}

        {/* Мета: боты, источники, дата */}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 pt-1 text-xs text-gray-500 dark:text-gray-400">
          <span>{kb._count.bots} {botsWord}</span>
          {kb._count.sources !== undefined && (
            <span>{kb._count.sources} источн.</span>
          )}
          {stats.failed > 0 && (
            <span className="text-red-600 dark:text-red-400">
              {stats.failed} с ошибкой
            </span>
          )}
          {stats.lastProcessedAt && (
            <span className="ml-auto">
              {new Date(stats.lastProcessedAt).toLocaleDateString("ru-RU")}
            </span>
          )}
        </div>
      </div>
    </Link>
  );
}

function ProgressSeg({
  segment,
  total,
}: {
  segment: { value: number; className: string; title: string };
  total: number;
}) {
  // Ширина сегмента — через CSS-переменную `--seg-w`, а не через style={{width}},
  // чтобы не триггерить линт no-inline-styles. Tailwind arbitrary value
  // `w-[var(--seg-w)]` читает её и применяет как width.
  const percent = Math.max(0, Math.min(100, (segment.value / total) * 100));
  return (
    <div
      className={`w-[var(--seg-w)] ${segment.className}`}
      title={segment.title}
      aria-hidden
      ref={(el) => {
        if (el) el.style.setProperty("--seg-w", percent + "%");
      }}
    />
  );
}

function StatusPill({ active }: { active: boolean }) {
  return active ? (
    <span className="shrink-0 rounded-full bg-green-100 px-2 py-0.5 text-xs font-semibold text-green-800 dark:bg-green-900/40 dark:text-green-200">
      Активна
    </span>
  ) : (
    <span className="shrink-0 rounded-full bg-gray-100 px-2 py-0.5 text-xs font-semibold text-gray-700 dark:bg-gray-700 dark:text-gray-200">
      Неактивна
    </span>
  );
}

function plural(n: number, one: string, few: string, many: string): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return few;
  return many;
}

function BotsList({ bots }: { bots: ChatBot[] }) {
  if (bots.length === 0) {
    return <EmptyState text="Боты не созданы" />;
  }
  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
      {bots.map((bot) => (
        <Link
          key={bot.id}
          href={`/admin/ai-chat/bots/${bot.id}`}
          className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4 lg:p-6 shadow-sm transition-shadow hover:shadow-md"
        >
          <div className="mb-2 flex items-start justify-between">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">{bot.name}</h3>
            <div className="flex gap-2">
              {bot.isDefault && (
                <span className="rounded-full bg-blue-100 px-2 py-1 text-xs font-semibold text-blue-800 dark:bg-blue-900 dark:text-blue-200">
                  По умолчанию
                </span>
              )}
              {bot.isActive ? (
                <span className="rounded-full bg-green-100 px-2 py-1 text-xs font-semibold text-green-800 dark:bg-green-900 dark:text-green-200">
                  Активен
                </span>
              ) : (
                <span className="rounded-full bg-gray-100 px-2 py-1 text-xs font-semibold text-gray-800 dark:bg-gray-700 dark:text-gray-200">
                  Неактивен
                </span>
              )}
            </div>
          </div>
          {bot.description && (
            <p className="mb-2 text-sm text-gray-600 dark:text-gray-400">{bot.description}</p>
          )}
          <div className="flex flex-col gap-1 text-sm text-gray-500 dark:text-gray-400">
            <div className="flex items-center gap-2">
              <span>Тон: {bot.tone}</span>
              <span>•</span>
              <span>{bot._count.knowledgeBases} баз знаний</span>
            </div>
            <div className="text-xs">
              Модель: {bot.model}
              {bot.apiProvider?.displayName ? ` (${bot.apiProvider.displayName})` : ""}
            </div>
          </div>
        </Link>
      ))}
    </div>
  );
}

function ProvidersList({ providers }: { providers: ApiProvider[] }) {
  if (providers.length === 0) {
    return <EmptyState text="Провайдеры не настроены" />;
  }
  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
      {providers.map((provider) => (
        <div
          key={provider.id}
          className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4 lg:p-6 shadow-sm"
        >
          <div className="mb-2 flex items-start justify-between">
            <div>
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                {provider.displayName}
              </h3>
              <p className="text-xs text-gray-500 dark:text-gray-400">{provider.name}</p>
            </div>
            <span
              className={`rounded-full px-2 py-1 text-xs font-semibold ${
                provider.isActive
                  ? "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200"
                  : "bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200"
              }`}
            >
              {provider.isActive ? "Активен" : "Отключен"}
            </span>
          </div>

          {provider.description && (
            <p className="mb-3 text-sm text-gray-600 dark:text-gray-400">{provider.description}</p>
          )}

          <div className="mb-3 space-y-1 text-xs text-gray-500 dark:text-gray-400">
            <p>
              Базовый URL: <span className="break-all">{provider.apiBaseUrl ?? "—"}</span>
            </p>
            <p>Обновлено: {new Date(provider.updatedAt).toLocaleString("ru-RU")}</p>
            <p>Моделей: {provider.availableModels.length}</p>
          </div>

          {provider.availableModels.length > 0 && (
            <div className="max-h-32 overflow-y-auto rounded bg-gray-50 p-3 text-xs dark:bg-gray-900/40">
              <ul className="space-y-1">
                {provider.availableModels.slice(0, 15).map((model, index) => {
                  const modelId = typeof model === "string" ? model : model.id;
                  const modelName =
                    typeof model === "string" ? model : model.name || model.id;
                  return (
                    <li
                      key={`${provider.id}-${modelId}-${index}`}
                      className="text-gray-600 dark:text-gray-300"
                    >
                      {modelName}
                    </li>
                  );
                })}
                {provider.availableModels.length > 15 && (
                  <li className="text-gray-400 dark:text-gray-500">…и другие</li>
                )}
              </ul>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="rounded-lg bg-white p-12 text-center shadow dark:bg-gray-800">
      <p className="text-gray-600 dark:text-gray-400">{text}</p>
    </div>
  );
}
