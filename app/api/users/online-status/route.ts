import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { isDemoUserId } from '@/lib/demo';

/**
 * POST /api/users/online-status
 * Обновить статус онлайн пользователя
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Не авторизован' }, { status: 401 });
    }

    // Демо: не обновляем БД для демо-пользователей
    if (isDemoUserId(session.user.id)) {
      return NextResponse.json({ success: true });
    }

    // Обновляем время последней активности
    await prisma.user.update({
      where: { id: session.user.id },
      data: {
        updatedAt: new Date(), // Используем updatedAt как индикатор активности
      },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[online-status] Error:', error);
    return NextResponse.json({ error: 'Ошибка обновления статуса' }, { status: 500 });
  }
}

/**
 * GET /api/users/online-status?userIds=id1,id2,id3
 * Получить онлайн статус пользователей
 */
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Не авторизован' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const userIdsParam = searchParams.get('userIds');
    
    if (!userIdsParam) {
      return NextResponse.json({ statuses: {} });
    }

    const userIds = userIdsParam.split(',').filter(Boolean);
    if (userIds.length === 0) {
      return NextResponse.json({ statuses: {} });
    }

    // Получаем пользователей и проверяем их updatedAt
    const users = await prisma.user.findMany({
      where: {
        id: { in: userIds },
      },
      select: {
        id: true,
        updatedAt: true,
      },
    });

    const now = new Date();
    const ONLINE_THRESHOLD = 3 * 60 * 1000; // 3 минуты (более строгий порог)

    const statuses: Record<string, boolean> = {};
    const lastSeenAt: Record<string, string | null> = {};
    
    for (const user of users) {
      if (!user.updatedAt) {
        statuses[user.id] = false;
        lastSeenAt[user.id] = null;
        continue;
      }
      
      const timeSinceUpdate = now.getTime() - new Date(user.updatedAt).getTime();
      // Онлайн если активность была менее 3 минут назад
      statuses[user.id] = timeSinceUpdate >= 0 && timeSinceUpdate < ONLINE_THRESHOLD;
      lastSeenAt[user.id] = user.updatedAt.toISOString();
    }
    
    // Добавляем статусы для пользователей, которых не нашли (offline)
    for (const userId of userIds) {
      if (!statuses[userId]) {
        statuses[userId] = false;
      }
      if (!lastSeenAt[userId]) {
        lastSeenAt[userId] = null;
      }
    }

    return NextResponse.json({ statuses, lastSeenAt });
  } catch (error) {
    console.error('[online-status] GET Error:', error);
    return NextResponse.json({ error: 'Ошибка получения статусов' }, { status: 500 });
  }
}
