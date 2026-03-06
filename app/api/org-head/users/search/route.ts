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

    const q = request.nextUrl.searchParams.get("q")?.trim() || "";
    const limitRaw = Number(request.nextUrl.searchParams.get("limit") || "20");
    const limit = Math.min(Math.max(limitRaw, 1), 50);

    if (q.length < 2) {
      return NextResponse.json({ users: [] });
    }

    const users = await prisma.user.findMany({
      where: {
        organizationId: { in: scope.organizationIds },
        id: { not: session.user.id },
        OR: [
          { firstName: { contains: q, mode: "insensitive" } },
          { lastName: { contains: q, mode: "insensitive" } },
          { middleName: { contains: q, mode: "insensitive" } },
          { email: { contains: q, mode: "insensitive" } },
          { phone: { contains: q } },
        ],
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        middleName: true,
        email: true,
        phone: true,
        membershipStatus: true,
        organization: {
          select: { id: true, name: true, type: true },
        },
      },
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
      take: limit,
    });

    return NextResponse.json({ users });
  } catch (error: any) {
    console.error("[org-head/users/search] GET error:", error);
    return NextResponse.json(
      {
        error: "Ошибка поиска пользователей",
        details: process.env.NODE_ENV === "development" ? error.message : undefined,
      },
      { status: 500 }
    );
  }
}

