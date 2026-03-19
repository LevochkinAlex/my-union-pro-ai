import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

/**
 * DELETE /api/documents/[id]
 * Удаление документа из «Входящих» (документ назначен мне) или «Исходящих» (документ создан мной).
 * Для всех пользователей.
 */
export async function DELETE(
  _request: NextRequest,
  context: { params: { id: string } | Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }

    const { id } = await context.params;
    if (!id) {
      return NextResponse.json({ error: "Не указан идентификатор документа" }, { status: 400 });
    }

    const doc = await prisma.document.findUnique({
      where: { id },
      select: { id: true, userId: true, assignedToId: true },
    });

    if (!doc) {
      return NextResponse.json({ error: "Документ не найден" }, { status: 404 });
    }

    const canDeleteIncoming = doc.assignedToId === session.user.id;
    const canDeleteOutgoing = doc.userId === session.user.id;
    if (!canDeleteIncoming && !canDeleteOutgoing) {
      return NextResponse.json(
        { error: "Нельзя удалить этот документ" },
        { status: 403 }
      );
    }

    await prisma.document.delete({ where: { id } });

    return NextResponse.json({
      success: true,
      message: "Документ удалён",
    });
  } catch (error) {
    console.error("[documents/[id]] DELETE error:", error);
    return NextResponse.json(
      { error: "Ошибка при удалении документа" },
      { status: 500 }
    );
  }
}
