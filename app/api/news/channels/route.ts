import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getOrCreateRegionalNewsChannel } from "@/lib/regional-news";

/**
 * GET /api/news/channels
 * Получить каналы новостей организации текущего пользователя
 */
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }

    // Получаем организацию пользователя
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: {
        organizationId: true,
        organization: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    if (!user?.organizationId) {
      const regional = await getOrCreateRegionalNewsChannel(session.user.id);
      return NextResponse.json({
        channels: [
          {
            id: regional.id,
            name: regional.name,
            description: regional.description || "Глобальный канал региональных новостей",
            subscriberCount: 0,
            isMain: false,
            organizationId: null,
          },
        ],
        organization: null,
      });
    }

    // Получаем количество пользователей в организации
    const memberCount = await prisma.user.count({
      where: {
        organizationId: user.organizationId,
      },
    });

    // Получаем каналы организации
    const channelsRaw = await prisma.newsChannel.findMany({
      where: {
        OR: [{ organizationId: user.organizationId }, { organizationId: null, name: "Региональные новости" }],
      },
      include: {
        _count: {
          select: {
            newsPosts: true,
          },
        },
        organization: {
          select: {
            id: true,
            name: true,
          },
        },
      },
      orderBy: [
        { createdAt: "asc" },
      ],
    });
    
    // Форматируем данные для клиента
    const channels = channelsRaw.map((channel) => ({
      id: channel.id,
      name: channel.name,
      description: channel.description || channel.organization?.name || null,
      subscriberCount: memberCount,
      isMain: channel.isMain,
      organizationId: channel.organizationId,
    }));
    
    // Сортируем: основной канал (isMain) всегда первый
    channels.sort((a, b) => {
      if (a.isMain) return -1;
      if (b.isMain) return 1;
      return 0;
    });

    return NextResponse.json({
      channels,
      organization: user.organization,
    });
  } catch (error) {
    console.error("[api/news/channels] Error:", error);
    return NextResponse.json(
      { error: "Ошибка при получении каналов" },
      { status: 500 }
    );
  }
}

