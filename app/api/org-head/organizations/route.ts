import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getOrgHeadScope } from "@/lib/org-head-permissions";

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }

    const scope = await getOrgHeadScope(session.user.id);
    if (!scope) {
      return NextResponse.json({ error: "Нет доступа" }, { status: 403 });
    }

    const organizations = await prisma.organization.findMany({
      where: { id: { in: scope.organizationIds } },
      select: {
        id: true,
        name: true,
        type: true,
        parentId: true,
        inn: true,
        email: true,
        phone: true,
        chairmanName: true,
        chairmanJobTitle: true,
        totalEmployees: true,
        _count: {
          select: {
            members: true,
            reports: true,
            documents: true,
            tickets: true,
          },
        },
      },
      orderBy: [{ type: "asc" }, { name: "asc" }],
    });

    return NextResponse.json({
      organizations: organizations.map((org) => ({
        id: org.id,
        name: org.name,
        type: org.type,
        parentId: org.parentId,
        inn: org.inn,
        email: org.email,
        phone: org.phone,
        chairmanName: org.chairmanName,
        chairmanJobTitle: org.chairmanJobTitle,
        totalEmployees: org.totalEmployees || 0,
        membersCount: org._count.members,
        reportsCount: org._count.reports,
        documentsCount: org._count.documents,
        ticketsCount: org._count.tickets,
      })),
    });
  } catch (error: any) {
    console.error("[org-head/organizations] GET error:", error);
    return NextResponse.json(
      {
        error: "Ошибка получения организаций",
        details: process.env.NODE_ENV === "development" ? error.message : undefined,
      },
      { status: 500 }
    );
  }
}
