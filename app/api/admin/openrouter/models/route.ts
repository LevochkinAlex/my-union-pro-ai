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

function serializeModels(models: OpenRouterModelPayload[]): SerializedModel[] {
  return models.map((model) => ({
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
