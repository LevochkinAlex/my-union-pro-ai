import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { DEMO_USER_ID, DEMO_MEMBER_USER_ID } from "@/lib/demo-constants";
import { getDemoProfileMembership } from "@/lib/demo";
import { prisma } from "@/lib/prisma";

/**
 * Генерирует 16-значный номер профсоюзной карточки в формате XXXX XXXX XXXX XXXX
 */
function generateUnionCardNumber(): string {
  const digits = Array.from({ length: 16 }, () => Math.floor(Math.random() * 10)).join("");
  // Форматируем как XXXX XXXX XXXX XXXX
  return `${digits.slice(0, 4)} ${digits.slice(4, 8)} ${digits.slice(8, 12)} ${digits.slice(12, 16)}`;
}

/**
 * GET /api/profile/membership
 * Получает информацию о членстве пользователя
 */
export async function GET() {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }

    const isDemo = session.user.id === DEMO_USER_ID || session.user.id === DEMO_MEMBER_USER_ID;
    if (isDemo) {
      return NextResponse.json(getDemoProfileMembership(session.user.id));
    }

    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      include: {
        organization: {
          select: {
            id: true,
            name: true,
            inn: true,
            chairmanName: true,
          },
        },
        membershipHistory: {
          include: {
        organization: {
          select: {
            id: true,
            name: true,
            inn: true,
            chairmanName: true,
          },
        },
          },
          orderBy: {
            statusDate: "desc",
          },
        },
      },
    });

    if (!user) {
      return NextResponse.json({ error: "Пользователь не найден" }, { status: 404 });
    }

    // Генерируем номер карточки, если его еще нет
    let unionCardNumber = user.unionCardNumber;
    if (!unionCardNumber) {
      // Генерируем уникальный номер
      let attempts = 0;
      do {
        unionCardNumber = generateUnionCardNumber();
        const existing = await prisma.user.findUnique({
          where: { unionCardNumber },
        });
        if (!existing) break;
        attempts++;
        if (attempts > 10) {
          return NextResponse.json(
            { error: "Не удалось сгенерировать уникальный номер карточки" },
            { status: 500 }
          );
        }
      } while (true);

      // Сохраняем номер карточки
      await prisma.user.update({
        where: { id: user.id },
        data: { unionCardNumber },
      });
    }

    // Форматируем историю членства
    const history = user.membershipHistory.map((entry) => ({
      id: entry.id,
      organizationName: entry.organizationName || entry.organization?.name || "Не указано",
      organizationId: entry.organizationId,
      status: entry.status,
      statusDate: entry.statusDate,
      notes: entry.notes,
    }));

    // Определяем текущую организацию (из справочника или текстовое поле для обратной совместимости)
    let currentOrganization = null;
    
    // Логируем для отладки
    console.log("[profile/membership] User organization data:", {
      userId: user.id,
      organizationId: user.organizationId,
      organizationName: user.organizationName,
      organization: user.organization ? {
        id: user.organization.id,
        name: user.organization.name,
      } : null,
    });
    
    if (user.organization) {
      // Из справочника организаций
      currentOrganization = {
        id: user.organization.id,
        name: user.organization.name,
        inn: user.organization.inn,
        chairmanName: user.organization.chairmanName,
        type: "linked", // Связана через ID
      };
    } else if (user.organizationName) {
      // Текстовое поле (старая система, для обратной совместимости)
      currentOrganization = {
        id: null,
        name: user.organizationName,
        inn: null,
        chairmanName: null,
        type: "text", // Просто текст, не из справочника
      };
    } else if (user.organizationId) {
      // Если есть organizationId, но связь не загрузилась - пытаемся загрузить организацию отдельно
      console.log("[profile/membership] OrganizationId exists but relation not loaded, loading separately:", user.organizationId);
      try {
        const org = await prisma.organization.findUnique({
          where: { id: user.organizationId },
          select: {
            id: true,
            name: true,
            inn: true,
            chairmanName: true,
          },
        });
        if (org) {
          currentOrganization = {
            id: org.id,
            name: org.name,
            inn: org.inn,
            chairmanName: org.chairmanName,
            type: "linked",
          };
          console.log("[profile/membership] Successfully loaded organization:", org.name);
        } else {
          console.warn("[profile/membership] Organization not found for ID:", user.organizationId);
        }
      } catch (error) {
        console.error("[profile/membership] Error loading organization:", error);
      }
    }

    // Маппинг статуса: APPROVED -> ACCEPTED для совместимости с фронтендом
    let membershipStatusDisplay = "NOT_ACCEPTED";
    if (user.membershipStatus === "EXCLUDED" || user.unionMembershipStatus === "REMOVED") {
      membershipStatusDisplay = "REMOVED";
    } else if (user.membershipStatus === "APPROVED" || user.unionMembershipStatus === "ACCEPTED") {
      membershipStatusDisplay = "ACCEPTED";
    } else if (user.membershipStatus === "REJECTED") {
      membershipStatusDisplay = "REMOVED";
    }

    return NextResponse.json({
      unionCardNumber,
      membershipJoinedAt: user.membershipJoinedAt,
      membershipStatus: membershipStatusDisplay,
      currentOrganization,
      history,
    });
  } catch (error) {
    console.error("[profile/membership] GET error:", error);
    return NextResponse.json(
      { error: "Не удалось загрузить информацию о членстве" },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/profile/membership
 * Обновление своей даты вступления в профсоюз (для текущего пользователя).
 * После изменения потребуется перегенерировать заявления.
 */
export async function PATCH(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const raw = body.membershipJoinedAt;
    if (raw === undefined || raw === null) {
      return NextResponse.json(
        { error: "Укажите дату вступления (membershipJoinedAt)" },
        { status: 400 }
      );
    }

    const parsed = new Date(raw);
    if (isNaN(parsed.getTime()) || parsed > new Date()) {
      return NextResponse.json(
        { error: "Некорректная дата вступления" },
        { status: 400 }
      );
    }

    await prisma.user.update({
      where: { id: session.user.id },
      data: {
        membershipJoinedAt: parsed,
        profileChangedAfterDocuments: true,
      },
    });

    return NextResponse.json({
      success: true,
      message: "Дата вступления обновлена. Потребуется перегенерировать заявления.",
    });
  } catch (error) {
    console.error("[profile/membership] PATCH error:", error);
    return NextResponse.json(
      { error: "Не удалось обновить дату вступления" },
      { status: 500 }
    );
  }
}

