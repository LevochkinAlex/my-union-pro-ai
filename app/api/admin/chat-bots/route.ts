import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { ensureSuperAdmin } from "@/lib/admin-auth";

// GET - список всех ботов
export async function GET() {
  try {
    const { error } = await ensureSuperAdmin();
    if (error) {
      return error;
    }

    const bots = await prisma.chatBot.findMany({
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
          },
        },
        _count: {
          select: {
            knowledgeBases: true,
          },
        },
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    return NextResponse.json({ bots });
  } catch (error) {
    console.error("[admin/chat-bots] GET error:", error);
    return NextResponse.json(
      { error: "Не удалось загрузить ботов" },
      { status: 500 }
    );
  }
}

// POST - создание нового бота
export async function POST(request: NextRequest) {
  try {
    const { error } = await ensureSuperAdmin();
    if (error) {
      return error;
    }

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
      isDefault,
    } = await request.json();

    if (!name || typeof name !== "string" || name.trim().length === 0) {
      return NextResponse.json(
        { error: "Название бота обязательно" },
        { status: 400 }
      );
    }

    if (!systemPrompt || typeof systemPrompt !== "string" || systemPrompt.trim().length === 0) {
      return NextResponse.json(
        { error: "Системный промпт обязателен" },
        { status: 400 }
      );
    }

    let providerId: string | null = null;
    if (apiProviderId) {
      const provider = await prisma.apiProvider.findUnique({
        where: { id: apiProviderId },
      });
      if (!provider) {
        return NextResponse.json(
          { error: "Указанный API провайдер не найден" },
          { status: 400 }
        );
      }
      providerId = provider.id;
    }

    const cleanOverride = providerOverride && typeof providerOverride === "object"
      ? Object.fromEntries(
          Object.entries(providerOverride).filter(([, value]) =>
            value !== null && value !== undefined && String(value).trim() !== ""
          ),
        )
      : null;

    const cleanRetrievalConfig = retrievalConfig && typeof retrievalConfig === "object"
      ? retrievalConfig
      : null;

    // Если устанавливаем бота по умолчанию, снимаем флаг с других
    if (isDefault) {
      await prisma.chatBot.updateMany({
        where: { isDefault: true },
        data: { isDefault: false },
      });
    }

    const bot = await prisma.chatBot.create({
      data: {
        name: name.trim(),
        description: description?.trim() || null,
        systemPrompt: systemPrompt.trim(),
        tone: tone || "professional",
        context: context?.trim() || null,
        model: model || "openai/gpt-4o-mini",
        apiProviderId: providerId,
        providerOverride: cleanOverride,
        retrievalConfig: cleanRetrievalConfig,
        temperature: temperature !== undefined ? Number(temperature) : 0.7,
        maxTokens: maxTokens !== undefined ? Number(maxTokens) : 1000,
        isDefault: Boolean(isDefault),
        knowledgeBases: knowledgeBaseIds?.length
          ? {
              create: knowledgeBaseIds.map((kbId: string) => ({
                knowledgeBaseId: kbId,
              })),
            }
          : undefined,
      },
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
          },
        },
      },
    });

    return NextResponse.json({ bot });
  } catch (error) {
    console.error("[admin/chat-bots] POST error:", error);
    return NextResponse.json(
      { error: "Не удалось создать бота" },
      { status: 500 }
    );
  }
}

