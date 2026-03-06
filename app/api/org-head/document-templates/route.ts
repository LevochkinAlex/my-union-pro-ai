/**
 * GET /api/org-head/document-templates
 * Список всех шаблонов документов для руководителя РПО (или SUPER_ADMIN).
 * POST — создание шаблона.
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { DocumentType } from "@prisma/client";
import { getOrgHeadScope } from "@/lib/org-head-permissions";

async function checkAccess(session: { user?: { id?: string; role?: string } }) {
  if (!session?.user?.id) return false;
  if ((session.user as { role?: string }).role === "SUPER_ADMIN") return true;
  const scope = await getOrgHeadScope(session.user.id);
  return scope?.level === "RPO";
}

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }

    if (!(await checkAccess(session))) {
      return NextResponse.json(
        { error: "Доступно только для руководителей РПО" },
        { status: 403 }
      );
    }

    const { searchParams } = new URL(request.url);
    const type = searchParams.get("type") as DocumentType | null;
    const full = searchParams.get("full") === "true";

    const where: Record<string, unknown> = {};
    if (type) where.type = type;
    if (!full) where.isActive = true;

    const templates = await prisma.documentTemplate.findMany({
      where,
      select: full
        ? {
            id: true,
            name: true,
            description: true,
            type: true,
            isDefault: true,
            isActive: true,
            htmlContent: true,
            cssStyles: true,
            createdAt: true,
            updatedAt: true,
          }
        : {
            id: true,
            name: true,
            description: true,
            type: true,
            isDefault: true,
          },
      orderBy: [{ isDefault: "desc" }, { createdAt: "desc" }],
    });

    return NextResponse.json({ templates });
  } catch (error) {
    console.error("[org-head/document-templates] GET error:", error);
    return NextResponse.json(
      { error: "Ошибка при получении шаблонов" },
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

    if (!(await checkAccess(session))) {
      return NextResponse.json(
        { error: "Доступно только для руководителей РПО" },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { name, description, type, htmlContent, cssStyles, isActive, isDefault } = body;

    if (!name || !type || !htmlContent) {
      return NextResponse.json(
        { error: "Необходимо указать название, тип и HTML содержимое" },
        { status: 400 }
      );
    }

    if (isDefault) {
      await prisma.documentTemplate.updateMany({
        where: { type: type as DocumentType, isDefault: true },
        data: { isDefault: false },
      });
    }

    const template = await prisma.documentTemplate.create({
      data: {
        name,
        description: description ?? null,
        type: type as DocumentType,
        htmlContent,
        cssStyles: cssStyles ?? null,
        isActive: isActive !== false,
        isDefault: isDefault === true,
        createdByUserId: session.user.id,
        updatedByUserId: session.user.id,
      },
    });

    return NextResponse.json({ template }, { status: 201 });
  } catch (error) {
    console.error("[org-head/document-templates] POST error:", error);
    return NextResponse.json(
      { error: "Ошибка при создании шаблона" },
      { status: 500 }
    );
  }
}
