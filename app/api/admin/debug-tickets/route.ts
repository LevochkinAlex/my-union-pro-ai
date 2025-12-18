import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

/**
 * GET /api/admin/debug-tickets
 * Debug API для проверки обращений в базе данных
 */
export async function GET() {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }

    // Получаем информацию о пользователе
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: {
        id: true,
        email: true,
        role: true,
        isPPOHead: true,
        organizationId: true,
        ppoHeadOrganizationId: true,
      },
    });

    // Получаем все тикеты
    const allTickets = await prisma.ticket.findMany({
      select: {
        id: true,
        publicId: true,
        title: true,
        status: true,
        organizationId: true,
        userId: true,
        createdAt: true,
        organization: {
          select: {
            id: true,
            name: true,
          },
        },
        user: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
      take: 50,
    });

    // Если пользователь - председатель, показываем тикеты его организации
    const ppoOrgId = user?.ppoHeadOrganizationId || user?.organizationId;
    const ppoHeadTickets = ppoOrgId
      ? allTickets.filter((t) => t.organizationId === ppoOrgId)
      : [];

    return NextResponse.json({
      success: true,
      currentUser: user,
      stats: {
        totalTickets: allTickets.length,
        ticketsForPPOHead: ppoHeadTickets.length,
        ppoOrganizationId: ppoOrgId,
      },
      allTickets: allTickets.map((t) => ({
        id: t.id,
        publicId: t.publicId,
        title: t.title,
        status: t.status,
        organizationId: t.organizationId,
        organizationName: t.organization?.name || "Без организации",
        userId: t.userId,
        userEmail: t.user?.email,
        userName: [t.user?.lastName, t.user?.firstName].filter(Boolean).join(" "),
        createdAt: t.createdAt,
      })),
      ppoHeadTickets: ppoHeadTickets.map((t) => ({
        id: t.id,
        publicId: t.publicId,
        title: t.title,
        status: t.status,
      })),
    });
  } catch (error: any) {
    console.error("[debug-tickets] error:", error);
    return NextResponse.json(
      { error: "Ошибка при получении данных", details: error.message },
      { status: 500 }
    );
  }
}

