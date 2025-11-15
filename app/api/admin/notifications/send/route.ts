import { getServerSession } from "next-auth/react";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
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

    // Получаем OneSignal конфиг из системных настроек
    const settings = await prisma.systemSettings.findUnique({
      where: { id: "system_settings" },
    });

    if (!settings?.oneSignalAppId || !settings?.oneSignalRestApiKey) {
      return new Response(
        JSON.stringify({ error: "OneSignal not configured" }),
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
      select: { oneSignalId: true },
      distinct: ["oneSignalId"],
    });

    if (subscriptions.length === 0) {
      return new Response(
        JSON.stringify({ error: "No subscribers found", count: 0 }),
        { status: 400 }
      );
    }

    const playerIds = subscriptions.map((sub) => sub.oneSignalId);

    // Отправляем уведомление через OneSignal API
    const notificationPayload = {
      app_id: settings.oneSignalAppId,
      include_player_ids: playerIds,
      headings: { ru: heading, en: heading },
      contents: { ru: content, en: content },
      chrome_web_sound: "default",
      firefox_sound: "default",
      sound: "default",
      priority: 10,
      ttl: 86400,
    };

    const ONESIGNAL_API_URL = "https://onesignal.com/api/v1/notifications";
    const pushResponse = await fetch(ONESIGNAL_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        Authorization: `Bearer ${settings.oneSignalRestApiKey}`,
      },
      body: JSON.stringify(notificationPayload),
    });

    if (!pushResponse.ok) {
      const errorText = await pushResponse.text();
      console.error("[admin/notifications] OneSignal error:", errorText);
      return new Response(
        JSON.stringify({ error: "Failed to send notifications", details: errorText }),
        { status: pushResponse.status }
      );
    }

    const result = await pushResponse.json();

    console.log("[admin/notifications] ✅ Broadcast sent successfully:", {
      notificationId: result.id,
      recipients: playerIds.length,
      heading,
    });

    return new Response(
      JSON.stringify({
        success: true,
        notificationId: result.id,
        recipientCount: playerIds.length,
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

