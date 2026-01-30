import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { DEMO_USER_ID, DEMO_MEMBER_USER_ID } from "@/lib/demo-constants";
import { prisma } from "@/lib/prisma";

const DEMO_IDS = [DEMO_USER_ID, DEMO_MEMBER_USER_ID, "demo-u1", "demo-u2", "demo-u3", "demo-u4", "demo-u5"];

// GET - проверка статуса подписки
export async function GET(
  request: NextRequest,
  { params }: { params: { userId: string } | Promise<{ userId: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }

    const resolvedParams = await Promise.resolve(params);
    const targetUserId = resolvedParams.userId;

    if (!targetUserId) {
      return NextResponse.json({ error: "ID пользователя не указан" }, { status: 400 });
    }

    // Проверяем, не пытается ли пользователь подписаться на себя
    if (session.user.id === targetUserId) {
      return NextResponse.json({ error: "Нельзя подписаться на себя" }, { status: 400 });
    }

    // Демо: текущий пользователь или целевой — демо, не обращаемся к БД
    if (DEMO_IDS.includes(session.user.id) || DEMO_IDS.includes(targetUserId)) {
      return NextResponse.json({ isSubscribed: false, subscription: null });
    }

    // Проверяем существование целевого пользователя
    const targetUser = await prisma.user.findUnique({
      where: { id: targetUserId },
      select: { id: true },
    });

    if (!targetUser) {
      return NextResponse.json({ error: "Пользователь не найден" }, { status: 404 });
    }

    // Проверяем подписку
    const subscription = await prisma.userSubscription.findUnique({
      where: {
        subscriberId_targetUserId: {
          subscriberId: session.user.id,
          targetUserId: targetUserId,
        },
      },
    });

    return NextResponse.json({
      isSubscribed: !!subscription,
      subscription: subscription || null,
    });
  } catch (error: any) {
    console.error("[subscriptions] GET Error:", {
      message: error?.message,
      code: error?.code,
      meta: error?.meta,
      stack: error?.stack,
    });
    return NextResponse.json(
      {
        error: "Внутренняя ошибка сервера",
        details: process.env.NODE_ENV === "development" ? error?.message : undefined,
      },
      { status: 500 }
    );
  }
}

// POST - подписаться на пользователя
export async function POST(
  request: NextRequest,
  { params }: { params: { userId: string } | Promise<{ userId: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }

    const resolvedParams = await Promise.resolve(params);
    const targetUserId = resolvedParams.userId;

    if (!targetUserId) {
      return NextResponse.json({ error: "ID пользователя не указан" }, { status: 400 });
    }

    // Проверяем, не пытается ли пользователь подписаться на себя
    if (session.user.id === targetUserId) {
      return NextResponse.json({ error: "Нельзя подписаться на себя" }, { status: 400 });
    }

    // Демо: не пишем в БД
    if (DEMO_IDS.includes(session.user.id) || DEMO_IDS.includes(targetUserId)) {
      return NextResponse.json({ success: true, subscription: null });
    }

    // Проверяем существование целевого пользователя
    const targetUser = await prisma.user.findUnique({
      where: { id: targetUserId },
      select: { id: true },
    });

    if (!targetUser) {
      return NextResponse.json({ error: "Пользователь не найден" }, { status: 404 });
    }

    // Создаем или обновляем подписку
    const subscription = await prisma.userSubscription.upsert({
      where: {
        subscriberId_targetUserId: {
          subscriberId: session.user.id,
          targetUserId: targetUserId,
        },
      },
      create: {
        subscriberId: session.user.id,
        targetUserId: targetUserId,
        emailNotifications: true,
        pushNotifications: true,
      },
      update: {
        emailNotifications: true,
        pushNotifications: true,
      },
    });

    return NextResponse.json({
      success: true,
      subscription,
    });
  } catch (error: any) {
    console.error("[subscriptions] POST Error:", {
      message: error?.message,
      code: error?.code,
      meta: error?.meta,
      stack: error?.stack,
    });
    return NextResponse.json(
      {
        error: "Внутренняя ошибка сервера",
        details: process.env.NODE_ENV === "development" ? error?.message : undefined,
      },
      { status: 500 }
    );
  }
}

// DELETE - отписаться от пользователя
export async function DELETE(
  request: NextRequest,
  { params }: { params: { userId: string } | Promise<{ userId: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }

    const resolvedParams = await Promise.resolve(params);
    const targetUserId = resolvedParams.userId;

    if (!targetUserId) {
      return NextResponse.json({ error: "ID пользователя не указан" }, { status: 400 });
    }

    // Демо: не пишем в БД
    if (DEMO_IDS.includes(session.user.id) || DEMO_IDS.includes(targetUserId)) {
      return NextResponse.json({ success: true });
    }

    // Удаляем подписку
    await prisma.userSubscription.deleteMany({
      where: {
        subscriberId: session.user.id,
        targetUserId: targetUserId,
      },
    });

    return NextResponse.json({
      success: true,
    });
  } catch (error: any) {
    console.error("[subscriptions] DELETE Error:", {
      message: error?.message,
      code: error?.code,
      meta: error?.meta,
      stack: error?.stack,
    });
    return NextResponse.json(
      {
        error: "Внутренняя ошибка сервера",
        details: process.env.NODE_ENV === "development" ? error?.message : undefined,
      },
      { status: 500 }
    );
  }
}

