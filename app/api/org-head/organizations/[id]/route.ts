import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getOrgHeadScope } from "@/lib/org-head-permissions";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }

    const { id } = await context.params;
    const scope = await getOrgHeadScope(session.user.id);
    if (!scope || !scope.organizationIds.includes(id)) {
      return NextResponse.json({ error: "Нет доступа к организации" }, { status: 403 });
    }

    const organization = await prisma.organization.findUnique({
      where: { id },
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
        parent: { select: { id: true, name: true, type: true } },
        _count: {
          select: { members: true, reports: true, documents: true, tickets: true },
        },
      },
    });

    if (!organization) {
      return NextResponse.json({ error: "Организация не найдена" }, { status: 404 });
    }

    const { _count, ...rest } = organization;
    return NextResponse.json({
      organization: {
        ...rest,
        membersCount: _count.members,
        reportsCount: _count.reports,
        documentsCount: _count.documents,
        ticketsCount: _count.tickets,
      },
    });
  } catch (error: any) {
    console.error("[org-head/organizations/[id]] GET error:", error);
    return NextResponse.json(
      { error: "Ошибка получения организации", details: process.env.NODE_ENV === "development" ? error.message : undefined },
      { status: 500 }
    );
  }
}

type Body = {
  name?: string;
  address?: string | null;
  email?: string | null;
  phone?: string | null;
  inn?: string | null;
  chairmanName?: string | null;
  chairmanJobTitle?: string | null;
  totalEmployees?: number | null;
};

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }

    const { id } = await context.params;
    const scope = await getOrgHeadScope(session.user.id);
    if (!scope || !scope.organizationIds.includes(id)) {
      return NextResponse.json({ error: "Нет доступа к организации" }, { status: 403 });
    }

    const body = (await request.json()) as Body;

    const payload: any = {};
    if (typeof body.name === "string" && body.name.trim()) payload.name = body.name.trim();
    if (body.address !== undefined) payload.address = body.address ? body.address.trim() : null;
    if (body.email !== undefined) payload.email = body.email ? body.email.trim() : null;
    if (body.phone !== undefined) payload.phone = body.phone ? body.phone.trim() : null;
    if (body.inn !== undefined) payload.inn = body.inn ? body.inn.trim() : null;
    if (body.chairmanName !== undefined) payload.chairmanName = body.chairmanName ? body.chairmanName.trim() : null;
    if (body.chairmanJobTitle !== undefined) payload.chairmanJobTitle = body.chairmanJobTitle ? body.chairmanJobTitle.trim() : null;
    if (body.totalEmployees !== undefined) payload.totalEmployees = body.totalEmployees ?? 0;

    const organization = await prisma.organization.update({
      where: { id },
      data: payload,
      select: {
        id: true,
        name: true,
        type: true,
        address: true,
        inn: true,
        email: true,
        phone: true,
        chairmanName: true,
        chairmanJobTitle: true,
        totalEmployees: true,
      },
    });

    return NextResponse.json({ organization });
  } catch (error: any) {
    console.error("[org-head/organizations/[id]] PATCH error:", error);
    return NextResponse.json(
      {
        error: "Ошибка обновления организации",
        details: process.env.NODE_ENV === "development" ? error.message : undefined,
      },
      { status: 500 }
    );
  }
}
