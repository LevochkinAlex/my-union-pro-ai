"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";
import Button from "@/components/ui/button/Button";
import InputField from "@/components/ui/InputField";
import Select from "@/components/ui/Select";
import TextArea from "@/components/ui/TextArea";
import Label from "@/components/form/Label";

// ИСПРАВЛЕНО: Убраны импорты типов из @prisma/client, чтобы избежать попадания Prisma Client в клиентский бандл
// Используем локальные типы вместо Prisma типов
type KnowledgeBase = {
  id: string;
  name: string;
};

type ApiProvider = {
  id: string;
  name: string;
  displayName?: string;
  type: string;
  isDefault?: boolean;
  apiKey?: string | null;
  apiBaseUrl?: string | null;
  availableModels: string[]; // Ensure this is always an array
  updatedAt: string;
};

type ChatBot = {
  id: string;
  name: string;
  description?: string | null;
  systemPrompt: string;
  tone: string;
  context?: string | null;
  model: string;
  temperature: number;
  maxTokens: number;
  isActive?: boolean;
  isDefault?: boolean;
  apiProviderId?: string | null;
  apiProvider?: ApiProvider | null;
  providerOverride?: {
    apiKey?: string;
    apiBaseUrl?: string;
  } | null;
  knowledgeBases: Array<{
    knowledgeBase: {
      id: string;
      name: string;
    };
  }>;
};


export default function BotDetailsPage() {
  const router = useRouter();
  const params = useParams();
  const id = params.id as string;

  const [bot, setBot] = useState<ChatBot | null>(null);
  const [knowledgeBases, setKnowledgeBases] = useState<KnowledgeBase[]>([]);
  const [apiProviders, setApiProviders] = useState<ApiProvider[]>([]);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [systemPrompt, setSystemPrompt] = useState("");
  const [tone, setTone] = useState("professional");
  const [context, setContext] = useState("");
  const [selectedProviderId, setSelectedProviderId] = useState<string>("");
  const [model, setModel] = useState("");
  const [overrideApiKey, setOverrideApiKey] = useState("");
  const [overrideApiBaseUrl, setOverrideApiBaseUrl] = useState("");
  const [temperature, setTemperature] = useState("0.7");
  const [maxTokens, setMaxTokens] = useState("1000");
  const [selectedKBs, setSelectedKBs] = useState<string[]>([]);
  const [isActive, setIsActive] = useState(true);
  const [isDefault, setIsDefault] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const loadKnowledgeBases = useCallback(async () => {
    try {
      const response = await fetch("/api/admin/knowledge-bases");
      if (response.ok) {
        const data = await response.json();
        setKnowledgeBases(data.knowledgeBases || []);
      }
    } catch (err) {
      console.error("Ошибка загрузки баз знаний:", err);
    }
  }, []);

  const loadApiProviders = useCallback(async () => {
    try {
      const response = await fetch("/api/admin/api-providers");
      if (response.ok) {
        const data = await response.json();
        // Ensure availableModels is always an array
        const providers = data.providers.map((p: any) => ({
            ...p,
            availableModels: Array.isArray(p.availableModels) ? p.availableModels : [],
        }));
        setApiProviders(providers || []);
      }
    } catch (err) {
      console.error("Ошибка загрузки API провайдеров:", err);
    }
  }, []);

  const loadBot = useCallback(async () => {
    if (!id || id === 'undefined') {
        setError("Неверный ID бота.");
        setLoading(false);
        return
    };
    try {
      setLoading(true);
      const response = await fetch(`/api/admin/chat-bots/${id}`);
      if (!response.ok) {
        if(response.status === 404) {
          throw new Error("Бот не найден");
        }
        throw new Error("Не удалось загрузить бота");
      }
      const data = await response.json();
      setBot(data.bot);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Произошла ошибка");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    loadKnowledgeBases();
    loadApiProviders();
    loadBot();
  }, [loadKnowledgeBases, loadApiProviders, loadBot]);

  useEffect(() => {
    if (apiProviders.length > 0 && bot) {
      const providerId = bot.apiProviderId || bot.apiProvider?.id || "";
      setSelectedProviderId(providerId);
       const provider = apiProviders.find(p => p.id === providerId);
       const models = provider?.availableModels || [];

      if (models.length > 0) {
        setModel(bot.model || models[0]);
      } else {
        setModel(bot.model);
      }
    }
  }, [apiProviders, bot]);

  useEffect(() => {
    if (bot) {
      setName(bot.name);
      setDescription(bot.description || "");
      setSystemPrompt(bot.systemPrompt);
      setTone(bot.tone);
      setContext(bot.context || "");
      setModel(bot.model);
      setTemperature(bot.temperature.toString());
      setMaxTokens(bot.maxTokens.toString());
      setIsActive(bot.isActive);
      setIsDefault(bot.isDefault);
      setSelectedKBs(bot.knowledgeBases.map((kb) => kb.knowledgeBase.id));
      if (bot.providerOverride) {
        setOverrideApiKey(bot.providerOverride.apiKey || "");
        setOverrideApiBaseUrl(bot.providerOverride.apiBaseUrl || "");
      }
    }
  }, [bot]);

  useEffect(() => {
    if (!selectedProviderId || apiProviders.length === 0) return;

    const provider = apiProviders.find((p) => p.id === selectedProviderId);
    if (!provider) return;

    const models = provider.availableModels;
    if (models.length > 0 && !models.includes(model)) {
      setModel(models[0]);
    }
  }, [selectedProviderId, apiProviders, model]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError("");

    if (!selectedProviderId) {
      setError("Выберите провайдера");
      setSaving(false);
      return;
    }

    if (!model) {
      setError("Выберите модель");
      setSaving(false);
      return;
    }

    const selectedProvider = apiProviders.find((p) => p.id === selectedProviderId);
    if (!selectedProvider && selectedProviderId) {
      setError("Провайдер не найден");
      setSaving(false);
      return;
    }

    const overridePayload: Record<string, string> = {};
    if (overrideApiKey.trim()) {
      overridePayload.apiKey = overrideApiKey.trim();
    }
    if (overrideApiBaseUrl.trim()) {
      overridePayload.apiBaseUrl = overrideApiBaseUrl.trim();
    }
    const providerOverride = Object.keys(overridePayload).length > 0 ? overridePayload : null;

    try {
      const response = await fetch(`/api/admin/chat-bots/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          description,
          systemPrompt,
          tone,
          context,
          model,
          apiProviderId: selectedProviderId || null,
          providerOverride,
          temperature: parseFloat(temperature),
          maxTokens: parseInt(maxTokens, 10),
          knowledgeBaseIds: selectedKBs,
          isActive,
          isDefault,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Не удалось сохранить");
      }

      await loadBot();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Произошла ошибка");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm("Вы уверены, что хотите удалить этого бота?")) return;

    try {
      const response = await fetch(`/api/admin/chat-bots/${id}`, {
        method: "DELETE",
      });

      if (!response.ok) throw new Error("Не удалось удалить");

      router.push("/admin/ai-chat");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Произошла ошибка");
    }
  };

  if (loading) {
    return (
      <div className="p-8">
        <p className="text-gray-600 dark:text-gray-400">Загрузка...</p>
      </div>
    );
  }

  if (error || !bot) { // combined error and not found state
    return (
      <div className="p-8">
        <p className="text-red-600 dark:text-red-400">{error || "Бот не найден"}</p>
         <div className="mt-6">
             <Link
              href="/admin/ai-chat"
              className="text-sm text-blue-600 hover:text-blue-700 dark:text-blue-400"
            >
              ← Назад к ботам
            </Link>
        </div>
      </div>
    );
  }

  const providerModels = apiProviders.find((p) => p.id === selectedProviderId)?.availableModels || [];
  const hasModelOptions = providerModels.length > 0;

  return (
    <div className="p-8">
      <div className="mb-6 flex items-center gap-4">
        <Link
          href="/admin/ai-chat"
          className="text-sm text-blue-600 hover:text-blue-700 dark:text-blue-400"
        >
          ← Назад к ботам
        </Link>
      </div>

      <h1 className="mb-6 text-3xl font-bold text-gray-900 dark:text-white">
        {bot.name}
      </h1>

      {error && (
        <div className="mb-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900/40 dark:bg-red-900/20 dark:text-red-200">
          {error}
        </div>
      )}

      <form onSubmit={handleSave} className="max-w-4xl space-y-6">
        <div className="grid gap-6 md:grid-cols-2">
          <div>
            <Label htmlFor="name">Название</Label>
            <InputField
              id="name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>

          <div>
            <Label htmlFor="tone">Тон общения</Label>
            <Select
              id="tone"
              value={tone}
              onChange={(e) => setTone(e.target.value)}
            >
              <option value="professional">Профессиональный</option>
              <option value="friendly">Дружелюбный</option>
              <option value="formal">Формальный</option>
              <option value="casual">Неформальный</option>
            </Select>
          </div>
        </div>

        <div>
          <Label htmlFor="description">Описание</Label>
          <TextArea
            id="description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={2}
          />
        </div>

        <div>
          <Label htmlFor="systemPrompt">Системный промпт</Label>
          <TextArea
            id="systemPrompt"
            value={systemPrompt}
            onChange={(e) => setSystemPrompt(e.target.value)}
            required
            rows={10}
            className="font-mono text-sm"
          />
        </div>

        <div>
          <Label htmlFor="context">Контекст</Label>
          <TextArea
            id="context"
            value={context}
            onChange={(e) => setContext(e.target.value)}
            rows={4}
          />
        </div>

        {/* API Provider и Model */}
        <div className="grid gap-6 md:grid-cols-2">
          <div>
            <Label htmlFor="apiProvider">API Провайдер</Label>
            <Select
              id="apiProvider"
              value={selectedProviderId}
              onChange={(e) => {
                setSelectedProviderId(e.target.value);
                setOverrideApiKey("");
                setOverrideApiBaseUrl("");
              }}
            >
              <option value="">Без провайдера</option>
              {apiProviders.map((provider) => (
                <option key={provider.id} value={provider.id}>
                  {provider.displayName || provider.name}
                </option>
              ))}
            </Select>
            {selectedProviderId && (
              <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                По умолчанию: {apiProviders.find((p) => p.id === selectedProviderId)?.apiBaseUrl ?? "—"}
              </p>
            )}
          </div>

          <div>
            <Label htmlFor="model">
              Модель <span className="text-red-500">*</span>
            </Label>
            {hasModelOptions ? (
              <Select
                id="model"
                value={model}
                onChange={(e) => setModel(e.target.value)}
                required
                disabled={!selectedProviderId}
              >
                {!selectedProviderId ? (
                  <option>Сначала выберите провайдера</option>
                ) : (
                  providerModels.map((m: any, index: number) => {
                    // Если модель - это объект с id, используем только id
                    const modelId = typeof m === 'object' && m !== null && 'id' in m ? m.id : m;
                    const modelName = typeof m === 'object' && m !== null && 'name' in m ? m.name : modelId;
                    return (
                      <option key={`${modelId}-${index}`} value={modelId}>
                        {modelName}
                      </option>
                    );
                  })
                )}
              </Select>
            ) : (
              <InputField
                id="model"
                type="text"
                value={model}
                onChange={(e) => setModel(e.target.value)}
                required
                disabled={!selectedProviderId}
                placeholder="Введите идентификатор модели"
              />
            )}
          </div>
        </div>

        <div className="grid gap-6 md:grid-cols-2">
          <div>
            <Label htmlFor="overrideApiKey">Переопределить API ключ</Label>
            <InputField
              id="overrideApiKey"
              type="password"
              value={overrideApiKey}
              onChange={(e) => setOverrideApiKey(e.target.value)}
              placeholder="Если пусто, используется ключ провайдера"
            />
          </div>

          <div>
            <Label htmlFor="overrideApiBaseUrl">Переопределить API Base URL</Label>
            <InputField
              id="overrideApiBaseUrl"
              type="text"
              value={overrideApiBaseUrl}
              onChange={(e) => setOverrideApiBaseUrl(e.target.value)}
              placeholder={apiProviders.find((p) => p.id === selectedProviderId)?.apiBaseUrl || "https://"}
            />
          </div>
        </div>

        <div className="grid gap-6 md:grid-cols-2">
          <div>
            <Label htmlFor="temperature">Температура (0-2)</Label>
            <InputField
              id="temperature"
              type="number"
              min="0"
              max="2"
              step="0.1"
              value={temperature}
              onChange={(e) => setTemperature(e.target.value)}
            />
          </div>

          <div>
            <Label htmlFor="maxTokens">Максимум токенов</Label>
            <InputField
              id="maxTokens"
              type="number"
              min="100"
              max="4000"
              value={maxTokens}
              onChange={(e) => setMaxTokens(e.target.value)}
            />
          </div>
        </div>

        {knowledgeBases.length > 0 && (
          <div>
            <Label>Базы знаний</Label>
            <div className="mt-2 space-y-2">
              {knowledgeBases.map((kb) => (
                <label
                  key={kb.id}
                  className="flex items-center gap-2 rounded-lg border border-gray-200 p-3 dark:border-gray-700"
                >
                  <input
                    type="checkbox"
                    checked={selectedKBs.includes(kb.id)}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setSelectedKBs([...selectedKBs, kb.id]);
                      } else {
                        setSelectedKBs(selectedKBs.filter((id) => id !== kb.id));
                      }
                    }}
                    className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  />
                  <span className="text-sm text-gray-900 dark:text-white">{kb.name}</span>
                </label>
              ))}
            </div>
          </div>
        )}

        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="isActive"
              checked={isActive}
              onChange={(e) => setIsActive(e.target.checked)}
              className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            />
            <Label htmlFor="isActive" className="mb-0">
              Активен
            </Label>
          </div>

          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="isDefault"
              checked={isDefault}
              onChange={(e) => setIsDefault(e.target.checked)}
              className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            />
            <Label htmlFor="isDefault" className="mb-0">
              Бот по умолчанию
            </Label>
          </div>
        </div>

        <div className="flex gap-4">
          <Button type="submit" disabled={saving}>
            {saving ? "Сохранение..." : "Сохранить"}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={handleDelete}
            disabled={bot.isDefault}
            className="bg-red-500 text-white hover:bg-red-600 dark:bg-red-600 dark:hover:bg-red-700"
          >
            Удалить
          </Button>
        </div>
      </form>
    </div>
  );
}

