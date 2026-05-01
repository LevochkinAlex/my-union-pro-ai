"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { backNavLinkButtonClass } from "@/lib/back-nav-link-button";
import InputField from "@/components/ui/InputField";
import Button from "@/components/ui/button/Button";
import Select from "@/components/ui/Select";
import TextArea from "@/components/ui/TextArea";
import Label from "@/components/form/Label";

// ИСПРАВЛЕНО: Убраны импорты типов из @prisma/client, чтобы избежать попадания Prisma Client в клиентский бандл
type KnowledgeBase = {
  id: string;
  name: string;
};

type ApiProvider = {
  id: string;
  name: string;
  displayName?: string;
  type: string;
  isActive?: boolean;
  isDefault?: boolean;
  apiKey?: string | null;
  apiBaseUrl?: string | null;
};

type ApiProviderWithModels = ApiProvider & {
  availableModels: string[];
};

export default function NewBotPage() {
  const router = useRouter();
  const [knowledgeBases, setKnowledgeBases] = useState<KnowledgeBase[]>([]);
  const [apiProviders, setApiProviders] = useState<ApiProviderWithModels[]>([]);
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
        const providers = (data.providers || []).filter((p: ApiProviderWithModels) => p.isActive);
        setApiProviders(providers);
        const defaultProvider = providers.find((p) => p.isDefault) || providers[0];
        if (defaultProvider) {
          setSelectedProviderId(defaultProvider.id);
          const models = Array.isArray(defaultProvider.availableModels)
            ? defaultProvider.availableModels
            : [];
          if (models.length > 0) {
            setModel(models[0]);
          }
        }
      }
    } catch (err) {
      console.error("Ошибка загрузки провайдеров:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadKnowledgeBases();
    loadApiProviders();
  }, [loadKnowledgeBases, loadApiProviders]);

  useEffect(() => {
    if (!selectedProviderId || apiProviders.length === 0) return;

    const provider = apiProviders.find((p) => p.id === selectedProviderId);
    if (!provider) return;

    const models = Array.isArray(provider.availableModels) ? provider.availableModels : [];
    if (models.length > 0) {
      if (!model || !models.includes(model)) {
        setModel(models[0]);
      }
    }
  }, [selectedProviderId, apiProviders, model]);

  const handleSubmit = async (e: React.FormEvent) => {
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
    if (!selectedProvider) {
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
      const response = await fetch("/api/admin/chat-bots", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          description,
          systemPrompt,
          tone,
          context,
          model,
          apiProviderId: selectedProvider.id,
          providerOverride,
          temperature: parseFloat(temperature),
          maxTokens: parseInt(maxTokens, 10),
          knowledgeBaseIds: selectedKBs,
          isDefault,
        }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || "Не удалось создать бота");
      }

      const data = await response.json();
      router.push(`/admin/ai-chat/bots/${data.bot.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Произошла ошибка");
    } finally {
      setSaving(false);
    }
  };

  const selectedProvider = apiProviders.find((p) => p.id === selectedProviderId);
  const providerModels = selectedProvider?.availableModels || [];
  const hasModelOptions = providerModels.length > 0;

  return (
    <div className="space-y-6 min-w-0 w-full">
      <div className="mb-6 flex items-center gap-4">
        <Link
          href="/admin/ai-chat"
          className={backNavLinkButtonClass}
        >
          ← Назад к ботам
        </Link>
      </div>

      <h1 className="mb-6 text-3xl font-bold text-gray-900 dark:text-white">
        Создать бота
      </h1>

      <form onSubmit={handleSubmit} className="max-w-4xl space-y-6">
        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900/40 dark:bg-red-900/20 dark:text-red-200">
            {error}
          </div>
        )}

        <div className="grid gap-6 md:grid-cols-2">
          <div>
            <Label htmlFor="name">
              Название <span className="text-red-500">*</span>
            </Label>
            <InputField
              id="name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              placeholder="Например: Помощник профсоюза"
            />
          </div>

          <div>
            <Label htmlFor="tone">Тон общения</Label>
            <select
              id="tone"
              value={tone}
              onChange={(e) => setTone(e.target.value)}
              className="mt-2 w-full rounded-lg border border-gray-300 px-4 py-2 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
              aria-label="Тон общения"
            >
              <option value="professional">Профессиональный</option>
              <option value="friendly">Дружелюбный</option>
              <option value="formal">Формальный</option>
              <option value="casual">Неформальный</option>
            </select>
          </div>
        </div>

        <div>
          <Label htmlFor="description">Описание</Label>
          <TextArea
            id="description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={2}
            className="mt-2 w-full rounded-lg border border-gray-300 px-4 py-2 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
            placeholder="Краткое описание бота..."
          />
        </div>

        <div>
          <Label htmlFor="systemPrompt">
            Системный промпт <span className="text-red-500">*</span>
          </Label>
          <TextArea
            id="systemPrompt"
            value={systemPrompt}
            onChange={(e) => setSystemPrompt(e.target.value)}
            required
            rows={10}
            className="mt-2 w-full rounded-lg border border-gray-300 px-4 py-2 font-mono text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-white"
            placeholder="Опишите роль и поведение бота..."
          />
        </div>

        <div>
          <Label htmlFor="context">Контекст (дополнительная информация)</Label>
          <TextArea
            id="context"
            value={context}
            onChange={(e) => setContext(e.target.value)}
            rows={4}
            className="mt-2 w-full rounded-lg border border-gray-300 px-4 py-2 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
            placeholder="Дополнительный контекст для бота..."
          />
        </div>

        {/* API Provider и Model */}
        <div className="grid grid-cols-1 items-end gap-6 md:grid-cols-2">
          <div>
            <Label htmlFor="apiProvider">
              API Провайдер <span className="text-red-500">*</span>
            </Label>
            <Select
              id="apiProvider"
              value={selectedProviderId}
              onChange={(e) => setSelectedProviderId(e.target.value)}
              required
            >
              <option value="" disabled>
                Выберите провайдера
              </option>
              {apiProviders.map((provider) => (
                <option key={provider.id} value={provider.id}>
                  {provider.displayName || provider.name}
                </option>
              ))}
            </Select>
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
              >
                <option value="" disabled>
                  Выберите модель
                </option>
                {(
                  apiProviders.find((p) => p.id === selectedProviderId)
                    ?.availableModels || []
                ).map((modelId: any) => (
                  <option key={modelId.id || modelId} value={modelId.id || modelId}>
                    {modelId.name || modelId}
                  </option>
                ))}
              </Select>
            ) : (
              <InputField
                id="model"
                type="text"
                value={model}
                disabled
                placeholder="Нет доступных моделей"
              />
            )}
          </div>
        </div>

        {/* API Key и Base URL (опционально) */}
        <div className="grid gap-6 md:grid-cols-2">
          <div>
            <Label htmlFor="overrideApiKey">Переопределить API ключ (опционально)</Label>
            <InputField
              id="overrideApiKey"
              type="password"
              value={overrideApiKey}
              onChange={(e) => setOverrideApiKey(e.target.value)}
              placeholder="Если оставить пустым, будет использован ключ провайдера"
            />
          </div>

          <div>
            <Label htmlFor="overrideApiBaseUrl">Переопределить API Base URL (опционально)</Label>
            <InputField
              id="overrideApiBaseUrl"
              type="text"
              value={overrideApiBaseUrl}
              onChange={(e) => setOverrideApiBaseUrl(e.target.value)}
              placeholder={selectedProvider?.apiBaseUrl || "https://"}
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

        {!loading && knowledgeBases.length > 0 && (
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

        <div className="flex items-center gap-2">
          <input
            type="checkbox"
            id="isDefault"
            checked={isDefault}
            onChange={(e) => setIsDefault(e.target.checked)}
            className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            aria-label="Бот по умолчанию"
          />
          <Label htmlFor="isDefault" className="mb-0">
            Бот по умолчанию
          </Label>
        </div>

        <div className="flex gap-4">
          <Button type="submit" disabled={saving || !name.trim() || !systemPrompt.trim()}>
            {saving ? "Создание..." : "Создать"}
          </Button>
          <Link href="/admin/ai-chat">
            <Button type="button" variant="outline">
              Отмена
            </Button>
          </Link>
        </div>
      </form>
    </div>
  );
}

