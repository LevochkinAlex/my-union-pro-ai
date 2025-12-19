import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

/**
 * POST /api/admin/migrate-chat-participants
 * Миграция существующих PRIVATE чатов для создания ChatParticipant записей
 * 
 * Это позволяет унифицировать проверку доступа для всех типов чатов
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }

    // Проверяем права
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { role: true },
    });

    if (user?.role !== "SUPER_ADMIN") {
      return NextResponse.json({ error: "Доступ запрещен" }, { status: 403 });
    }

    // Находим все PRIVATE чаты без ChatParticipant записей
    const privateChats = await prisma.chat.findMany({
      where: {
        type: "PRIVATE",
        OR: [
          { participant1Id: { not: null } },
          { participant2Id: { not: null } },
        ],
      },
      select: {
        id: true,
        participant1Id: true,
        participant2Id: true,
        participant1ReadAt: true,
        participant2ReadAt: true,
        participants: {
          select: { userId: true },
        },
      },
    });

    console.log(`[migrate-chat-participants] Found ${privateChats.length} PRIVATE chats`);

    let migratedCount = 0;
    let skippedCount = 0;
    const errors: string[] = [];

    for (const chat of privateChats) {
      try {
        const existingParticipantIds = new Set(chat.participants.map((p) => p.userId));
        const participantsToCreate: Array<{
          chatId: string;
          userId: string;
          role: string;
          readAt: Date | null;
        }> = [];

        // Добавляем participant1 если ещё нет
        if (chat.participant1Id && !existingParticipantIds.has(chat.participant1Id)) {
          participantsToCreate.push({
            chatId: chat.id,
            userId: chat.participant1Id,
            role: "member",
            readAt: chat.participant1ReadAt,
          });
        }

        // Добавляем participant2 если ещё нет
        if (chat.participant2Id && !existingParticipantIds.has(chat.participant2Id)) {
          participantsToCreate.push({
            chatId: chat.id,
            userId: chat.participant2Id,
            role: "member",
            readAt: chat.participant2ReadAt,
          });
        }

        if (participantsToCreate.length > 0) {
          await prisma.chatParticipant.createMany({
            data: participantsToCreate,
            skipDuplicates: true,
          });
          migratedCount++;
          console.log(`[migrate-chat-participants] Migrated chat ${chat.id}: +${participantsToCreate.length} participants`);
        } else {
          skippedCount++;
        }
      } catch (error: any) {
        const errorMsg = `Chat ${chat.id}: ${error?.message || "Unknown error"}`;
        errors.push(errorMsg);
        console.error(`[migrate-chat-participants] Error:`, errorMsg);
      }
    }

    console.log(`[migrate-chat-participants] Migration complete: ${migratedCount} migrated, ${skippedCount} skipped, ${errors.length} errors`);

    return NextResponse.json({
      success: true,
      totalChats: privateChats.length,
      migratedCount,
      skippedCount,
      errorsCount: errors.length,
      errors: errors.slice(0, 10), // Первые 10 ошибок
    });
  } catch (error: any) {
    console.error("[migrate-chat-participants] Fatal error:", error);
    return NextResponse.json(
      { error: "Ошибка миграции", details: error?.message },
      { status: 500 }
    );
  }
}

/**
 * GET /api/admin/migrate-chat-participants
 * Проверка статуса миграции
 */
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { role: true },
    });

    if (user?.role !== "SUPER_ADMIN") {
      return NextResponse.json({ error: "Доступ запрещен" }, { status: 403 });
    }

    // Статистика
    const [
      totalPrivateChats,
      privateChatsWithParticipants,
      totalChatParticipants,
      groupChats,
    ] = await Promise.all([
      prisma.chat.count({
        where: { type: "PRIVATE" },
      }),
      prisma.chat.count({
        where: {
          type: "PRIVATE",
          participants: { some: {} },
        },
      }),
      prisma.chatParticipant.count(),
      prisma.chat.count({
        where: { type: "GROUP" },
      }),
    ]);

    const needsMigration = totalPrivateChats - privateChatsWithParticipants;

    return NextResponse.json({
      totalPrivateChats,
      privateChatsWithParticipants,
      totalChatParticipants,
      groupChats,
      needsMigration,
      migrationComplete: needsMigration === 0,
    });
  } catch (error: any) {
    console.error("[migrate-chat-participants] Error getting status:", error);
    return NextResponse.json(
      { error: "Ошибка получения статуса", details: error?.message },
      { status: 500 }
    );
  }
}

