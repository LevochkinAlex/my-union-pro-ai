import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { formatAppealId } from "@/lib/appeal-id";

/**
 * GET /api/tickets/[id] - Получить тикет по ID
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json(
        { error: "Не авторизован" },
        { status: 401 }
      );
    }

    const { id } = await params;

    const ticket = await prisma.ticket.findUnique({
      where: { id },
      include: {
        attachments: {
          select: {
            id: true,
            fileName: true,
            filePath: true,
            fileSize: true,
            mimeType: true,
          },
        },
      },
    });

    if (!ticket) {
      return NextResponse.json(
        { error: "Тикет не найден" },
        { status: 404 }
      );
    }

    // Проверяем, что тикет принадлежит пользователю
    if (ticket.userId !== session.user.id) {
      return NextResponse.json(
        { error: "Доступ запрещен" },
        { status: 403 }
      );
    }

    return NextResponse.json({
      success: true,
      ticket: {
        id: ticket.id,
        publicId: formatAppealId(ticket.publicId),
        type: ticket.type,
        status: ticket.status,
        priority: ticket.priority,
        title: ticket.title,
        content: ticket.content,
        createdAt: ticket.createdAt,
        updatedAt: ticket.updatedAt,
        attachments: ticket.attachments,
      },
    });
  } catch (error) {
    console.error("[tickets] Error retrieving ticket:", error);
    return NextResponse.json(
      { error: "Ошибка при загрузке тикета" },
      { status: 500 }
    );
  }
}

