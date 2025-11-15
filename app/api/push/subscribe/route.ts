import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

/**
 * Save or update push subscription for current user
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

    const { oneSignalId, subscriptionId } = await request.json();

    if (!oneSignalId) {
      return NextResponse.json(
        { error: "OneSignal ID is required" },
        { status: 400 }
      );
    }

    // Check if subscription already exists
    const existing = await prisma.pushSubscription.findFirst({
      where: {
        userId: session.user.id,
        oneSignalId: oneSignalId,
      },
    });

    let subscription;

    if (existing) {
      // Update existing subscription
      subscription = await prisma.pushSubscription.update({
        where: { id: existing.id },
        data: {
          subscriptionId: subscriptionId,
          lastSyncAt: new Date(),
        },
      });
    } else {
      // Create new subscription
      subscription = await prisma.pushSubscription.create({
        data: {
          userId: session.user.id,
          oneSignalId,
          subscriptionId: subscriptionId,
          lastSyncAt: new Date(),
        },
      });
    }

    console.log("[push/subscribe] ✅ Subscription saved:", {
      userId: session.user.id,
      oneSignalId,
      subscriptionId: subscription.id,
      existing: !!existing,
    });

    return NextResponse.json({
      success: true,
      subscription: {
        id: subscription.id,
        oneSignalId: subscription.oneSignalId,
        subscriptionId: subscription.subscriptionId,
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

