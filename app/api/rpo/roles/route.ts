import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { requireRpoScope, getRpoTemplateRoles, ensureDefaultRpoTemplateRoles } from "@/lib/rpo-role-templates";
import { normalizeStaffPermissions } from "@/lib/staff-permission-matrix";

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }

    const scope = await requireRpoScope(session.user.id);
    if (!scope) {
      return NextResponse.json(
        { error: "Доступно только для руководителей РПО" },
        { status: 403 }
      );
    }

    // Всегда гарантируем наличие/актуальность базовых шаблонов РПО
    await ensureDefaultRpoTemplateRoles(scope.organizationId);
    const roles = await getRpoTemplateRoles(scope.organizationId);

    return NextResponse.json({ roles });
  } catch (error) {
    console.error("[rpo/roles] GET error:", error);
    return NextResponse.json(
      { error: "Ошибка при получении ролей" },
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
      return NextResponse.json(
        { error: "Доступно только для руководителей РПО" },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { name, description, permissions, isElectedBody, isManagement } = body;

    if (!name || !permissions) {
      return NextResponse.json(
        { error: "Название и права обязательны" },
        { status: 400 }
      );
    }

    const existing = await prisma.staffRole.findUnique({
      where: {
        organizationId_name: {
          organizationId: scope.organizationId,
          name,
        },
      },
    });

    if (existing) {
      return NextResponse.json(
        { error: "Роль с таким названием уже существует" },
        { status: 400 }
      );
    }

    const role = await prisma.staffRole.create({
      data: {
        organizationId: scope.organizationId,
        name,
        description: description || null,
        permissions: normalizeStaffPermissions(permissions),
        isSystem: false,
        isActive: true,
        isElectedBody: isElectedBody || false,
        isManagement: isManagement || false,
      },
    });

    return NextResponse.json(
      { role: { ...role, permissions: normalizeStaffPermissions(role.permissions) } },
      { status: 201 }
    );
  } catch (error) {
    console.error("[rpo/roles] POST error:", error);
    return NextResponse.json(
      { error: "Ошибка при создании роли" },
      { status: 500 }
    );
  }
}
