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

    const { searchParams } = new URL(request.url);
    const fullSync =
      searchParams.get("full") === "1" ||
      searchParams.get("full") === "true" ||
      searchParams.get("mode") === "full";

    // Обычный режим: только каналы без chat.
    // fullSync: все каналы (для досинхронизации участников уже существующих каналов).
    const channels = await prisma.newsChannel.findMany({
      where: fullSync
        ? undefined
        : {
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

    for (const channel of channels) {
      if (!channel.organizationId) {
        // Глобальные каналы (например, "Региональные новости") тоже синхронизируем.
        // Для них organizationId = null и логика в syncChannelWithChat это поддерживает.
      }

      try {
        const chatId = await syncChannelWithChat(channel.id, channel.organizationId ?? null);
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
      mode: fullSync ? "full" : "missing_chat_only",
      message: `Синхронизировано ${successCount} каналов, ошибок: ${errorCount}`,
      total: channels.length,
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
