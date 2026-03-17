import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isDemoUserId } from "@/lib/demo";

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

    // Демо-пользователи: не пишем в БД (нет записи User), сразу успех
    if (isDemoUserId(session.user.id)) {
      return NextResponse.json({
        success: true,
        subscription: { id: "demo", fcmToken: "...", lastSyncAt: new Date().toISOString() },
      });
    }

    const { fcmToken, subscriptionId } = await request.json();

    if (!fcmToken) {
      return NextResponse.json(
        { error: "FCM token is required" },
        { status: 400 }
      );
    }

    // Check if subscription already exists (by fcmToken or userId)
    // First try to find by fcmToken (if it's not null)
    let existing = null;
    if (fcmToken) {
      try {
        existing = await prisma.pushSubscription.findFirst({
          where: {
            fcmToken: fcmToken,
          },
        });
      } catch (error) {
        // If findUnique fails (e.g., fcmToken is null in DB), try findFirst
        console.warn("[push/subscribe] findUnique failed, trying findFirst:", error);
      }
    }

    // If not found by fcmToken, check if user already has a subscription
    if (!existing) {
      existing = await prisma.pushSubscription.findFirst({
        where: {
          userId: session.user.id,
        },
      });
    }

    let subscription;

    if (existing) {
      // Update existing subscription
      subscription = await prisma.pushSubscription.update({
        where: { id: existing.id },
        data: {
          userId: session.user.id,
          fcmToken: fcmToken, // Update token
          subscriptionId: subscriptionId || fcmToken,
          lastSyncAt: new Date(),
        },
      });
      // Оставляем только одну подписку на пользователя — убираем дубли (другая вкладка/браузер), чтобы не приходило два одинаковых пуша
      await prisma.pushSubscription.deleteMany({
        where: {
          userId: session.user.id,
          id: { not: subscription.id },
        },
      });
    } else {
      // Create new subscription
      try {
        subscription = await prisma.pushSubscription.create({
          data: {
            userId: session.user.id,
            fcmToken,
            subscriptionId: subscriptionId || fcmToken,
            lastSyncAt: new Date(),
          },
        });
      } catch (createError: any) {
        // If creation fails due to unique constraint, try to update existing
        if (createError?.code === 'P2002' && fcmToken) {
          console.log("[push/subscribe] Unique constraint violation, trying to find and update...");
          const existingByToken = await prisma.pushSubscription.findFirst({
            where: {
              fcmToken: fcmToken,
            },
          });
          
          if (existingByToken) {
            subscription = await prisma.pushSubscription.update({
              where: { id: existingByToken.id },
              data: {
                userId: session.user.id,
                subscriptionId: subscriptionId || fcmToken,
                lastSyncAt: new Date(),
              },
            });
          } else {
            throw createError;
          }
        } else {
          throw createError;
        }
      }
      // Оставляем только одну подписку на пользователя
      await prisma.pushSubscription.deleteMany({
        where: {
          userId: session.user.id,
          id: { not: subscription.id },
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
  } catch (error: any) {
    console.error("[push/subscribe] Error:", error);
    console.error("[push/subscribe] Error details:", {
      message: error?.message,
      code: error?.code,
      meta: error?.meta,
      stack: error?.stack,
    });
    return NextResponse.json(
      { error: "Internal server error", details: error?.message || String(error) },
      { status: 500 }
    );
  }
}
