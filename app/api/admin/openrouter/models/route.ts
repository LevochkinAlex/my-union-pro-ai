import type { ApiProvider } from "@prisma/client";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getOpenRouterConfig } from "@/lib/settings";
import { ensureSuperAdmin } from "@/lib/admin-auth";

type SerializedModel = {
  id: string;
  name: string;
  description: string | null;
  pricing: unknown;
  context_length: number | null;
  capabilities: Record<string, unknown> | null;
  updated_at: string | null;
};

type OpenRouterModelPayload = {
  id: string;
  name?: string;
  description?: string | null;
  pricing?: unknown;
  context_length?: number | null;
  context?: number | null;
  capabilities?: Record<string, unknown> | null;
  permissions?: Record<string, unknown> | null;
  updated_at?: string | null;
};

// Белый список РЕАЛЬНЫХ провайдеров моделей (блокируем фейки)
const ALLOWED_MODEL_PREFIXES = [
  "openai/",
  "anthropic/",
  "google/",
  "meta-llama/",
  "mistralai/",
  "cohere/",
  "perplexity/",
  "nvidia/",
  "deepseek/",
  "qwen/",
];

// Черный список фейковых моделей и паттернов
const BLOCKED_MODEL_PATTERNS = [
  /gpt-5/i,              // GPT-5 не существует
  /gpt-6/i,              // GPT-6 не существует  
  /gpt-7/i,              // GPT-7 не существует
  /sherlock/i,           // Фейковые Sherlock модели
  /dash.*alpha/i,        // Dash Alpha - фейк
  /think.*alpha/i,       // Think Alpha - фейк
  /^openai:.*gpt-5/i,    // Любые GPT-5 с OpenAI:
  /kwaipilot/i,          // KwaiPilot - сомнительная модель
  /^moonshot/i,          // MoonshotAI - часто фейки
];

function isValidModel(modelId: string): boolean {
  // Проверка на черный список паттернов
  if (BLOCKED_MODEL_PATTERNS.some(pattern => pattern.test(modelId))) {
    console.log(`[openrouter/models] Blocked fake model: ${modelId}`);
    return false;
  }
  
  // Проверка на белый список префиксов
  const isAllowed = ALLOWED_MODEL_PREFIXES.some(prefix => modelId.startsWith(prefix));
  if (!isAllowed) {
    console.log(`[openrouter/models] Blocked unknown provider: ${modelId}`);
  }
  return isAllowed;
}

function serializeModels(models: OpenRouterModelPayload[]): SerializedModel[] {
  const validModels = models.filter(model => isValidModel(model.id));
  
  console.log(`[openrouter/models] Filtered ${models.length - validModels.length} fake models, ${validModels.length} valid remaining`);
  
  return validModels.map((model) => ({
    id: model.id,
    name: model.name ?? model.id,
    description: model.description ?? null,
    pricing: model.pricing ?? null,
    context_length: model.context_length ?? model.context ?? null,
    capabilities: model.capabilities ?? model.permissions ?? null,
    updated_at: model.updated_at ?? null,
  }));
}

function parseAvailableModels(provider: ApiProvider): unknown {
  if (!provider.availableModels) {
    return [];
  }
  try {
    return JSON.parse(provider.availableModels);
  } catch (error) {
    console.warn("[openrouter/models] Не удалось распарсить сохраненные модели", error);
    return [];
  }
}

export async function GET() {
  try {
    const { error } = await ensureSuperAdmin();
    if (error) {
      return error;
    }

    const provider = await prisma.apiProvider.findUnique({
      where: { name: "openrouter" },
    });

    if (!provider) {
      return NextResponse.json({ error: "Провайдер OpenRouter не найден" }, { status: 404 });
    }

    const models = parseAvailableModels(provider);

    return NextResponse.json({
      provider: {
        id: provider.id,
        name: provider.name,
        updatedAt: provider.updatedAt,
      },
      models,
    });
  } catch (error) {
    console.error("[openrouter/models] GET error:", error);
    return NextResponse.json({ error: "Не удалось получить список моделей" }, { status: 500 });
  }
}

export async function POST() {
  try {
    const { error } = await ensureSuperAdmin();
    if (error) {
      return error;
    }

    const openRouterConfig = await getOpenRouterConfig();
    if (!openRouterConfig.apiKey) {
      return NextResponse.json(
        { error: "API ключ OpenRouter не настроен" },
        { status: 400 }
      );
    }

    const response = await fetch("https://openrouter.ai/api/v1/models", {
      method: "GET",
      headers: {
        Authorization: `Bearer ${openRouterConfig.apiKey}`,
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("[openrouter/models] Sync error:", errorText);
      return NextResponse.json(
        { error: "Не удалось получить список моделей OpenRouter" },
        { status: 500 }
      );
    }

    const payload = (await response.json()) as { data?: unknown; models?: unknown };
    const rawModels = Array.isArray(payload.data)
      ? (payload.data as OpenRouterModelPayload[])
      : Array.isArray(payload.models)
        ? (payload.models as OpenRouterModelPayload[])
        : [];
    const normalizedModels = serializeModels(rawModels);

    await prisma.apiProvider.update({
      where: { name: "openrouter" },
      data: {
        availableModels: JSON.stringify(normalizedModels),
        capabilities: JSON.stringify({
          vision: normalizedModels.some((model) => model.capabilities?.vision === true),
          audio: normalizedModels.some((model) => model.capabilities?.audio === true),
          tool: normalizedModels.some((model) => model.capabilities?.tool === true || model.capabilities?.tools === true),
        }),
      },
    });

    return NextResponse.json({
      success: true,
      count: normalizedModels.length,
      models: normalizedModels,
    });
  } catch (error) {
    console.error("[openrouter/models] POST error:", error);
    return NextResponse.json(
      { error: "Не удалось обновить список моделей" },
      { status: 500 }
    );
  }
}
