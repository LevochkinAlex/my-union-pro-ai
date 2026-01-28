import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { invalidateChatCache } from "@/lib/cache-invalidation";
import { 
  requireChatAccess, 
  ChatAccessError, 
  markAsRead 
} from "@/lib/chat-service";

// POST /api/chat/[chatId]/read - пометить все сообщения в чате как прочитанные
export async function POST(
  request: NextRequest,
  { params }: { params: { chatId: string } | Promise<{ chatId: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }

    const resolvedParams = await Promise.resolve(params);
    const chatId = resolvedParams.chatId;
    const userId = session.user.id;

    // Проверяем доступ через сервис
    try {
      await requireChatAccess(chatId, userId);
    } catch (error) {
      if (error instanceof ChatAccessError) {
        return NextResponse.json({ error: error.message }, { status: 403 });
      }
      throw error;
    }

    // Используем сервис для пометки как прочитанное
    await markAsRead(chatId, userId);

    // КРИТИЧЕСКОЕ ИСПРАВЛЕНИЕ: Инвалидируем кэш чатов пользователя для обновления unreadCount
    await invalidateChatCache(userId).catch(err =>
      console.warn('[chat/read] Cache invalidation error:', err)
    );

    // КРИТИЧЕСКОЕ ИСПРАВЛЕНИЕ: Пересчитываем unreadCount для этого чата
    const { getUnreadCount } = await import('@/lib/chat-service');
    const newUnreadCount = await getUnreadCount(chatId, userId);
    
    console.log(`[chat/read] ✅ Marked as read: chatId=${chatId}, userId=${userId}, newUnreadCount=${newUnreadCount}`);

    return NextResponse.json({ 
      success: true, 
      readAt: new Date(),
      unreadCount: newUnreadCount, // Возвращаем новый счетчик для обновления UI
    });
  } catch (error) {
    console.error("[chat/read] Error:", error);
    return NextResponse.json(
      { error: "Ошибка при пометке сообщений как прочитанных" },
      { status: 500 }
    );
  }
}
