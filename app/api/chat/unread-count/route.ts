import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import * as Sentry from "@sentry/nextjs";

type UnreadCountRow = { totalUnread: number | bigint | null };

/**
 * GET /api/chat/unread-count
 * Лёгкий endpoint: возвращает только общий счётчик непрочитанных.
 * Используется в сайдбаре вместо /api/chat/rooms.
 */
export async function GET() {
  let userId: string | null = null;
  try {
    const session = await getServerSession(authOptions);
    userId = session?.user?.id ?? null;

    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const rows = await prisma.$queryRaw<UnreadCountRow[]>`
      SELECT COALESCE(SUM(t.unread), 0)::int AS "totalUnread"
      FROM (
        SELECT cp."chatId", COUNT(cm.id)::int AS unread
        FROM "ChatParticipant" cp
        INNER JOIN "Chat" c ON c.id = cp."chatId"
        LEFT JOIN "NewsChannel" nc ON nc.id = c."newsChannelId"
        INNER JOIN "ChatMessage" cm ON cm."chatId" = cp."chatId"
        WHERE cp."userId" = ${userId}
          AND cp."leftAt" IS NULL
          AND cm."senderId" <> ${userId}
          AND (cp."readAt" IS NULL OR cm."createdAt" > cp."readAt")
          AND COALESCE(c.name, '') NOT ILIKE '%ИИ-Ассистент%'
          AND COALESCE(c.name, '') NOT ILIKE '%Техподдержка%'
          AND COALESCE(nc.name, '') NOT ILIKE '%ИИ-Ассистент%'
          AND COALESCE(nc.name, '') NOT ILIKE '%Техподдержка%'
          AND NOT (
            c.type = 'PRIVATE'
            AND EXISTS (
              SELECT 1
              FROM "ChatParticipant" cp2
              INNER JOIN "User" u2 ON u2.id = cp2."userId"
              WHERE cp2."chatId" = cp."chatId"
                AND cp2."leftAt" IS NULL
                AND cp2."userId" <> ${userId}
                AND u2."firstName" = 'AI'
                AND u2."lastName" = 'Помощник'
            )
          )
        GROUP BY cp."chatId"
      ) t
    `;

    const rawValue = rows?.[0]?.totalUnread ?? 0;
    const totalUnread = typeof rawValue === "bigint" ? Number(rawValue) : Number(rawValue || 0);

    return NextResponse.json({ totalUnread: Number.isFinite(totalUnread) ? totalUnread : 0 });
  } catch (error: any) {
    console.error("[chat/unread-count] Error:", error);
    Sentry.captureException(error, {
      tags: { endpoint: "GET /api/chat/unread-count" },
      extra: { userId },
    });

    // Возвращаем 200 и ноль, чтобы UI не зависал и не спамил retry.
    return NextResponse.json({
      totalUnread: 0,
      error: "Ошибка при загрузке счётчика непрочитанных",
      details: process.env.NODE_ENV === "development" ? (error?.message || "") : undefined,
    });
  }
}
