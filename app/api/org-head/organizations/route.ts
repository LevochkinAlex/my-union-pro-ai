import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getOrgHeadScope } from "@/lib/org-head-permissions";
import { OrganizationType } from "@prisma/client";

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }

    const scope = await getOrgHeadScope(session.user.id);
    if (!scope) {
      return NextResponse.json({ error: "Нет доступа" }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const q = searchParams.get("q")?.trim() || "";
    const type = searchParams.get("type") as OrganizationType | "" | null;
    const page = Math.max(1, parseInt(searchParams.get("page") || String(DEFAULT_PAGE), 10));
    const limit = Math.min(MAX_LIMIT, Math.max(1, parseInt(searchParams.get("limit") || String(DEFAULT_LIMIT), 10)));
    const skip = (page - 1) * limit;

    const where: { id: { in: string[] }; type?: OrganizationType; OR?: unknown[] } = {
      id: { in: scope.organizationIds },
    };
    if (type && ["PRIMARY", "LOCAL", "REGIONAL", "FEDERAL"].includes(type)) {
      where.type = type as OrganizationType;
    }
    if (q.length >= 1) {
      where.OR = [
        { name: { contains: q, mode: "insensitive" } },
        { chairmanName: { contains: q, mode: "insensitive" } },
        { email: { contains: q, mode: "insensitive" } },
        ...(q.replace(/\D/g, "").length >= 4 ? [{ inn: { contains: q } }] : []),
      ];
    }

    const [organizations, total] = await Promise.all([
      prisma.organization.findMany({
        where,
        select: {
          id: true,
          name: true,
          type: true,
          parentId: true,
          inn: true,
          email: true,
          phone: true,
          address: true,
          chairmanName: true,
          chairmanJobTitle: true,
          totalEmployees: true,
          isActive: true,
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
        skip,
        take: limit,
      }),
      prisma.organization.count({ where }),
    ]);

    const totalPages = Math.max(1, Math.ceil(total / limit));

    return NextResponse.json({
      organizations: organizations.map((org) => ({
        id: org.id,
        name: org.name,
        type: org.type,
        parentId: org.parentId,
        inn: org.inn,
        email: org.email,
        phone: org.phone,
        address: org.address,
        chairmanName: org.chairmanName,
        chairmanJobTitle: org.chairmanJobTitle,
        totalEmployees: org.totalEmployees ?? 0,
        isActive: org.isActive,
        membersCount: org._count.members,
        reportsCount: org._count.reports,
        documentsCount: org._count.documents,
        ticketsCount: org._count.tickets,
      })),
      total,
      page,
      limit,
      totalPages,
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
