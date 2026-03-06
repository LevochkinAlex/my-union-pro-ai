import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getRpoTemplateRoles, requireRpoScope } from "@/lib/rpo-role-templates";
import { normalizeStaffPermissions } from "@/lib/staff-permission-matrix";

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }

    const scope = await requireRpoScope(session.user.id);
    if (!scope) {
      return NextResponse.json({ error: "Доступно только для РПО" }, { status: 403 });
    }

    const roles = await getRpoTemplateRoles(scope.organizationId);

    return NextResponse.json({
      templates: roles,
      rpoOrganizationId: scope.organizationId,
    });
  } catch (error: any) {
    console.error("[org-head/roles] GET error:", error);
    return NextResponse.json(
      { error: "Ошибка получения шаблонов ролей", details: error?.message },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }

    const scope = await requireRpoScope(session.user.id);
    if (!scope) {
      return NextResponse.json({ error: "Доступно только для РПО" }, { status: 403 });
    }

    const body = (await request.json().catch(() => ({}))) as {
      name?: string;
      description?: string | null;
      permissions?: Record<string, unknown>;
      isElectedBody?: boolean;
      isManagement?: boolean;
    };

    const name = body.name?.trim();
    if (!name) {
      return NextResponse.json({ error: "Название роли обязательно" }, { status: 400 });
    }

    const existing = await prisma.staffRole.findUnique({
      where: {
        organizationId_name: {
          organizationId: scope.organizationId,
          name,
        },
      },
      select: { id: true },
    });

    if (existing) {
      return NextResponse.json({ error: "Роль с таким названием уже существует" }, { status: 400 });
    }

    const role = await prisma.staffRole.create({
      data: {
        organizationId: scope.organizationId,
        name,
        description: body.description?.trim() || null,
        permissions: normalizeStaffPermissions(body.permissions),
        isSystem: false,
        isActive: true,
        isElectedBody: body.isElectedBody === true,
        isManagement: body.isManagement === true,
      },
    });

    return NextResponse.json({ template: role }, { status: 201 });
  } catch (error: any) {
    console.error("[org-head/roles] POST error:", error);
    return NextResponse.json(
      { error: "Ошибка создания шаблона роли", details: error?.message },
      { status: 500 }
    );
  }
}

