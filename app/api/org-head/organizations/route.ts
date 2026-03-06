import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getOrgHeadScope } from "@/lib/org-head-permissions";
import { OrganizationType } from "@prisma/client";

async function getAccessScope(session: { user?: { id?: string; role?: string } }) {
  if (!session?.user?.id) return null;
  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { role: true },
  });
  if (user?.role === "SUPER_ADMIN") return "SUPER_ADMIN";
  const scope = await getOrgHeadScope(session.user.id);
  return scope;
}

/**
 * GET /api/org-head/organizations
 * Список организаций с иерархией (как в админке). РПО — только свои, SUPER_ADMIN — все.
 */
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }

    const scopeOrAdmin = await getAccessScope(session);
    if (!scopeOrAdmin) {
      return NextResponse.json({ error: "Нет доступа" }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const type = searchParams.get("type") as OrganizationType | null;
    const includeInactive = searchParams.get("includeInactive") === "true";
    const search = searchParams.get("search")?.trim() || null;

    const where: Record<string, unknown> = {};
    if (scopeOrAdmin !== "SUPER_ADMIN") {
      where.id = { in: scopeOrAdmin.organizationIds };
    }
    if (type && ["PRIMARY", "LOCAL", "REGIONAL", "FEDERAL"].includes(type)) {
      where.type = type as OrganizationType;
    }
    if (!includeInactive) {
      where.isActive = true;
    }
    if (search) {
      where.OR = [
        { name: { contains: search, mode: "insensitive" } },
        { chairmanName: { contains: search, mode: "insensitive" } },
        ...(search.replace(/\D/g, "").length >= 4 ? [{ inn: { contains: search } }] : []),
      ];
    }

    const organizations = await prisma.organization.findMany({
      where,
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
            name: "asc",
          },
        },
        _count: {
          select: {
            members: true,
          },
        },
        ppoChairman: {
          select: {
            firstName: true,
            lastName: true,
            middleName: true,
            jobTitle: true,
          },
        },
        mpoChairman: {
          select: {
            firstName: true,
            lastName: true,
            middleName: true,
            jobTitle: true,
          },
        },
        rpoChairman: {
          select: {
            firstName: true,
            lastName: true,
            middleName: true,
            jobTitle: true,
          },
        },
      },
      orderBy: [{ level: "asc" }, { name: "asc" }],
    });

    const normalized = organizations.map((org) => {
      const head = org.ppoChairman ?? org.mpoChairman ?? org.rpoChairman ?? null;
      if (!head) return org;
      const headName = [head.lastName, head.firstName, head.middleName]
        .filter(Boolean)
        .join(" ")
        .trim();
      return {
        ...org,
        chairmanName: headName || org.chairmanName,
        chairmanJobTitle: head.jobTitle || org.chairmanJobTitle,
      };
    });

    return NextResponse.json({ organizations: normalized });
  } catch (error: unknown) {
    console.error("[org-head/organizations] GET error:", error);
    return NextResponse.json(
      {
        error: "Ошибка при получении организаций",
        details: process.env.NODE_ENV === "development" ? (error instanceof Error ? error.message : String(error)) : undefined,
      },
      { status: 500 }
    );
  }
}

/**
 * POST /api/org-head/organizations
 * Создать организацию. РПО — только с parentId из своего scope, SUPER_ADMIN — любые.
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }

    const scopeOrAdmin = await getAccessScope(session);
    if (!scopeOrAdmin) {
      return NextResponse.json({ error: "Нет доступа" }, { status: 403 });
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
      isActive = true,
    } = body;

    if (!name || !type) {
      return NextResponse.json(
        { error: "Необходимо указать название и тип организации" },
        { status: 400 }
      );
    }

    if (scopeOrAdmin !== "SUPER_ADMIN" && "organizationIds" in scopeOrAdmin) {
      const allowedParentIds = scopeOrAdmin.organizationIds;
      if (!parentId) {
        return NextResponse.json(
          { error: "Укажите родительскую организацию" },
          { status: 400 }
        );
      }
      if (!allowedParentIds.includes(parentId)) {
        return NextResponse.json(
          { error: "Родительская организация не входит в зону доступа" },
          { status: 403 }
        );
      }
    }

    let level = 0;
    let fullPath = name;
    if (parentId) {
      const parent = await prisma.organization.findUnique({
        where: { id: parentId },
        select: { level: true, fullPath: true },
      });
      if (parent) {
        level = parent.level + 1;
        fullPath = parent.fullPath ? `${parent.fullPath} / ${name}` : name;
      }
    }

    const maxSortOrder = await prisma.organization.findFirst({
      where: { parentId: parentId || null },
      orderBy: { sortOrder: "desc" },
      select: { sortOrder: true },
    });
    const sortOrder = (maxSortOrder?.sortOrder ?? 0) + 1;

    const organization = await prisma.organization.create({
      data: {
        name,
        type: type as OrganizationType,
        parentId: parentId || null,
        level,
        fullPath,
        sortOrder,
        inn: inn?.trim() || null,
        address: address?.trim() || null,
        phone: phone?.trim() || null,
        email: email?.trim() || null,
        chairmanName: chairmanName?.trim() || null,
        chairmanJobTitle: chairmanJobTitle?.trim() || null,
        isActive,
      },
      include: {
        parent: {
          select: {
            id: true,
            name: true,
            type: true,
          },
        },
        _count: {
          select: {
            members: true,
          },
        },
      },
    });

    return NextResponse.json({ organization }, { status: 201 });
  } catch (error: unknown) {
    console.error("[org-head/organizations] POST error:", error);
    return NextResponse.json(
      { error: "Ошибка при создании организации" },
      { status: 500 }
    );
  }
}
