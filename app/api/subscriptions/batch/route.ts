import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { DEMO_USER_ID, DEMO_MEMBER_USER_ID } from "@/lib/demo-constants";
import { prisma } from "@/lib/prisma";

const DEMO_IDS = [DEMO_USER_ID, DEMO_MEMBER_USER_ID, "demo-u1", "demo-u2", "demo-u3", "demo-u4", "demo-u5"];

// POST - пакетная проверка статуса подписок
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }

    const body = await request.json();
    const { userIds } = body;

    if (!Array.isArray(userIds) || userIds.length === 0) {
      return NextResponse.json({ error: "userIds должен быть непустым массивом" }, { status: 400 });
    }

    // Ограничиваем максимальное количество ID в запросе
    const limitedIds = userIds.slice(0, 50);

    // Для демо-пользователей возвращаем все false
    if (DEMO_IDS.includes(session.user.id)) {
      const result: Record<string, boolean> = {};
      for (const id of limitedIds) {
        result[id] = false;
      }
      return NextResponse.json({ subscriptions: result });
    }

    // Фильтруем демо-ID из запроса
    const realIds = limitedIds.filter((id: string) => !DEMO_IDS.includes(id));
    const demoIds = limitedIds.filter((id: string) => DEMO_IDS.includes(id));

    // Запрашиваем все подписки одним запросом
    const subscriptions = realIds.length > 0
      ? await prisma.userSubscription.findMany({
          where: {
            subscriberId: session.user.id,
            targetUserId: { in: realIds },
          },
          select: {
            targetUserId: true,
          },
        })
      : [];

    const subscribedSet = new Set(subscriptions.map((s) => s.targetUserId));

    // Формируем результат
    const result: Record<string, boolean> = {};
    for (const id of realIds) {
      result[id] = subscribedSet.has(id);
    }
    for (const id of demoIds) {
      result[id] = false;
    }

    return NextResponse.json({ subscriptions: result });
  } catch (error: any) {
    console.error("[subscriptions/batch] Error:", error?.message);
    return NextResponse.json(
      { error: "Внутренняя ошибка сервера" },
      { status: 500 }
    );
  }
}
