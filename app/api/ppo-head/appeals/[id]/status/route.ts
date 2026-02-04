import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getPPOHead } from "@/lib/ppo-head-utils";
import { checkUserPermissions } from "@/lib/staff-permissions";

const ALLOWED_STATUSES = ["PENDING", "IN_PROGRESS", "RESOLVED"] as const;

/**
 * PATCH /api/ppo-head/appeals/[id]/status
 * Смена статуса обращения председателем или сотрудником с правом appeals_view
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }

    const { id } = await params;
    const body = await request.json();
    const status = body?.status;

    if (!status || !ALLOWED_STATUSES.includes(status)) {
      return NextResponse.json(
        { error: "Укажите статус: PENDING, IN_PROGRESS или RESOLVED" },
        { status: 400 }
      );
    }

    const publicIdNormalized = typeof id === "string" ? id.replace(/-/g, "") : id;
    const ticket = await prisma.ticket.findFirst({
      where: { OR: [{ publicId: publicIdNormalized }, { id }] },
      select: {
        id: true,
        publicId: true,
        status: true,
        organizationId: true,
      },
    });

    if (!ticket) {
      return NextResponse.json({ error: "Обращение не найдено" }, { status: 404 });
    }

    const chairman = await getPPOHead(session.user.id);
    const perm = await checkUserPermissions(session.user.id);
    const isChairman = chairman && ticket.organizationId === chairman.organizationId;
    const isStaffWithAppeals =
      perm.isStaff && perm.permissions?.appeals_view && perm.organizationId === ticket.organizationId;

    if (!isChairman && !isStaffWithAppeals) {
      return NextResponse.json(
        { error: "Только председатель или сотрудник с правом обращений может менять статус" },
        { status: 403 }
      );
    }

    if (ticket.status === "CLOSED" || ticket.status === "REJECTED") {
      return NextResponse.json(
        { error: "Нельзя изменить статус закрытого или отклонённого обращения" },
        { status: 400 }
      );
    }

    const updated = await prisma.ticket.update({
      where: { id: ticket.id },
      data: {
        status,
        ...(status === "RESOLVED"
          ? { resolved: true, resolvedAt: new Date() }
          : {}),
      },
    });

    return NextResponse.json({
      success: true,
      ticket: {
        id: updated.id,
        publicId: updated.publicId,
        status: updated.status,
      },
    });
  } catch (error: any) {
    console.error("[ppo-head/appeals/status] Error:", error);
    return NextResponse.json(
      { error: "Ошибка смены статуса", details: error?.message },
      { status: 500 }
    );
  }
}
