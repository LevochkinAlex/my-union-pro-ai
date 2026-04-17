import type { ApiProvider } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { ensureSuperAdmin } from "@/lib/admin-auth";

function serializeProvider(provider: ApiProvider) {
  const { availableModels, capabilities, ...rest } = provider;
  let parsedModels: unknown = [];
  if (typeof availableModels === "string" && availableModels.trim().length > 0) {
    try {
      parsedModels = JSON.parse(availableModels);
    } catch (error) {
      console.warn(`[api-providers] Не удалось распарсить availableModels для ${provider.name}:`, error);
      parsedModels = [];
    }
  }

  // Если модели - это объекты с полем 'id', извлекаем только ID (строки)
  let modelStrings: string[] = [];
  if (Array.isArray(parsedModels)) {
    modelStrings = parsedModels.map((model: any) => {
      if (typeof model === 'string') {
        return model;
      } else if (typeof model === 'object' && model !== null && 'id' in model) {
        return model.id; // Извлекаем ID из объекта
      }
      return String(model); // Fallback
    });
  }

  let parsedCapabilities: unknown = null;
  if (typeof capabilities === "string" && capabilities.trim().length > 0) {
    try {
      parsedCapabilities = JSON.parse(capabilities);
    } catch (error) {
      console.warn(`[api-providers] Не удалось распарсить capabilities для ${provider.name}:`, error);
      parsedCapabilities = null;
    }
  } else if (capabilities) {
    parsedCapabilities = capabilities;
  }

  return {
    ...rest,
    availableModels: modelStrings, // Теперь всегда массив строк
    capabilities: parsedCapabilities,
  };
}

// Предустановленные модели Yandex Foundation Models.
// Каталог меняется редко, поэтому храним список локально и синхронизируем
// вручную из админки кнопкой "Обновить модели Yandex".
export const YANDEX_MODELS: string[] = [
  "yandexgpt",
  "yandexgpt-lite",
  "yandexgpt-32k",
  "yandexgpt-5-pro",
  "yandexgpt-5-lite",
];

const DEFAULT_MODELS: Record<string, string[]> = {
  yandex: YANDEX_MODELS,
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

    // Если провайдеров нет, создаём единственный дефолтный — Yandex.
    if (providers.length === 0) {
      await prisma.apiProvider.create({
        data: {
          name: "yandex",
          displayName: "Yandex Foundation Models",
          description: "YandexGPT — основной ИИ-провайдер платформы (совместим с РФ-блокировками).",
          apiKey: null,
          apiBaseUrl: "https://llm.api.cloud.yandex.net/foundationModels/v1",
          availableModels: JSON.stringify(DEFAULT_MODELS.yandex),
          isActive: true,
          isDefault: true,
        },
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

