import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getOrgHeadScope } from "@/lib/org-head-permissions";
import { getEffectivePermissions, type Permission } from "@/lib/staff-permissions";
import { isStaffPermission } from "@/lib/staff-permission-matrix";

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const targetUserId = searchParams.get("userId");
    const requiredPermissionParam = searchParams.get("requiredPermission");

    if (!targetUserId) {
      return NextResponse.json({ error: "Укажите userId" }, { status: 400 });
    }

    let requiredPermission: Permission | undefined;
    if (requiredPermissionParam) {
      if (!isStaffPermission(requiredPermissionParam)) {
        return NextResponse.json({ error: "Неизвестный ключ permission" }, { status: 400 });
      }
      requiredPermission = requiredPermissionParam;
    }

    const targetUser = await prisma.user.findUnique({
      where: { id: targetUserId },
      select: {
        id: true,
        organizationId: true,
        firstName: true,
        lastName: true,
      },
    });
    if (!targetUser) {
      return NextResponse.json({ error: "Пользователь не найден" }, { status: 404 });
    }

    const isSuperAdmin = session.user.role === "SUPER_ADMIN";
    if (!isSuperAdmin) {
      const scope = await getOrgHeadScope(session.user.id);
      if (!scope) {
        return NextResponse.json({ error: "Нет доступа" }, { status: 403 });
      }
      if (!targetUser.organizationId || !scope.organizationIds.includes(targetUser.organizationId)) {
        return NextResponse.json({ error: "Пользователь вне вашего scope" }, { status: 403 });
      }
    }

    const effective = await getEffectivePermissions(targetUserId, requiredPermission);

    return NextResponse.json({
      user: targetUser,
      effective,
    });
  } catch (error: any) {
    console.error("[org-head/permissions/effective] GET error:", error);
    return NextResponse.json(
      { error: "Ошибка расчета effective permissions", details: error?.message },
      { status: 500 }
    );
  }
}

