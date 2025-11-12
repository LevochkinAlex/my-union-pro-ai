import type { ApiProvider } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { ensureSuperAdmin } from "@/lib/admin-auth";

function serializeProvider(provider: ApiProvider) {
  const { availableModels, capabilities, ...rest } = provider;
  let parsedModels: unknown = [];
  if (availableModels) {
    try {
      parsedModels = JSON.parse(availableModels);
    } catch (error) {
      console.warn(`[api-providers] Не удалось распарсить availableModels для ${provider.name}:`, error);
      parsedModels = [];
    }
  }

  let parsedCapabilities: unknown = null;
  if (capabilities) {
    try {
      parsedCapabilities = JSON.parse(capabilities);
    } catch (error) {
      console.warn(`[api-providers] Не удалось распарсить capabilities для ${provider.name}:`, error);
      parsedCapabilities = null;
    }
  }

  return {
    ...rest,
    availableModels: Array.isArray(parsedModels) ? parsedModels : [],
    capabilities: parsedCapabilities,
  };
}

// Предустановленные модели для разных провайдеров
const DEFAULT_MODELS: Record<string, string[]> = {
  openrouter: [
    "openai/gpt-4o",
    "openai/gpt-4o-mini",
    "openai/gpt-4-turbo",
    "openai/gpt-3.5-turbo",
    "anthropic/claude-3.5-sonnet",
    "anthropic/claude-3-opus",
    "anthropic/claude-3-haiku",
    "google/gemini-pro-1.5",
    "meta-llama/llama-3.1-405b-instruct",
    "meta-llama/llama-3.1-70b-instruct",
  ],
  openai: [
    "gpt-4o",
    "gpt-4o-mini",
    "gpt-4-turbo",
    "gpt-3.5-turbo",
  ],
  anthropic: [
    "claude-3-5-sonnet-20241022",
    "claude-3-opus-20240229",
    "claude-3-sonnet-20240229",
    "claude-3-haiku-20240307",
  ],
};

// GET - список всех провайдеров
export async function GET() {
  try {
    const { error } = await ensureSuperAdmin();
    if (error) {
      return error;
    }

    const providers = await prisma.apiProvider.findMany({
      orderBy: {
        createdAt: "asc",
      },
    });

    // Если провайдеров нет, создаем дефолтные
    if (providers.length === 0) {
      const defaultProviders = [
        {
          name: "openrouter",
          displayName: "OpenRouter",
          description: "Универсальный провайдер с доступом к множеству моделей",
          apiKey: null,
          apiBaseUrl: "https://openrouter.ai/api/v1",
          availableModels: JSON.stringify(DEFAULT_MODELS.openrouter),
          isActive: true,
          isDefault: true,
        },
        {
          name: "openai",
          displayName: "OpenAI",
          description: "Официальный API OpenAI",
          apiKey: null,
          apiBaseUrl: "https://api.openai.com/v1",
          availableModels: JSON.stringify(DEFAULT_MODELS.openai),
          isActive: false,
          isDefault: false,
        },
        {
          name: "anthropic",
          displayName: "Anthropic",
          description: "Официальный API Anthropic (Claude)",
          apiKey: null,
          apiBaseUrl: "https://api.anthropic.com/v1",
          availableModels: JSON.stringify(DEFAULT_MODELS.anthropic),
          isActive: false,
          isDefault: false,
        },
      ];

      await prisma.apiProvider.createMany({
        data: defaultProviders,
      });

      const createdProviders = await prisma.apiProvider.findMany({
        orderBy: { createdAt: "asc" },
      });

      return NextResponse.json({ providers: createdProviders.map(serializeProvider) });
    }

    return NextResponse.json({ providers: providers.map(serializeProvider) });
  } catch (error) {
    console.error("[admin/api-providers] GET error:", error);
    return NextResponse.json(
      { error: "Не удалось загрузить провайдеров" },
      { status: 500 }
    );
  }
}

// POST - создание нового провайдера
export async function POST(request: NextRequest) {
  try {
    const { error } = await ensureSuperAdmin();
    if (error) {
      return error;
    }

    const {
      name,
      displayName,
      description,
      apiKey,
      apiBaseUrl,
      availableModels,
      capabilities,
      isActive,
      isDefault,
    } = await request.json();

    if (!name || typeof name !== "string" || name.trim().length === 0) {
      return NextResponse.json(
        { error: "Имя провайдера обязательно" },
        { status: 400 }
      );
    }

    if (!displayName || typeof displayName !== "string" || displayName.trim().length === 0) {
      return NextResponse.json(
        { error: "Отображаемое имя обязательно" },
        { status: 400 }
      );
    }

    // Если устанавливаем провайдера по умолчанию, снимаем флаг с других
    if (isDefault) {
      await prisma.apiProvider.updateMany({
        where: { isDefault: true },
        data: { isDefault: false },
      });
    }

    const provider = await prisma.apiProvider.create({
      data: {
        name: name.trim(),
        displayName: displayName.trim(),
        description: description?.trim() || null,
        apiKey: apiKey?.trim() || null,
        apiBaseUrl: apiBaseUrl?.trim() || null,
        availableModels: Array.isArray(availableModels)
          ? JSON.stringify(availableModels)
          : typeof availableModels === "string"
            ? availableModels
            : null,
        capabilities: capabilities ? JSON.stringify(capabilities) : null,
        isActive: Boolean(isActive),
        isDefault: Boolean(isDefault),
      },
    });

    return NextResponse.json({ provider: serializeProvider(provider) });
  } catch (error: unknown) {
    if (error && typeof error === 'object' && 'code' in error && error.code === "P2002") {
      return NextResponse.json(
        { error: "Провайдер с таким именем уже существует" },
        { status: 400 }
      );
    }
    console.error("[admin/api-providers] POST error:", error);
    return NextResponse.json(
      { error: "Не удалось создать провайдера" },
      { status: 500 }
    );
  }
}

