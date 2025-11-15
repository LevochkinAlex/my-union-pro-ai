import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { UserRole } from "@prisma/client";

export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions);

    // Только суперадмин может отправлять массовые уведомления
    if (session?.user?.role !== UserRole.SUPER_ADMIN) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
      });
    }

    const { heading, content, targetRole } = await request.json();

    if (!heading || !content) {
      return new Response(
        JSON.stringify({ error: "Heading and content are required" }),
        { status: 400 }
      );
    }

    // Получаем все подписки пользователей (опционально фильтруем по роли)
    const subscriptionsQuery: any = {};
    if (targetRole) {
      subscriptionsQuery.user = {
        role: targetRole,
      };
    }

    const subscriptions = await prisma.pushSubscription.findMany({
      where: subscriptionsQuery,
      select: { fcmToken: true },
      distinct: ["fcmToken"],
    });

    if (subscriptions.length === 0) {
      return new Response(
        JSON.stringify({ error: "No subscribers found", count: 0 }),
        { status: 400 }
      );
    }

    const fcmTokens = subscriptions.map((sub) => sub.fcmToken).filter(Boolean);

    if (fcmTokens.length === 0) {
      return new Response(
        JSON.stringify({ error: "No valid FCM tokens found", count: 0 }),
        { status: 400 }
      );
    }

    // Import Firebase Admin
    const { messaging } = await import("@/lib/firebase-admin");

    // Send notification to all tokens
    const message = {
      notification: {
        title: heading,
        body: content,
      },
      webpush: {
        notification: {
          title: heading,
          body: content,
          icon: `${process.env.NEXT_PUBLIC_APP_URL || "https://myunion.pro"}/logo.png`,
          badge: `${process.env.NEXT_PUBLIC_APP_URL || "https://myunion.pro"}/logo.png`,
          sound: `${process.env.NEXT_PUBLIC_APP_URL || "https://myunion.pro"}/notification-sound.mp3`,
        },
      },
      android: {
        priority: "high" as const,
        notification: {
          sound: "default",
        },
      },
      apns: {
        payload: {
          aps: {
            sound: "default",
          },
        },
      },
      tokens: fcmTokens,
    };

    console.log("[admin/notifications] 📢 Sending FCM broadcast:", {
      recipients: fcmTokens.length,
      heading,
    });

    const response = await messaging.sendEachForMulticast(message);

    console.log("[admin/notifications] ✅ Broadcast sent:", {
      successCount: response.successCount,
      failureCount: response.failureCount,
      heading,
    });

    return new Response(
      JSON.stringify({
        success: true,
        recipientCount: response.successCount,
        failureCount: response.failureCount,
      }),
      { status: 200 }
    );
  } catch (error) {
    console.error("[admin/notifications] Error:", error);
    return new Response(
      JSON.stringify({ error: "Internal error", details: String(error) }),
      { status: 500 }
    );
  }
}
