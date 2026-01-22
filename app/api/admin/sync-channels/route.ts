import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { syncChannelWithChat } from "@/lib/channel-sync";

/**
 * POST /api/admin/sync-channels
 * Синхронизирует все NewsChannel с Chat записями
 * Создает Chat для каналов, у которых его еще нет
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }

    // Проверяем права доступа (только SUPER_ADMIN)
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { role: true },
    });

    if (user?.role !== "SUPER_ADMIN") {
      return NextResponse.json({ error: "Доступ запрещен" }, { status: 403 });
    }

    // Получаем все NewsChannel без связанного Chat
    const channelsWithoutChat = await prisma.newsChannel.findMany({
      where: {
        chat: null,
      },
      include: {
        organization: {
          select: {
            id: true,
            ppoChairman: {
              select: { id: true },
            },
            mpoChairman: {
              select: { id: true },
            },
            rpoChairman: {
              select: { id: true },
            },
          },
        },
      },
    });

    const results = [];
    let successCount = 0;
    let errorCount = 0;

    for (const channel of channelsWithoutChat) {
      if (!channel.organizationId) {
        console.warn(`[sync-channels] Channel ${channel.id} has no organizationId`);
        errorCount++;
        continue;
      }

      try {
        const chatId = await syncChannelWithChat(channel.id, channel.organizationId);
        if (chatId) {
          successCount++;
          results.push({
            channelId: channel.id,
            channelName: channel.name,
            chatId,
            status: "success",
          });
        } else {
          errorCount++;
          results.push({
            channelId: channel.id,
            channelName: channel.name,
            status: "error",
            error: "Failed to create chat",
          });
        }
      } catch (error: any) {
        errorCount++;
        results.push({
          channelId: channel.id,
          channelName: channel.name,
          status: "error",
          error: error.message,
        });
        console.error(`[sync-channels] Error syncing channel ${channel.id}:`, error);
      }
    }

    return NextResponse.json({
      success: true,
      message: `Синхронизировано ${successCount} каналов, ошибок: ${errorCount}`,
      total: channelsWithoutChat.length,
      successCount,
      errorCount,
      results,
    });
  } catch (error: any) {
    console.error("[admin/sync-channels] POST error:", error);
    return NextResponse.json(
      {
        error: "Ошибка при синхронизации каналов",
        details: process.env.NODE_ENV === "development" ? error.message : undefined,
      },
      { status: 500 }
    );
  }
}
