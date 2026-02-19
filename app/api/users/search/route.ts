import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const query = searchParams.get("q") || "";
    const status = searchParams.get("status");
    const limit = parseInt(searchParams.get("limit") || "50", 10);
    const context = searchParams.get("context") || "";

    const where: any = {
      id: { not: session.user.id },
      membershipStatus: "APPROVED",
    };

    if (context === "chat") {
      const currentUser = await prisma.user.findUnique({
        where: { id: session.user.id },
        select: { organizationId: true },
      });
      const myOrgId = currentUser?.organizationId ?? null;
      where.organizationId = myOrgId;
    }

    if (query.trim()) {
      where.OR = [
        { firstName: { contains: query, mode: "insensitive" } },
        { lastName: { contains: query, mode: "insensitive" } },
        { email: { contains: query, mode: "insensitive" } },
        ...(context === "chat" ? [{ phone: { contains: query } }] : []),
      ];
    }

    if (status && status !== "approved") {
      where.membershipStatus = status.toUpperCase();
    }

    const users = await prisma.user.findMany({
      where,
      take: limit,
      select: {
        id: true,
        firstName: true,
        lastName: true,
        middleName: true,
        email: true,
        avatarUrl: true,
        membershipStatus: true,
      },
      orderBy: [
        { firstName: "asc" },
        { lastName: "asc" },
      ],
    });

    return NextResponse.json({
      users: users.map(user => ({
        id: user.id,
        firstName: user.firstName,
        lastName: user.lastName,
        middleName: user.middleName,
        email: user.email,
        avatarUrl: user.avatarUrl,
        position: null, // Можно добавить позже из OrganizationStaff
      })),
    });
  } catch (error: any) {
    console.error("[GET /api/users/search] Error:", error);
    return NextResponse.json(
      { error: error.message || "Ошибка поиска пользователей" },
      { status: 500 }
    );
  }
}
