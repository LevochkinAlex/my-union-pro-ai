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

    console.log(`[api/notifications] ========== LOADING NOTIFICATIONS ==========`);
    console.log(`[api/notifications] User: ${session.user.id}, page: ${page}, limit: ${limit}, unreadOnly: ${unreadOnly}`);

    // Исключаем уведомления о новых сообщениях в чате — непрочитанные отображаются в сайдбаре чатов
    const where: any = {
      userId: session.user.id,
      type: { not: "chat_message" },
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
            type: { not: "chat_message" },
          },
        }),
      ]);
      
      console.log(`[api/notifications] ✅ Loaded: ${notifications.length} notifications, total: ${total}, unread: ${unreadCountResult}`);
      if (notifications.length > 0) {
        console.log(`[api/notifications] Latest notification:`, {
          id: notifications[0].id,
          type: notifications[0].type,
          title: notifications[0].title,
          createdAt: notifications[0].createdAt,
        });
      }
    } catch (error: any) {
      console.error("[api/notifications] ❌ Database query error:", error);
      // При ошибке возвращаем пустой результат, но не 503
      notifications = [];
      total = 0;
      unreadCountResult = 0;
    }
    
    const unreadCount = unreadCountResult;

    const DOC_APPROVAL_TYPES = ["meeting_agenda_review", "meeting_document_approval"];
    const documentIds = new Set<string>();
    for (const n of notifications) {
      if (DOC_APPROVAL_TYPES.includes(n.type) && n.metadata && typeof n.metadata === "object" && "documentId" in n.metadata && typeof (n.metadata as { documentId?: string }).documentId === "string") {
        documentIds.add((n.metadata as { documentId: string }).documentId);
      }
    }
    let documentStatusMap: Record<string, string> = {};
    if (documentIds.size > 0) {
      const docs = await prisma.document.findMany({
        where: { id: { in: [...documentIds] } },
        select: { id: true, status: true },
      });
      documentStatusMap = Object.fromEntries(docs.map((d) => [d.id, d.status]));
    }
    const notificationsWithStatus = notifications.map((n) => {
      const meta = n.metadata as { documentId?: string } | null;
      const docId = meta?.documentId;
      const documentStatus = docId ? documentStatusMap[docId] ?? null : null;
      return { ...n, documentStatus };
    });

    return NextResponse.json({
      notifications: notificationsWithStatus,
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

// DELETE /api/notifications - удалить все уведомления пользователя (очистить список)
export async function DELETE(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }

    const result = await prisma.userNotification.deleteMany({
      where: {
        userId: session.user.id,
        type: { not: "chat_message" }, // не трогаем уведомления чата — они в сайдбаре
      },
    });

    return NextResponse.json({
      success: true,
      deletedCount: result.count,
    });
  } catch (error) {
    console.error("[api/notifications] DELETE error:", error);
    return NextResponse.json(
      { error: "Ошибка при очистке уведомлений" },
      { status: 500 }
    );
  }
}
