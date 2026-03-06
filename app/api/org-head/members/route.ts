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
    const status = searchParams.get("status"); // pending | approved | all
    const q = searchParams.get("q")?.trim() || "";
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") || "20", 10)));
    const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
    const skip = (page - 1) * limit;

    const where: any = {
      organizationId: { in: scope.organizationIds },
    };

    if (status === "pending") {
      where.membershipStatus = {
        in: ["DOCUMENTS_PENDING", "PROFILE_INCOMPLETE"],
      };
      where.unionMembershipStatus = { not: "ACCEPTED" };
    } else if (status === "approved") {
      where.OR = [
        { membershipStatus: "APPROVED" },
        { unionMembershipStatus: "ACCEPTED" },
      ];
    } else if (status === "excluded") {
      where.membershipStatus = { in: ["EXCLUDED", "REJECTED"] };
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
          role: true,
          isPPOHead: true,
          createdAt: true,
          membershipJoinedAt: true,
          membershipExcludedAt: true,
          membershipExclusionReason: true,
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

    const totalPages = Math.max(1, Math.ceil(total / limit));

    return NextResponse.json({
      members,
      total,
      page,
      limit,
      totalPages,
      scopeLevel: scope.level,
    });
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
