import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

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
      return NextResponse.json({
        channels: [],
        organization: null,
      });
    }

    // Получаем каналы организации
    const channels = await prisma.newsChannel.findMany({
      where: {
        organizationId: user.organizationId,
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
    
    // Сортируем: "Основной" канал всегда первый
    channels.sort((a, b) => {
      if (a.name === "Основной") return -1;
      if (b.name === "Основной") return 1;
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

