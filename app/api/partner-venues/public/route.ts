import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

/**
 * GET /api/partner-venues/public?search=&city=&page=1&limit=20
 * Публичный список активных площадок партнёров (для каталога скидок).
 * Доступ: любой авторизованный пользователь.
 */
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);

    const venueId = searchParams.get("venueId")?.trim();
    if (venueId) {
      const venue = await prisma.partnerVenue.findFirst({
        where: { id: venueId, isActive: true, partner: { isActive: true } },
        include: {
          partner: { select: { id: true, name: true, description: true, website: true } },
        },
      });
      if (!venue) {
        return NextResponse.json({ error: "Площадка не найдена" }, { status: 404 });
      }
      return NextResponse.json({ venue });
    }

    const search = searchParams.get("search")?.trim() || "";
    const city = searchParams.get("city")?.trim() || "";
    const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
    const limit = Math.min(50, Math.max(1, parseInt(searchParams.get("limit") || "20", 10)));
    const skip = (page - 1) * limit;

    const where: any = {
      isActive: true,
      partner: { isActive: true },
    };

    if (city) {
      where.city = { contains: city, mode: "insensitive" };
    }

    if (search) {
      const words = search.split(/\s+/).filter(Boolean);
      if (words.length > 0) {
        const ilike = (field: string, value: string) => ({
          [field]: { contains: value, mode: "insensitive" as const },
        });
        const orForWord = (word: string) => ({
          OR: [
            ilike("name", word),
            ilike("description", word),
            ilike("promoLabel", word),
            { partner: ilike("name", word) },
          ],
        });
        where.AND = words.map((w) => orForWord(w));
      }
    }

    const [venues, total] = await Promise.all([
      prisma.partnerVenue.findMany({
        where,
        orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }],
        skip,
        take: limit,
        include: {
          partner: {
            select: {
              id: true,
              name: true,
              description: true,
              website: true,
            },
          },
        },
      }),
      prisma.partnerVenue.count({ where }),
    ]);

    return NextResponse.json({
      venues,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    });
  } catch (e) {
    console.error("[partner-venues/public] GET error:", e);
    return NextResponse.json({ error: "Ошибка загрузки площадок" }, { status: 500 });
  }
}
