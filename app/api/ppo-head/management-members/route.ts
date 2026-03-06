/**
 * GET /api/ppo-head/management-members
 * Список управленцев профкома: председатель ППО + сотрудники с ролями isManagement (зам. председателя и т.д.).
 * Используется для полей «Докладывает» и «Со-докладчик» в повестке (не все члены профкома).
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { checkUserPermissions } from "@/lib/staff-permissions";

export interface ManagementMember {
  id: string;
  firstName: string | null;
  lastName: string | null;
  middleName: string | null;
  jobTitle: string | null;
  roleName: string;
}

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }

    const perm = await checkUserPermissions(session.user.id, "staff_view");
    if (!perm.hasAccess || !perm.organizationId) {
      return NextResponse.json(
        { error: "Доступ запрещён или организация не назначена" },
        { status: 403 }
      );
    }

    const organizationId = perm.organizationId;
    const members: ManagementMember[] = [];

    // 1) Председатель ППО
    const chairmanUser = await prisma.user.findFirst({
      where: { ppoHeadOrganizationId: organizationId },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        middleName: true,
        jobTitle: true,
      },
    });
    if (chairmanUser) {
      members.push({
        id: chairmanUser.id,
        firstName: chairmanUser.firstName,
        lastName: chairmanUser.lastName,
        middleName: chairmanUser.middleName,
        jobTitle: chairmanUser.jobTitle,
        roleName: "Председатель ППО",
      });
    }

    // 2) Сотрудники с ролями «управленец» (isManagement: зам. председателя и т.д., без «Член Профкома»)
    const staff = await prisma.organizationStaff.findMany({
      where: {
        organizationId,
        status: "ACTIVE",
        role: { isManagement: true, isActive: true },
      },
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            middleName: true,
            jobTitle: true,
          },
        },
        role: { select: { name: true } },
      },
    });

    for (const s of staff) {
      if (!s.user) continue;
      if (s.user.id === chairmanUser?.id) continue;
      members.push({
        id: s.user.id,
        firstName: s.user.firstName,
        lastName: s.user.lastName,
        middleName: s.user.middleName,
        jobTitle: s.user.jobTitle,
        roleName: s.role.name,
      });
    }

    return NextResponse.json({ members });
  } catch (error: unknown) {
    console.error("[management-members] GET error:", error);
    return NextResponse.json(
      {
        error: "Ошибка при получении управленцев профкома",
        details: process.env.NODE_ENV === "development" && error instanceof Error ? error.message : undefined,
      },
      { status: 500 }
    );
  }
}
