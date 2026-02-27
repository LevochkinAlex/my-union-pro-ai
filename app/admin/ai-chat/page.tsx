"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import Button from "@/components/ui/button/Button";

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

type ApiProviderModel = string | {
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

export default function AdminAIChatPage() {
  const [activeTab, setActiveTab] = useState<"knowledge" | "bots" | "providers">("knowledge");
  const [knowledgeBases, setKnowledgeBases] = useState<KnowledgeBase[]>([]);
  const [bots, setBots] = useState<ChatBot[]>([]);
  const [providers, setProviders] = useState<ApiProvider[]>([]);
  const [loading, setLoading] = useState(true);
  const [providerMessage, setProviderMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
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
      const response = await fetch("/api/admin/openrouter/models", {
        method: "POST",
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || "Не удалось обновить модели");
      }
      const data = await response.json();
      setProviderMessage({ type: "success", text: `Модели OpenRouter обновлены (${data.count}).` });
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
      <div>
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
          Управление AI чатом
        </h1>
        <p className="mt-2 text-gray-600 dark:text-gray-400">
          Базы знаний, боты и API провайдеры
        </p>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200 dark:border-gray-700">
        <nav className="-mb-px flex space-x-8">
          <button
            onClick={() => setActiveTab("knowledge")}
            className={`whitespace-nowrap border-b-2 py-4 px-1 text-sm font-medium ${
              activeTab === "knowledge"
                ? "border-blue-500 text-blue-600 dark:text-blue-400"
                : "border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300"
            }`}
          >
            Базы знаний
          </button>
          <button
            onClick={() => setActiveTab("bots")}
            className={`whitespace-nowrap border-b-2 px-1 py-4 text-sm font-medium ${
              activeTab === "bots"
                ? "border-blue-500 text-blue-600 dark:text-blue-400"
                : "border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300"
            }`}
          >
            Боты
          </button>
          <button
            onClick={() => setActiveTab("providers")}
            className={`whitespace-nowrap border-b-2 px-1 py-4 text-sm font-medium ${
              activeTab === "providers"
                ? "border-blue-500 text-blue-600 dark:text-blue-400"
                : "border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300"
            }`}
          >
            API Провайдеры
          </button>
        </nav>
      </div>

      {/* Content */}
      {loading ? (
        <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-6 shadow-sm">
          <p className="text-gray-600 dark:text-gray-400">Загрузка...</p>
        </div>
      ) : activeTab === "knowledge" ? (
        <div>
          <div className="mb-4 flex justify-end">
            <Link href="/admin/ai-chat/knowledge-bases/new">
              <Button>Создать базу знаний</Button>
            </Link>
          </div>

          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {knowledgeBases.map((kb) => (
              <Link
                key={kb.id}
                href={`/admin/ai-chat/knowledge-bases/${kb.id}`}
                className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4 lg:p-6 shadow-sm transition-shadow hover:shadow-md"
              >
                <div className="mb-2 flex items-start justify-between">
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                    {kb.name}
                  </h3>
                  {kb.isActive ? (
                    <span className="rounded-full bg-green-100 px-2 py-1 text-xs font-semibold text-green-800 dark:bg-green-900 dark:text-green-200">
                      Активна
                    </span>
                  ) : (
                    <span className="rounded-full bg-gray-100 px-2 py-1 text-xs font-semibold text-gray-800 dark:bg-gray-700 dark:text-gray-200">
                      Неактивна
                    </span>
                  )}
                </div>
                {kb.description && (
                  <p className="mb-4 text-sm text-gray-600 dark:text-gray-400">
                    {kb.description}
                  </p>
                )}
                <div className="flex flex-col gap-2 text-sm text-gray-500 dark:text-gray-400">
                  <div className="flex flex-wrap gap-3">
                    <span className="font-medium text-gray-700 dark:text-gray-300">
                      Документы: {kb.stats.total}
                    </span>
                    <span className="text-xs text-blue-600 dark:text-blue-400">
                      В очереди: {kb.stats.queued}
                    </span>
                    <span className="text-xs text-yellow-600 dark:text-yellow-400">
                      Обработка: {kb.stats.processing}
                    </span>
                    <span className="text-xs text-green-600 dark:text-green-400">
                      Готово: {kb.stats.completed}
                    </span>
                    <span className="text-xs text-red-600 dark:text-red-400">
                      Ошибки: {kb.stats.failed}
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-3 text-xs">
                    <span>{kb._count.bots} ботов</span>
                    {kb._count.sources !== undefined && <span>{kb._count.sources} источников</span>}
                    {kb.stats.lastProcessedAt && (
                      <span>
                        Обновлено {new Date(kb.stats.lastProcessedAt).toLocaleString("ru-RU")}
                      </span>
                    )}
                  </div>
                </div>
              </Link>
            ))}
          </div>

          {knowledgeBases.length === 0 && (
            <div className="rounded-lg bg-white p-12 text-center shadow dark:bg-gray-800">
              <p className="text-gray-600 dark:text-gray-400">
                Базы знаний не созданы
              </p>
            </div>
          )}
        </div>
      ) : activeTab === "bots" ? (
        <div>
          <div className="mb-4 flex justify-end">
            <Link href="/admin/ai-chat/bots/new">
              <Button>Создать бота</Button>
            </Link>
          </div>

          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {bots.map((bot) => (
              <Link
                key={bot.id}
                href={`/admin/ai-chat/bots/${bot.id}`}
                className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4 lg:p-6 shadow-sm transition-shadow hover:shadow-md"
              >
                <div className="mb-2 flex items-start justify-between">
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                    {bot.name}
                  </h3>
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
                  <p className="mb-2 text-sm text-gray-600 dark:text-gray-400">
                    {bot.description}
                  </p>
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

          {bots.length === 0 && (
            <div className="rounded-lg bg-white p-12 text-center shadow dark:bg-gray-800">
              <p className="text-gray-600 dark:text-gray-400">Боты не созданы</p>
            </div>
          )}
        </div>
      ) : activeTab === "providers" ? (
        <div className="space-y-6">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="text-xl font-bold text-gray-900 dark:text-white">API провайдеры</h2>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Управляйте ключами, моделями и статусом подключений.
              </p>
            </div>
            <Button onClick={handleSyncProviders} disabled={syncingProviders}>
              {syncingProviders ? "Обновление..." : "Обновить модели OpenRouter"}
            </Button>
          </div>

          {providerMessage && (
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

          {loading ? (
            <div className="rounded-lg bg-white p-6 shadow dark:bg-gray-800">
              <p className="text-sm text-gray-600 dark:text-gray-400">Загрузка...</p>
            </div>
          ) : providers.length === 0 ? (
            <div className="rounded-lg bg-white p-12 text-center shadow dark:bg-gray-800">
              <p className="text-gray-600 dark:text-gray-400">
                Провайдеры не настроены. Используйте CLI или форму для создания.
              </p>
            </div>
          ) : (
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
                    <p className="mb-3 text-sm text-gray-600 dark:text-gray-400">
                      {provider.description}
                    </p>
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
                          const modelId = typeof model === 'string' ? model : model.id;
                          const modelName = typeof model === 'string' ? model : (model.name || model.id);
                          return (
                            <li key={`${provider.id}-${modelId}-${index}`} className="text-gray-600 dark:text-gray-300">
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
          )}
        </div>
      ) : null}
    </div>
  );
}

