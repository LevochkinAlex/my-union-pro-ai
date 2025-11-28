import type { ApiProvider } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { ensureSuperAdmin } from "@/lib/admin-auth";

function serializeProvider(provider: ApiProvider) {
  const { availableModels, capabilities, ...rest } = provider;
  let parsedModels: unknown = [];
  if (typeof availableModels === "string" && availableModels.trim().length > 0) {
    try {
    const { id } = await params;
      parsedModels = JSON.parse(availableModels);
    } catch (error) {
      console.warn(`[api-providers] Не удалось распарсить availableModels для ${provider.name}:`, error);
      parsedModels = [];
    }
  }

  let parsedCapabilities: unknown = null;
  if (typeof capabilities === "string" && capabilities.trim().length > 0) {
    try {
    const { id } = await params;
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
    availableModels: Array.isArray(parsedModels) ? parsedModels : [],
    capabilities: parsedCapabilities,
  };
}

// GET - получение провайдера
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } | Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { error } = await ensureSuperAdmin();
    if (error) {
      return error;
    }

    const resolvedParams = await Promise.resolve(params);
    const id = resolvedParams.id;

    const provider = await prisma.apiProvider.findUnique({
      where: { id },
    });

    if (!provider) {
      return NextResponse.json(
        { error: "Провайдер не найден" },
        { status: 404 }
      );
    }

    return NextResponse.json({ provider: serializeProvider(provider) });
  } catch (error) {
    console.error("[admin/api-providers] GET error:", error);
    return NextResponse.json(
      { error: "Не удалось загрузить провайдера" },
      { status: 500 }
    );
  }
}

// PUT - обновление провайдера
export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } | Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { error } = await ensureSuperAdmin();
    if (error) {
      return error;
    }

    const resolvedParams = await Promise.resolve(params);
    const id = resolvedParams.id;

    const {
      displayName,
      description,
      apiKey,
      apiBaseUrl,
      availableModels,
      capabilities,
      isActive,
      isDefault,
    } = await request.json();

    const updateData: Record<string, unknown> = {};
    if (displayName !== undefined) {
      updateData.displayName = displayName.trim();
    }
    if (description !== undefined) {
      updateData.description = description?.trim() || null;
    }
    if (apiKey !== undefined) {
      updateData.apiKey = apiKey?.trim() || null;
    }
    if (apiBaseUrl !== undefined) {
      updateData.apiBaseUrl = apiBaseUrl?.trim() || null;
    }
    if (availableModels !== undefined) {
      updateData.availableModels = Array.isArray(availableModels)
        ? JSON.stringify(availableModels)
        : typeof availableModels === "string"
          ? availableModels
          : null;
    }
    if (capabilities !== undefined) {
      updateData.capabilities = capabilities ? JSON.stringify(capabilities) : null;
    }
    if (isActive !== undefined) {
      updateData.isActive = Boolean(isActive);
    }
    if (isDefault !== undefined) {
      // Если устанавливаем провайдера по умолчанию, снимаем флаг с других
      if (isDefault) {
        await prisma.apiProvider.updateMany({
          where: {
            isDefault: true,
            id: { not: id },
          },
          data: { isDefault: false },
        });
      }
      updateData.isDefault = Boolean(isDefault);
    }

    const provider = await prisma.apiProvider.update({
      where: { id },
      data: updateData,
    });

    return NextResponse.json({ provider: serializeProvider(provider) });
  } catch (error) {
    console.error("[admin/api-providers] PUT error:", error);
    return NextResponse.json(
      { error: "Не удалось обновить провайдера" },
      { status: 500 }
    );
  }
}

// DELETE - удаление провайдера
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } | Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { error } = await ensureSuperAdmin();
    if (error) {
      return error;
    }

    const resolvedParams = await Promise.resolve(params);
    const id = resolvedParams.id;

    // Проверяем, не используется ли провайдер ботами
    const botsUsingProvider = await prisma.chatBot.count({
      where: {
        apiProviderId: id,
      },
    });

    if (botsUsingProvider > 0) {
      return NextResponse.json(
        { error: `Провайдер используется ${botsUsingProvider} ботом(ами). Сначала удалите или измените ботов.` },
        { status: 400 }
      );
    }

    await prisma.apiProvider.delete({
      where: { id },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[admin/api-providers] DELETE error:", error);
    return NextResponse.json(
      { error: "Не удалось удалить провайдера" },
      { status: 500 }
    );
  }
}

