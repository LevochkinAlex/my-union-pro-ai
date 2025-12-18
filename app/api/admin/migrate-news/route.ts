import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

/**
 * POST /api/admin/migrate-news
 * Переносит все новости от супер-админов к указанному председателю ППО
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }

    // Только супер-админ может выполнить миграцию
    const currentUser = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { role: true },
    });

    if (currentUser?.role !== "SUPER_ADMIN") {
      return NextResponse.json({ error: "Доступ запрещен" }, { status: 403 });
    }

    const body = await request.json();
    const { targetEmail } = body;

    if (!targetEmail) {
      return NextResponse.json(
        { error: "Укажите email председателя (targetEmail)" },
        { status: 400 }
      );
    }

    // 1. Находим пользователя-председателя
    const chairman = await prisma.user.findUnique({
      where: { email: targetEmail },
      include: {
        ppoHeadOrganization: true,
      },
    });

    if (!chairman) {
      return NextResponse.json(
        { error: `Пользователь ${targetEmail} не найден` },
        { status: 404 }
      );
    }

    if (!chairman.isPPOHead || !chairman.ppoHeadOrganization) {
      return NextResponse.json(
        { error: `Пользователь ${targetEmail} не является председателем ППО` },
        { status: 400 }
      );
    }

    const organizationId = chairman.ppoHeadOrganization.id;

    // 2. Проверяем/создаём основной канал для организации
    let mainChannel = await prisma.newsChannel.findFirst({
      where: {
        organizationId: organizationId,
        isDefault: true,
      },
    });

    if (!mainChannel) {
      mainChannel = await prisma.newsChannel.create({
        data: {
          name: "Основной",
          description: `Основной канал новостей ${chairman.ppoHeadOrganization.name}`,
          organizationId: organizationId,
          createdById: chairman.id,
          isDefault: true,
          isActive: true,
        },
      });
    }

    // 3. Находим все новости от супер-админов
    const superAdmins = await prisma.user.findMany({
      where: { role: "SUPER_ADMIN" },
      select: { id: true },
    });

    const superAdminIds = superAdmins.map((u) => u.id);

    const adminNews = await prisma.newsPost.findMany({
      where: {
        authorId: { in: superAdminIds },
      },
      select: {
        id: true,
        title: true,
      },
    });

    // 4. Переносим каждую новость
    const migratedPosts: string[] = [];
    for (const post of adminNews) {
      await prisma.newsPost.update({
        where: { id: post.id },
        data: {
          authorId: chairman.id,
          channelId: mainChannel.id,
        },
      });
      migratedPosts.push(post.title);
    }

    return NextResponse.json({
      success: true,
      message: `Перенесено ${migratedPosts.length} новостей`,
      details: {
        chairman: {
          id: chairman.id,
          email: chairman.email,
          name: `${chairman.firstName} ${chairman.lastName}`,
        },
        organization: chairman.ppoHeadOrganization.name,
        channel: {
          id: mainChannel.id,
          name: mainChannel.name,
        },
        migratedPosts,
      },
    });
  } catch (error: any) {
    console.error("[admin/migrate-news] Error:", error);
    return NextResponse.json(
      {
        error: "Ошибка миграции",
        details: process.env.NODE_ENV === "development" ? error.message : undefined,
      },
      { status: 500 }
    );
  }
}

