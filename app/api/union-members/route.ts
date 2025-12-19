import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// GET /api/union-members - получить список членов профсоюза из своей организации
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const searchParams = request.nextUrl.searchParams;
    const limit = parseInt(searchParams.get("limit") || "10");

    // Получаем организацию текущего пользователя
    const currentUser = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { organizationId: true },
    });

    // Если у пользователя нет организации, возвращаем пустой список
    if (!currentUser?.organizationId) {
      return NextResponse.json({ members: [], hasOrganization: false });
    }

    // Получаем членов профсоюза только из организации пользователя
    const members = await prisma.user.findMany({
      where: {
        id: {
          not: session.user.id,
        },
        organizationId: currentUser.organizationId,
        role: {
          in: ["MEMBER", "PPO_HEAD"],
        },
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        avatarUrl: true,
        organization: {
          select: {
            name: true,
          },
        },
      },
      take: limit,
      orderBy: {
        createdAt: "desc",
      },
    });

    return NextResponse.json({ members, hasOrganization: true });
  } catch (error) {
    console.error("[union-members] Error:", error);
    return NextResponse.json(
      { error: "Failed to fetch members" },
      { status: 500 }
    );
  }
}

