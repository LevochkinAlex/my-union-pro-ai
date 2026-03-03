import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getOrgHeadScope } from "@/lib/org-head-permissions";

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
    const status = searchParams.get("status"); // pending | approved
    const q = searchParams.get("q")?.trim() || "";
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") || "50", 10)));
    const skip = Math.max(0, parseInt(searchParams.get("skip") || "0", 10));

    const where: any = {
      organizationId: { in: scope.organizationIds },
    };

    if (status === "pending") {
      // Только те, кто ещё не принят на учёт: не одобренные и не принятые на уровне союза.
      // Исключаем APPROVED и unionMembershipStatus === "ACCEPTED", чтобы уже валидированные не попадали в список.
      where.membershipStatus = {
        in: ["DOCUMENTS_PENDING", "PROFILE_INCOMPLETE"],
      };
      where.unionMembershipStatus = { not: "ACCEPTED" };
    } else if (status === "approved") {
      where.membershipStatus = "APPROVED";
    }

    if (q.length >= 1) {
      where.OR = [
        { lastName: { contains: q, mode: "insensitive" } },
        { firstName: { contains: q, mode: "insensitive" } },
        { middleName: { contains: q, mode: "insensitive" } },
        { email: { contains: q, mode: "insensitive" } },
        { phone: { contains: q } },
        { jobTitle: { contains: q, mode: "insensitive" } },
      ];
    }

    const [members, total] = await Promise.all([
      prisma.user.findMany({
        where,
        select: {
          id: true,
          firstName: true,
          lastName: true,
          middleName: true,
          jobTitle: true,
          email: true,
          phone: true,
          avatarUrl: true,
          membershipStatus: true,
          unionMembershipStatus: true,
          createdAt: true,
          organizationId: true,
          organization: {
            select: {
              id: true,
              name: true,
              type: true,
            },
          },
          documents: {
            where: {
              type: {
                in: ["MEMBERSHIP_APPLICATION", "CONTRIBUTION_APPLICATION"],
              },
            },
            select: {
              id: true,
              type: true,
              status: true,
              filePath: true,
            },
          },
        },
        orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
        take: limit,
        skip,
      }),
      prisma.user.count({ where }),
    ]);

    return NextResponse.json({ members, total, scopeLevel: scope.level });
  } catch (error: any) {
    console.error("[org-head/members] GET error:", error);
    return NextResponse.json(
      {
        error: "Ошибка при получении пользователей",
        details: process.env.NODE_ENV === "development" ? error.message : undefined,
      },
      { status: 500 }
    );
  }
}
