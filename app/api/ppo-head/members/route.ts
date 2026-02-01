import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getPPOHead } from "@/lib/ppo-head-utils";

/**
 * GET /api/ppo-head/members
 * Получить список членов профсоюза для Председателя
 */
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }

    // Проверяем, что пользователь является Председателем
    const chairman = await getPPOHead(session.user.id);

    if (!chairman) {
      return NextResponse.json(
        { error: "Доступ запрещен или организация не назначена" },
        { status: 403 }
      );
    }

    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status"); // "pending" или "approved"
    const q = searchParams.get("q")?.trim() || ""; // поиск по ФИО, должности
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") || "50", 10)));
    const skip = Math.max(0, parseInt(searchParams.get("skip") || "0", 10));

    const where: any = {
      organizationId: chairman.organizationId,
    };

    if (status === "pending") {
      where.membershipStatus = {
        in: ["DOCUMENTS_PENDING", "PROFILE_INCOMPLETE"],
      };
    } else if (status === "approved") {
      where.membershipStatus = "APPROVED";
    }

    if (q.length >= 1) {
      where.OR = [
        { lastName: { contains: q, mode: "insensitive" } },
        { firstName: { contains: q, mode: "insensitive" } },
        { middleName: { contains: q, mode: "insensitive" } },
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
          createdAt: true,
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

    return NextResponse.json({ members, total });
  } catch (error: any) {
    console.error("[ppo-head/members] GET error:", error);
    return NextResponse.json(
      {
        error: "Ошибка при получении членов профсоюза",
        details: process.env.NODE_ENV === "development" ? error.message : undefined,
      },
      { status: 500 }
    );
  }
}

