import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// GET /api/notifications - получить список уведомлений пользователя
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get("page") || "1");
    const limit = parseInt(searchParams.get("limit") || "50");
    const skip = (page - 1) * limit;
    const unreadOnly = searchParams.get("unreadOnly") === "true";

    const where: any = {
      userId: session.user.id,
    };

    if (unreadOnly) {
      where.readAt = null;
    }

    // КРИТИЧЕСКОЕ ИСПРАВЛЕНИЕ: Убираем таймаут Promise.race - он вызывает 503 ошибки
    // Вместо этого используем прямой запрос с обработкой ошибок
    let notifications, total, unreadCountResult;
    
    try {
      [notifications, total, unreadCountResult] = await Promise.all([
        prisma.userNotification.findMany({
          where,
          orderBy: {
            createdAt: "desc",
          },
          skip,
          take: limit,
        }),
        prisma.userNotification.count({ where }),
        prisma.userNotification.count({
          where: {
            userId: session.user.id,
            readAt: null,
          },
        }),
      ]);
    } catch (error: any) {
      console.error("[api/notifications] Database query error:", error);
      // При ошибке возвращаем пустой результат, но не 503
      notifications = [];
      total = 0;
      unreadCountResult = 0;
    }
    
    const unreadCount = unreadCountResult;

    return NextResponse.json({
      notifications,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
      unreadCount,
    });
  } catch (error) {
    console.error("[api/notifications] Error:", error);
    return NextResponse.json(
      { error: "Ошибка загрузки уведомлений" },
      { status: 500 }
    );
  }
}

// PATCH /api/notifications - пометить уведомления как прочитанные
export async function PATCH(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }

    const body = await request.json();
    const { notificationIds, markAllAsRead } = body;

    if (markAllAsRead) {
      // Помечаем все непрочитанные уведомления как прочитанные
      await prisma.userNotification.updateMany({
        where: {
          userId: session.user.id,
          readAt: null,
        },
        data: {
          readAt: new Date(),
        },
      });
    } else if (notificationIds && Array.isArray(notificationIds) && notificationIds.length > 0) {
      // Помечаем указанные уведомления как прочитанные
      await prisma.userNotification.updateMany({
        where: {
          id: { in: notificationIds },
          userId: session.user.id, // Защита от изменения чужих уведомлений
        },
        data: {
          readAt: new Date(),
        },
      });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[api/notifications] Error:", error);
    return NextResponse.json(
      { error: "Ошибка при обновлении уведомлений" },
      { status: 500 }
    );
  }
}
