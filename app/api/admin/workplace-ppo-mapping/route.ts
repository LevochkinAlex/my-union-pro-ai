import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getOrgHeadScope } from "@/lib/org-head-permissions";
import { createOrUpdateWorkplacePPOMapping } from "@/lib/workplace-ppo-mapping";

/**
 * GET /api/admin/workplace-ppo-mapping
 * Получить список связей мест работы с ППО (SUPER_ADMIN, PPO_HEAD или org-head в рамках scope)
 */
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { role: true },
    });

    const isSuperAdmin = user?.role === "SUPER_ADMIN";
    const isPpoHead = user?.role === "PPO_HEAD";
    const orgHeadScope = !isSuperAdmin && !isPpoHead ? await getOrgHeadScope(session.user.id) : null;

    if (!isSuperAdmin && !isPpoHead && !orgHeadScope) {
      return NextResponse.json(
        { error: "Недостаточно прав" },
        { status: 403 }
      );
    }

    const { searchParams } = new URL(request.url);
    const workplaceName = searchParams.get("workplaceName");
    const workplaceInn = searchParams.get("workplaceInn");
    const ppoOrganizationId = searchParams.get("ppoOrganizationId");

    const where: any = {};
    if (workplaceName) {
      where.workplaceName = { contains: workplaceName, mode: "insensitive" };
    }
    if (workplaceInn) {
      where.workplaceInn = workplaceInn;
    }
    if (ppoOrganizationId) {
      where.ppoOrganizationId = ppoOrganizationId;
      if (orgHeadScope && !orgHeadScope.organizationIds.includes(ppoOrganizationId)) {
        return NextResponse.json({ error: "Недостаточно прав" }, { status: 403 });
      }
    } else if (orgHeadScope) {
      where.ppoOrganizationId = { in: orgHeadScope.organizationIds };
    }

    const mappings = await prisma.workplacePPOMapping.findMany({
      where,
      include: {
        ppoOrganization: {
          select: {
            id: true,
            name: true,
            type: true,
            chairmanName: true,
            chairmanJobTitle: true,
          },
        },
      },
      orderBy: {
        createdAt: "desc",
      },
      take: 500,
    });

    return NextResponse.json({
      success: true,
      mappings,
    });
  } catch (error: any) {
    console.error("[admin/workplace-ppo-mapping] GET error:", error);
    return NextResponse.json(
      {
        error: "Ошибка при получении связей",
        message: error.message,
      },
      { status: 500 }
    );
  }
}

/**
 * POST /api/admin/workplace-ppo-mapping
 * Создать или обновить связь места работы с ППО
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { role: true },
    });
    const isSuperAdmin = user?.role === "SUPER_ADMIN";
    const isPpoHead = user?.role === "PPO_HEAD";
    const orgHeadScope = !isSuperAdmin && !isPpoHead ? await getOrgHeadScope(session.user.id) : null;
    if (!isSuperAdmin && !isPpoHead && !orgHeadScope) {
      return NextResponse.json(
        { error: "Недостаточно прав" },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { workplaceName, workplaceInn, ppoOrganizationId, source, verified, notes } = body;

    if (!workplaceName || !workplaceInn || !ppoOrganizationId) {
      return NextResponse.json(
        { error: "Необходимо указать название места работы, ИНН и ППО" },
        { status: 400 }
      );
    }

    // Разрешаем привязку для ППО, региональных и местных организаций (у региональных/местных место работы — обычно сама организация/аппарат)
    const organization = await prisma.organization.findUnique({
      where: { id: ppoOrganizationId },
      select: { type: true },
    });

    if (!organization || !["PRIMARY", "REGIONAL", "LOCAL"].includes(organization.type)) {
      return NextResponse.json(
        { error: "Привязка места работы возможна только для ППО, региональной или местной организации" },
        { status: 400 }
      );
    }

    if (orgHeadScope && !orgHeadScope.organizationIds.includes(ppoOrganizationId)) {
      return NextResponse.json({ error: "Недостаточно прав" }, { status: 403 });
    }

    const mapping = await createOrUpdateWorkplacePPOMapping(
      workplaceName,
      workplaceInn,
      ppoOrganizationId,
      source || "manual",
      verified || false,
      notes
    );

    return NextResponse.json({
      success: true,
      mapping,
    });
  } catch (error: any) {
    console.error("[admin/workplace-ppo-mapping] POST error:", error);
    return NextResponse.json(
      {
        error: "Ошибка при создании связи",
        message: error.message,
      },
      { status: 500 }
    );
  }
}
