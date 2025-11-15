import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

/**
 * Save or update push subscription for current user (Firebase Cloud Messaging)
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json(
        { error: "Не авторизован" },
        { status: 401 }
      );
    }

    const { fcmToken, subscriptionId } = await request.json();

    if (!fcmToken) {
      return NextResponse.json(
        { error: "FCM token is required" },
        { status: 400 }
      );
    }

    // Check if subscription already exists (by fcmToken)
    const existing = await prisma.pushSubscription.findUnique({
      where: {
        fcmToken: fcmToken,
      },
    });

    let subscription;

    if (existing) {
      // Update existing subscription (if user changed)
      if (existing.userId !== session.user.id) {
        subscription = await prisma.pushSubscription.update({
          where: { id: existing.id },
          data: {
            userId: session.user.id,
            subscriptionId: subscriptionId || fcmToken,
            lastSyncAt: new Date(),
          },
        });
      } else {
        // Just update sync time
        subscription = await prisma.pushSubscription.update({
          where: { id: existing.id },
          data: {
            lastSyncAt: new Date(),
          },
        });
      }
    } else {
      // Create new subscription
      subscription = await prisma.pushSubscription.create({
        data: {
          userId: session.user.id,
          fcmToken,
          subscriptionId: subscriptionId || fcmToken,
          lastSyncAt: new Date(),
        },
      });
    }

    console.log("[push/subscribe] ✅ Subscription saved:", {
      userId: session.user.id,
      fcmToken: fcmToken.substring(0, 20) + "...",
      subscriptionId: subscription.id,
      existing: !!existing,
    });

    return NextResponse.json({
      success: true,
      subscription: {
        id: subscription.id,
        fcmToken: subscription.fcmToken.substring(0, 20) + "...",
        lastSyncAt: subscription.lastSyncAt,
      },
    });
  } catch (error) {
    console.error("[push/subscribe] Error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
