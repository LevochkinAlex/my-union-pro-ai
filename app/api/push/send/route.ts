import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const ONESIGNAL_API_KEY = process.env.ONESIGNAL_API_KEY;
const ONESIGNAL_APP_ID = process.env.NEXT_PUBLIC_ONESIGNAL_APP_ID;
const ONESIGNAL_API_URL = "https://onesignal.com/api/v1/notifications";

interface PushPayload {
  userId?: string;
  oneSignalIds?: string[];
  title: string;
  message: string;
  icon?: string;
  data?: Record<string, any>;
}

/**
 * Send push notification to users via OneSignal
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    // Only admins can send push notifications
    if (session?.user?.role !== "SUPER_ADMIN" && session?.user?.role !== "ADMIN") {
      // Allow internal calls from chat API
      const internalToken = request.headers.get("X-Internal-Token");
      if (internalToken !== process.env.INTERNAL_API_TOKEN) {
        return NextResponse.json(
          { error: "Unauthorized" },
          { status: 401 }
        );
      }
    }

    if (!ONESIGNAL_API_KEY || !ONESIGNAL_APP_ID) {
      return NextResponse.json(
        { error: "OneSignal not configured" },
        { status: 503 }
      );
    }

    const payload: PushPayload = await request.json();

    if (!payload.title || !payload.message) {
      return NextResponse.json(
        { error: "Title and message are required" },
        { status: 400 }
      );
    }

    // Determine recipients
    let recipientIds: string[] = [];

    if (payload.userId) {
      // Get OneSignal IDs for specific user
      const userSubs = await prisma.pushSubscription.findMany({
        where: { userId: payload.userId },
        select: { oneSignalId: true },
      });
      recipientIds = userSubs.map((sub) => sub.oneSignalId);
    } else if (payload.oneSignalIds && payload.oneSignalIds.length > 0) {
      recipientIds = payload.oneSignalIds;
    } else {
      return NextResponse.json(
        { error: "Either userId or oneSignalIds must be provided" },
        { status: 400 }
      );
    }

    if (recipientIds.length === 0) {
      console.warn("[push/send] No recipients found");
      return NextResponse.json({
        success: true,
        message: "No active subscriptions for user",
        notificationId: null,
      });
    }

    // Send via OneSignal API
    const notificationPayload = {
      app_id: ONESIGNAL_APP_ID,
      include_external_user_ids: recipientIds,
      headings: { en: payload.title },
      contents: { en: payload.message },
      ...(payload.icon && { big_picture: payload.icon }),
      ...(payload.data && { data: payload.data }),
      priority: 10, // High priority
      ttl: 86400, // 24 hours
    };

    const response = await fetch(ONESIGNAL_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        Authorization: `Basic ${ONESIGNAL_API_KEY}`,
      },
      body: JSON.stringify(notificationPayload),
    });

    if (!response.ok) {
      const error = await response.text();
      console.error("[push/send] OneSignal error:", error);
      return NextResponse.json(
        { error: "Failed to send push notification" },
        { status: 500 }
      );
    }

    const result = await response.json();

    console.log("[push/send] Notification sent:", {
      id: result.id,
      recipients: recipientIds.length,
    });

    return NextResponse.json({
      success: true,
      notificationId: result.id,
      recipientCount: recipientIds.length,
    });
  } catch (error) {
    console.error("[push/send] Error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

