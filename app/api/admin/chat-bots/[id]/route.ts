import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { ensureSuperAdmin } from "@/lib/admin-auth";

// GET - получение бота
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } | Promise<{ id: string }> }
) {
  try {
    const { error } = await ensureSuperAdmin();
    if (error) {
      return error;
    }

    const resolvedParams = await Promise.resolve(params);
    const id = resolvedParams.id;

    const bot = await prisma.chatBot.findUnique({
      where: { id },
      include: {
        knowledgeBases: {
          include: {
            knowledgeBase: {
              select: {
                id: true,
                name: true,
                description: true,
              },
            },
          },
        },
        apiProvider: {
          select: {
            id: true,
            name: true,
            displayName: true,
            description: true,
            apiBaseUrl: true,
            availableModels: true,
          },
        },
      },
    });

    if (!bot) {
      return NextResponse.json({ error: "Бот не найден" }, { status: 404 });
    }

    return NextResponse.json({ bot });
  } catch (error) {
    console.error("[admin/chat-bots] GET error:", error);
    return NextResponse.json(
      { error: "Не удалось загрузить бота" },
      { status: 500 }
    );
  }
}

// PUT - обновление бота
export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } | Promise<{ id: string }> }
) {
  try {
    const { error } = await ensureSuperAdmin();
    if (error) {
      return error;
    }

    const resolvedParams = await Promise.resolve(params);
    const id = resolvedParams.id;

    const body = await request.json();
    console.log("[admin/chat-bots] PUT body:", JSON.stringify(body, null, 2));

    const {
      name,
      description,
      systemPrompt,
      tone,
      context,
      model,
      apiProviderId,
      providerOverride,
      retrievalConfig,
      temperature,
      maxTokens,
      knowledgeBaseIds,
      isActive,
      isDefault,
    } = body;

    const updateData: Record<string, unknown> = {};
    if (name !== undefined) {
      if (typeof name !== "string" || name.trim().length === 0) {
        return NextResponse.json(
          { error: "Название не может быть пустым" },
          { status: 400 }
        );
      }
      updateData.name = name.trim();
    }
    if (description !== undefined) {
      updateData.description = description?.trim() || null;
    }
    if (systemPrompt !== undefined) {
      if (typeof systemPrompt !== "string" || systemPrompt.trim().length === 0) {
        return NextResponse.json(
          { error: "Системный промпт не может быть пустым" },
          { status: 400 }
        );
      }
      updateData.systemPrompt = systemPrompt.trim();
    }
    if (tone !== undefined) {
      updateData.tone = tone;
    }
    if (context !== undefined) {
      updateData.context = context?.trim() || null;
    }
    if (model !== undefined) {
      if (typeof model !== "string" || model.trim().length === 0) {
        return NextResponse.json(
          { error: "Модель должна быть непустой строкой" },
          { status: 400 }
        );
      }
      updateData.model = model.trim();
    }
    if (apiProviderId !== undefined) {
      if (apiProviderId === null) {
        updateData.apiProviderId = null;
      } else {
        const provider = await prisma.apiProvider.findUnique({
          where: { id: apiProviderId },
        });
        if (!provider) {
          return NextResponse.json(
            { error: "Указанный API провайдер не найден" },
            { status: 400 }
          );
        }
        updateData.apiProviderId = provider.id;
      }
    }
    if (providerOverride !== undefined) {
      if (
        providerOverride &&
        typeof providerOverride === "object" &&
        Object.values(providerOverride).some((value) =>
          value !== null && value !== undefined && String(value).trim() !== ""
        )
      ) {
        updateData.providerOverride = providerOverride;
      } else {
        updateData.providerOverride = null;
      }
    }
    if (retrievalConfig !== undefined) {
      updateData.retrievalConfig =
        retrievalConfig && typeof retrievalConfig === "object" ? retrievalConfig : null;
    }
    if (temperature !== undefined) {
      updateData.temperature = Number(temperature);
    }
    if (maxTokens !== undefined) {
      updateData.maxTokens = Number(maxTokens);
    }
    if (isActive !== undefined) {
      updateData.isActive = Boolean(isActive);
    }
    if (isDefault !== undefined) {
      // Если устанавливаем бота по умолчанию, снимаем флаг с других
      if (isDefault) {
        await prisma.chatBot.updateMany({
          where: {
            isDefault: true,
            id: { not: id },
          },
          data: { isDefault: false },
        });
      }
      updateData.isDefault = Boolean(isDefault);
    }

    // Обновляем связи с базами знаний, если предоставлены
    if (knowledgeBaseIds !== undefined && Array.isArray(knowledgeBaseIds)) {
      console.log("[admin/chat-bots] Updating knowledge bases:", knowledgeBaseIds);
      await prisma.chatBotKnowledgeBase.deleteMany({
        where: { chatBotId: id },
      });

      if (knowledgeBaseIds.length > 0) {
        await prisma.chatBotKnowledgeBase.createMany({
          data: knowledgeBaseIds.map((kbId: string) => ({
            chatBotId: id,
            knowledgeBaseId: kbId,
          })),
        });
      }
    }

    console.log("[admin/chat-bots] updateData:", JSON.stringify(updateData, null, 2));
    
    const bot = await prisma.chatBot.update({
      where: { id },
      data: updateData,
      include: {
        knowledgeBases: {
          include: {
            knowledgeBase: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        },
        apiProvider: {
          select: {
            id: true,
            name: true,
            displayName: true,
            description: true,
            apiBaseUrl: true,
            availableModels: true,
          },
        },
      },
    });

    return NextResponse.json({ bot });
  } catch (error) {
    console.error("[admin/chat-bots] PUT error:", error);
    return NextResponse.json(
      { error: "Не удалось обновить бота" },
      { status: 500 }
    );
  }
}

// DELETE - удаление бота
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } | Promise<{ id: string }> }
) {
  try {
    const { error } = await ensureSuperAdmin();
    if (error) {
      return error;
    }

    const resolvedParams = await Promise.resolve(params);
    const id = resolvedParams.id;

    // Проверяем, не является ли бот ботом по умолчанию
    const bot = await prisma.chatBot.findUnique({
      where: { id },
      select: { isDefault: true },
    });

    if (bot?.isDefault) {
      return NextResponse.json(
        { error: "Нельзя удалить бота по умолчанию" },
        { status: 400 }
      );
    }

    await prisma.chatBot.delete({
      where: { id },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[admin/chat-bots] DELETE error:", error);
    return NextResponse.json(
      { error: "Не удалось удалить бота" },
      { status: 500 }
    );
  }
}

