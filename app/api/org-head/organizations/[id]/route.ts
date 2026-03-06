import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getOrgHeadScope } from "@/lib/org-head-permissions";
import { OrganizationType } from "@prisma/client";

async function canAccessOrganization(
  userId: string,
  organizationId: string
): Promise<boolean> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { role: true },
  });
  if (user?.role === "SUPER_ADMIN") return true;
  const scope = await getOrgHeadScope(userId);
  return scope?.organizationIds.includes(organizationId) ?? false;
}

/**
 * GET /api/org-head/organizations/[id]
 */
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
    const allowed = await canAccessOrganization(session.user.id, id);
    if (!allowed) {
      return NextResponse.json({ error: "Нет доступа к организации" }, { status: 403 });
    }

    const organization = await prisma.organization.findUnique({
      where: { id },
      include: {
        parent: {
          select: {
            id: true,
            name: true,
            type: true,
          },
        },
        children: {
          select: {
            id: true,
            name: true,
            type: true,
            level: true,
          },
          orderBy: {
            sortOrder: "asc",
          },
        },
        _count: {
          select: {
            members: true,
          },
        },
      },
    });

    if (!organization) {
      return NextResponse.json({ error: "Организация не найдена" }, { status: 404 });
    }

    const chairmanWhereByType: Partial<Record<OrganizationType, Record<string, string>>> = {
      PRIMARY: { ppoHeadOrganizationId: id },
      LOCAL: { mpoHeadOrganizationId: id },
      REGIONAL: { rpoHeadOrganizationId: id },
    };

    const chairmanUser = chairmanWhereByType[organization.type]
      ? await prisma.user.findFirst({
          where: chairmanWhereByType[organization.type],
          select: {
            id: true,
            email: true,
            phone: true,
            firstName: true,
            lastName: true,
            middleName: true,
            jobTitle: true,
          },
        })
      : null;

    return NextResponse.json({
      organization,
      chairmanUser: chairmanUser
        ? {
            id: chairmanUser.id,
            email: chairmanUser.email ?? "",
            phone: chairmanUser.phone ?? "",
            firstName: chairmanUser.firstName ?? "",
            lastName: chairmanUser.lastName ?? "",
            middleName: chairmanUser.middleName ?? "",
            jobTitle: chairmanUser.jobTitle ?? "",
          }
        : null,
    });
  } catch (error: unknown) {
    console.error("[org-head/organizations/[id]] GET error:", error);
    return NextResponse.json(
      {
        error: "Ошибка при получении организации",
        details: process.env.NODE_ENV === "development" ? (error instanceof Error ? error.message : String(error)) : undefined,
      },
      { status: 500 }
    );
  }
}

async function updateChildrenLevels(parentId: string, baseLevel: number) {
  const children = await prisma.organization.findMany({
    where: { parentId },
  });
  for (const child of children) {
    const parent = await prisma.organization.findUnique({
      where: { id: parentId },
      select: { fullPath: true },
    });
    await prisma.organization.update({
      where: { id: child.id },
      data: {
        level: baseLevel,
        fullPath: parent?.fullPath ? `${parent.fullPath} / ${child.name}` : child.name,
      },
    });
    await updateChildrenLevels(child.id, baseLevel + 1);
  }
}

async function updateChildrenFullPath(parentId: string, parentFullPath: string) {
  const children = await prisma.organization.findMany({
    where: { parentId },
  });
  for (const child of children) {
    const newFullPath = `${parentFullPath} / ${child.name}`;
    await prisma.organization.update({
      where: { id: child.id },
      data: { fullPath: newFullPath },
    });
    await updateChildrenFullPath(child.id, newFullPath);
  }
}

/**
 * PUT /api/org-head/organizations/[id]
 */
export async function PUT(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }

    const { id } = await context.params;
    const allowed = await canAccessOrganization(session.user.id, id);
    if (!allowed) {
      return NextResponse.json({ error: "Нет доступа к организации" }, { status: 403 });
    }

    const body = await request.json();
    const {
      name,
      type,
      parentId,
      inn,
      address,
      phone,
      email,
      chairmanName,
      chairmanJobTitle,
      isActive,
      totalEmployees,
    } = body;

    const existingOrg = await prisma.organization.findUnique({
      where: { id },
      include: { parent: true },
    });

    if (!existingOrg) {
      return NextResponse.json({ error: "Организация не найдена" }, { status: 404 });
    }

    if (parentId === id) {
      return NextResponse.json(
        { error: "Организация не может быть своим собственным родителем" },
        { status: 400 }
      );
    }

    if (inn !== undefined && inn && String(inn).trim() !== "") {
      const existingWithInn = await prisma.organization.findFirst({
        where: {
          inn: String(inn).trim(),
          NOT: { id },
        },
      });
      if (existingWithInn) {
        return NextResponse.json(
          { error: `Организация с ИНН ${inn} уже существует: ${existingWithInn.name}` },
          { status: 400 }
        );
      }
    }

    let level = existingOrg.level;
    let fullPath = existingOrg.fullPath;
    if (parentId !== undefined && parentId !== existingOrg.parentId) {
      if (parentId) {
        const parent = await prisma.organization.findUnique({
          where: { id: parentId },
          select: { level: true, fullPath: true },
        });
        if (parent) {
          level = parent.level + 1;
          fullPath = parent.fullPath ? `${parent.fullPath} / ${name || existingOrg.name}` : (name || existingOrg.name);
        }
      } else {
        level = 0;
        fullPath = name || existingOrg.name;
      }
      await updateChildrenLevels(id, level + 1);
    }

    const updateData: Record<string, unknown> = {};
    if (name !== undefined) updateData.name = name;
    if (type !== undefined) updateData.type = type as OrganizationType;
    if (parentId !== undefined) updateData.parentId = parentId || null;
    if (level !== undefined) updateData.level = level;
    if (fullPath !== undefined) updateData.fullPath = fullPath;
    if (inn !== undefined) updateData.inn = inn || null;
    if (address !== undefined) updateData.address = address || null;
    if (phone !== undefined) updateData.phone = phone || null;
    if (email !== undefined) updateData.email = email || null;
    if (chairmanName !== undefined) updateData.chairmanName = chairmanName || null;
    if (chairmanJobTitle !== undefined) updateData.chairmanJobTitle = chairmanJobTitle || null;
    if (isActive !== undefined) updateData.isActive = isActive;
    if (totalEmployees !== undefined) {
      updateData.totalEmployees =
        totalEmployees == null || totalEmployees === ""
          ? null
          : Math.max(0, parseInt(String(totalEmployees), 10) || 0);
    }

    if (name !== undefined && name !== existingOrg.name) {
      const newFullPath = existingOrg.parentId
        ? (existingOrg.parent?.fullPath ? `${existingOrg.parent.fullPath} / ${name}` : name)
        : name;
      (updateData as any).fullPath = newFullPath;
      await updateChildrenFullPath(id, newFullPath);
    }

    const organization = await prisma.organization.update({
      where: { id },
      data: updateData,
      include: {
        parent: { select: { id: true, name: true, type: true } },
        children: {
          select: { id: true, name: true, type: true, level: true },
          orderBy: { sortOrder: "asc" },
        },
        _count: { select: { members: true } },
      },
    });

    return NextResponse.json({ organization });
  } catch (error: unknown) {
    console.error("[org-head/organizations/[id]] PUT error:", error);
    return NextResponse.json(
      {
        error: "Ошибка при обновлении организации",
        details: process.env.NODE_ENV === "development" ? (error instanceof Error ? error.message : String(error)) : undefined,
      },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/org-head/organizations/[id]
 */
export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }

    const { id } = await context.params;
    const allowed = await canAccessOrganization(session.user.id, id);
    if (!allowed) {
      return NextResponse.json({ error: "Нет доступа к организации" }, { status: 403 });
    }

    const existingOrg = await prisma.organization.findUnique({
      where: { id },
      include: {
        children: true,
        _count: { select: { members: true } },
      },
    });

    if (!existingOrg) {
      return NextResponse.json({ error: "Организация не найдена" }, { status: 404 });
    }

    if (existingOrg.children.length > 0) {
      return NextResponse.json(
        {
          error:
            "Нельзя удалить организацию с дочерними организациями. Сначала удалите или переместите дочерние организации.",
        },
        { status: 400 }
      );
    }

    if (existingOrg._count.members > 0) {
      return NextResponse.json(
        {
          error: "Нельзя удалить организацию с членами. Сначала переместите членов в другие организации.",
        },
        { status: 400 }
      );
    }

    await prisma.organization.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    console.error("[org-head/organizations/[id]] DELETE error:", error);
    return NextResponse.json(
      {
        error: "Ошибка при удалении организации",
        details: process.env.NODE_ENV === "development" ? (error instanceof Error ? error.message : String(error)) : undefined,
      },
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

/**
 * PATCH /api/org-head/organizations/[id] — упрощённое обновление (обратная совместимость)
 */
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
    const allowed = await canAccessOrganization(session.user.id, id);
    if (!allowed) {
      return NextResponse.json({ error: "Нет доступа к организации" }, { status: 403 });
    }

    const body = (await request.json()) as Body;
    const payload: Record<string, unknown> = {};
    if (typeof body.name === "string" && body.name.trim()) payload.name = body.name.trim();
    if (body.address !== undefined) payload.address = body.address ? String(body.address).trim() : null;
    if (body.email !== undefined) payload.email = body.email ? String(body.email).trim() : null;
    if (body.phone !== undefined) payload.phone = body.phone ? String(body.phone).trim() : null;
    if (body.inn !== undefined) payload.inn = body.inn ? String(body.inn).trim() : null;
    if (body.chairmanName !== undefined) payload.chairmanName = body.chairmanName ? String(body.chairmanName).trim() : null;
    if (body.chairmanJobTitle !== undefined) payload.chairmanJobTitle = body.chairmanJobTitle ? String(body.chairmanJobTitle).trim() : null;
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
  } catch (error: unknown) {
    console.error("[org-head/organizations/[id]] PATCH error:", error);
    return NextResponse.json(
      {
        error: "Ошибка обновления организации",
        details: process.env.NODE_ENV === "development" ? (error instanceof Error ? error.message : String(error)) : undefined,
      },
      { status: 500 }
    );
  }
}
