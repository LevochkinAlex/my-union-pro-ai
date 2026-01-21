import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

/**
 * POST /api/chat/[chatId]/clear
 * Очистить историю чата
 * mode: 'all' - удалить для всех (только для админов)
 * mode: 'me' - скрыть только для меня
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ chatId: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { chatId } = await params;
    const { mode } = await request.json();

    if (!mode || !['all', 'me'].includes(mode)) {
      return NextResponse.json({ error: 'Invalid mode' }, { status: 400 });
    }

    // Проверяем, что чат существует и пользователь имеет доступ
    const chat = await prisma.chat.findFirst({
      where: {
        id: chatId,
        participants: { some: { userId: session.user.id, leftAt: null } },
      },
      select: {
        id: true,
        type: true,
        createdById: true,
        participants: {
          where: { userId: session.user.id, leftAt: null },
          select: { role: true },
        },
      },
    });

    if (!chat) {
      return NextResponse.json({ error: 'Chat not found' }, { status: 404 });
    }

    if (mode === 'all') {
      // Удалить для всех - только для админов
      const isAdmin = chat.createdById === session.user.id ||
        chat.participants.some(p => p.role === 'admin');

      if (!isAdmin) {
        return NextResponse.json(
          { error: 'Only admins can delete messages for everyone' },
          { status: 403 }
        );
      }

      // Удаляем все сообщения из БД
      await prisma.chatMessage.deleteMany({
        where: { chatId },
      });

      // Обновляем чат
      await prisma.chat.update({
        where: { id: chatId },
        data: {
          lastMessageId: null,
          lastMessageAt: null,
        },
      });

      return NextResponse.json({ success: true, mode: 'all' });

    } else {
      // Скрыть только для меня - устанавливаем clearedAt
      await prisma.chatParticipant.updateMany({
        where: {
          chatId,
          userId: session.user.id,
        },
        data: {
          clearedAt: new Date(),
        },
      });

      return NextResponse.json({ success: true, mode: 'me' });
    }

  } catch (error) {
    console.error('[chat/clear] Error:', error);
    return NextResponse.json({ error: 'Failed to clear chat' }, { status: 500 });
  }
}
