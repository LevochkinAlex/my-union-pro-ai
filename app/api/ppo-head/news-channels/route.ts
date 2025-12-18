import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getPPOHead } from "@/lib/ppo-head-utils";

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

    // Проверяем, что пользователь является Председателем
    const chairman = await getPPOHead(session.user.id);

    if (!chairman) {
      return NextResponse.json(
        { error: "Доступ запрещен или организация не назначена" },
        { status: 403 }
      );
    }

    // Получаем каналы организации
    const channels = await prisma.newsChannel.findMany({
      where: {
        organizationId: chairman.organizationId,
      },
      include: {
        _count: {
          select: {
            newsPosts: true,
          },
        },
      },
      orderBy: [
        { isMain: "desc" },
        { createdAt: "desc" },
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

      return NextResponse.json({ channels: [defaultChannel] });
    }

    return NextResponse.json({ channels });
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
        isMain: false,
      },
      include: {
        _count: {
          select: {
            newsPosts: true,
          },
        },
      },
    });

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

