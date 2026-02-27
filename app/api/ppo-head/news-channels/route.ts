import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getPPOHead, getOrgHead } from "@/lib/ppo-head-utils";
import { syncChannelWithChat } from "@/lib/channel-sync";
import { isDemoUserId } from "@/lib/demo";
import { getOrCreateRegionalNewsChannel } from "@/lib/regional-news";

/**
 * GET /api/ppo-head/news-channels
 * Получить список каналов публикации для Председателя (ППО/МПО/РПО)
 * Для РПО — только один канал «Региональные новости», создание каналов недоступно.
 */
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }

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

    const chairman = await getOrgHead(session.user.id);

    if (!chairman) {
      return NextResponse.json(
        { error: "Доступ запрещен или организация не назначена" },
        { status: 403 }
      );
    }

    // РПО: только один канал — «Региональные новости», без возможности создавать каналы
    if (chairman.level === "RPO") {
      const regionalChannel = await getOrCreateRegionalNewsChannel(session.user.id);
      const count = await prisma.newsPost.count({
        where: { channelId: regionalChannel.id, isPublished: true },
      });
      return NextResponse.json({
        channels: [
          {
            ...regionalChannel,
            _count: { newsPosts: count },
            chat: null,
            canPublish: true,
          },
        ],
      });
    }

    // ППО/МПО: каналы своей организации + региональный канал (для просмотра; публиковать в региональный может только РПО)
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

      const orgName = organization?.name || "организации";
      const defaultChannel = await prisma.newsChannel.create({
        data: {
          name: orgName,
          description: `Канал новостей ${orgName}`,
          organizationId: chairman.organizationId,
          createdById: chairman.id,
          isMain: true,
        },
        include: {
          _count: {
            select: {
              newsPosts: true,
            },
          },
        },
      });

      const regionalChannel = await getOrCreateRegionalNewsChannel(session.user.id);
      const regionalCount = await prisma.newsPost.count({
        where: { channelId: regionalChannel.id, isPublished: true },
      });
      return NextResponse.json({
        channels: [
          { ...regionalChannel, _count: { newsPosts: regionalCount }, chat: null, canPublish: false },
          { ...defaultChannel, canPublish: true },
        ],
      });
    }
    
    // Сортируем: основной канал (isMain) всегда первый
    channels.sort((a, b) => {
      if (a.isMain) return -1;
      if (b.isMain) return 1;
      return 0;
    });

    const regionalChannel = await getOrCreateRegionalNewsChannel(session.user.id);
    const regionalCount = await prisma.newsPost.count({
      where: { channelId: regionalChannel.id, isPublished: true },
    });
    const withRegional = [
      {
        ...regionalChannel,
        _count: { newsPosts: regionalCount },
        chat: null,
        canPublish: false, // Публиковать в региональный могут только РПО
      },
      ...channels.map((ch) => ({ ...ch, canPublish: true })),
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
 * Создать новый канал публикации. Для РПО запрещено — только один региональный канал.
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }

    const chairman = await getOrgHead(session.user.id);

    if (!chairman) {
      return NextResponse.json(
        { error: "Доступ запрещен или организация не назначена" },
        { status: 403 }
      );
    }

    if (chairman.level === "RPO") {
      return NextResponse.json(
        { error: "Для регионального кабинета РПО доступен только один канал «Региональные новости». Создание каналов отключено." },
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

