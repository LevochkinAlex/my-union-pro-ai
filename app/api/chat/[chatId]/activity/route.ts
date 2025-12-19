import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { 
  requireChatAccess, 
  ChatAccessError, 
  markAsRead 
} from "@/lib/chat-service";

/**
 * POST /api/chat/[chatId]/activity - Отметить чат как активный (heartbeat)
 * Вызывается периодически, когда пользователь просматривает чат
 */
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

    // Обновляем время активности через markAsRead
    await markAsRead(chatId, userId);

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("[chat/activity] Error:", error);
    return NextResponse.json(
      { error: "Ошибка при обновлении активности" },
      { status: 500 }
    );
  }
}
