import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getPPOHead } from "@/lib/ppo-head-utils";
import { syncChannelWithChat } from "@/lib/channel-sync";
import { isDemoUserId } from "@/lib/demo";
import { getOrCreateRegionalNewsChannel } from "@/lib/regional-news";

/**
 * GET /api/ppo-head/news-channels
 * Получить список каналов публикации для Председателя
 */
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }

    // Демо: один виртуальный канал для отображения новостей (только чтение)
    if (isDemoUserId(session.user.id)) {
      return NextResponse.json({
        channels: [
          {
            id: "demo-channel",
            name: "Новости",
            description: "Новости ППО Аппарат МООП РЗ РФ",
            iconUrl: null,
            isMain: true,
            _count: { newsPosts: 3 },
            chat: null,
          },
        ],
      });
    }

    // Проверяем, что пользователь является Председателем
    const chairman = await getPPOHead(session.user.id);

    if (!chairman) {
      return NextResponse.json(
        { error: "Доступ запрещен или организация не назначена" },
        { status: 403 }
      );
    }

    const regionalChannel = await getOrCreateRegionalNewsChannel(session.user.id);

    // Получаем каналы организации
    let channels = await prisma.newsChannel.findMany({
      where: {
        organizationId: chairman.organizationId,
      },
      include: {
        _count: {
          select: {
            newsPosts: true,
          },
        },
        chat: {
          select: {
            id: true,
          },
        },
      },
      orderBy: [
        { createdAt: "asc" },
      ],
    });

    // Синхронизируем каналы без Chat с чатами
    for (const channel of channels) {
      if (!channel.chat) {
        await syncChannelWithChat(channel.id, chairman.organizationId);
      }
    }

    // Перезагружаем каналы после синхронизации
    channels = await prisma.newsChannel.findMany({
      where: {
        organizationId: chairman.organizationId,
      },
      include: {
        chat: {
          select: {
            id: true,
          },
        },
        _count: {
          select: {
            newsPosts: true,
          },
        },
      },
      orderBy: [
        { createdAt: "asc" },
      ],
    });

    // Если каналов нет, создаем основной канал по умолчанию
    if (channels.length === 0) {
      const organization = await prisma.organization.findUnique({
        where: { id: chairman.organizationId },
        select: { name: true },
      });

      const defaultChannel = await prisma.newsChannel.create({
        data: {
          name: "Основной",
          description: `Основной канал новостей ${organization?.name || "организации"}`,
          organizationId: chairman.organizationId,
          createdById: chairman.id,
        },
        include: {
          _count: {
            select: {
              newsPosts: true,
            },
          },
        },
      });

      return NextResponse.json({ channels: [defaultChannel] });
    }
    
    // Сортируем: "Основной" канал всегда первый
    channels.sort((a, b) => {
      if (a.name === "Основной") return -1;
      if (b.name === "Основной") return 1;
      return 0;
    });

    const withRegional = [
      {
        ...regionalChannel,
        _count: { newsPosts: 0 },
        chat: null,
      },
      ...channels,
    ];

    return NextResponse.json({ channels: withRegional });
  } catch (error: any) {
    console.error("[ppo-head/news-channels] GET error:", error);
    return NextResponse.json(
      {
        error: "Ошибка при получении каналов",
        details: process.env.NODE_ENV === "development" ? error.message : undefined,
      },
      { status: 500 }
    );
  }
}

/**
 * POST /api/ppo-head/news-channels
 * Создать новый канал публикации
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }

    // Проверяем, что пользователь является Председателем
    const chairman = await getPPOHead(session.user.id);

    if (!chairman) {
      return NextResponse.json(
        { error: "Доступ запрещен или организация не назначена" },
        { status: 403 }
      );
    }

    const { name, description, iconUrl } = await request.json();

    if (!name || !name.trim()) {
      return NextResponse.json(
        { error: "Название канала обязательно" },
        { status: 400 }
      );
    }

    const channel = await prisma.newsChannel.create({
      data: {
        name: name.trim(),
        description: description?.trim() || null,
        iconUrl: iconUrl || null,
        organizationId: chairman.organizationId,
        createdById: chairman.id,
      },
      include: {
        _count: {
          select: {
            newsPosts: true,
          },
        },
      },
    });

    // Синхронизируем с чатом: создаем Chat для канала
    await syncChannelWithChat(channel.id, chairman.organizationId);

    return NextResponse.json({ channel }, { status: 201 });
  } catch (error: any) {
    console.error("[ppo-head/news-channels] POST error:", error);
    return NextResponse.json(
      {
        error: "Ошибка при создании канала",
        details: process.env.NODE_ENV === "development" ? error.message : undefined,
      },
      { status: 500 }
    );
  }
}

