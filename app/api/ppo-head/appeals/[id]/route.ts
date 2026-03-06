import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { checkUserPermissions } from "@/lib/staff-permissions";

/**
 * DELETE /api/ppo-head/appeals/[id]
 * Удалить обращение
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } | Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }

    const perm = await checkUserPermissions(session.user.id, "appeals_manage");
    if (!perm.hasAccess || !perm.organizationId) {
      return NextResponse.json(
        { error: "Доступ запрещен или организация не назначена" },
        { status: 403 }
      );
    }

    const resolvedParams = await Promise.resolve(params);
    const ticketId = resolvedParams.id;

    // Получаем обращение
    const ticket = await prisma.ticket.findUnique({
      where: { id: ticketId },
    });

    if (!ticket) {
      return NextResponse.json(
        { error: "Обращение не найдено" },
        { status: 404 }
      );
    }

    if (ticket.organizationId !== perm.organizationId) {
      return NextResponse.json(
        { error: "Доступ запрещен" },
        { status: 403 }
      );
    }

    // Логируем действие перед удалением
    await prisma.ticketActionLog.create({
      data: {
        ticketId,
        userId: session.user.id,
        actionType: "deleted",
        description: "Обращение удалено Председателем",
      },
    });

    // Удаляем обращение (каскадное удаление комментариев и вложений)
    await prisma.ticket.delete({
      where: { id: ticketId },
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("[ppo-head/appeals] DELETE error:", error);
    return NextResponse.json(
      {
        error: "Ошибка при удалении обращения",
        details: process.env.NODE_ENV === "development" ? error.message : undefined,
      },
      { status: 500 }
    );
  }
}

