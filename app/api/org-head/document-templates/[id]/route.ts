/**
 * GET /api/org-head/document-templates/[id] — полный шаблон для редактирования
 * PUT — обновление, DELETE — удаление (РПО или SUPER_ADMIN)
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

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
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

    const { id } = await params;
    const template = await prisma.documentTemplate.findUnique({
      where: { id },
    });

    if (!template) {
      return NextResponse.json({ error: "Шаблон не найден" }, { status: 404 });
    }

    return NextResponse.json({ template });
  } catch (error) {
    console.error("[org-head/document-templates] GET [id] error:", error);
    return NextResponse.json(
      { error: "Ошибка при получении шаблона" },
      { status: 500 }
    );
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
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

    const { id } = await params;
    const body = await request.json();
    const { name, description, type, htmlContent, cssStyles, isActive, isDefault } = body;

    const existing = await prisma.documentTemplate.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: "Шаблон не найден" }, { status: 404 });
    }

    if (isDefault && !existing.isDefault) {
      await prisma.documentTemplate.updateMany({
        where: {
          type: existing.type,
          isDefault: true,
          id: { not: id },
        },
        data: { isDefault: false },
      });
    }

    const template = await prisma.documentTemplate.update({
      where: { id },
      data: {
        ...(name !== undefined && { name }),
        ...(description !== undefined && { description }),
        ...(type !== undefined && { type: type as DocumentType }),
        ...(htmlContent !== undefined && { htmlContent }),
        ...(cssStyles !== undefined && { cssStyles }),
        ...(isActive !== undefined && { isActive }),
        ...(isDefault !== undefined && { isDefault }),
        updatedByUserId: session.user.id,
      },
    });

    return NextResponse.json({ template });
  } catch (error) {
    console.error("[org-head/document-templates] PUT [id] error:", error);
    return NextResponse.json(
      { error: "Ошибка при обновлении шаблона" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
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

    const { id } = await params;
    const existing = await prisma.documentTemplate.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: "Шаблон не найден" }, { status: 404 });
    }
    if (existing.isDefault) {
      return NextResponse.json(
        { error: "Нельзя удалить шаблон по умолчанию. Сначала установите другой шаблон по умолчанию." },
        { status: 400 }
      );
    }

    await prisma.documentTemplate.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[org-head/document-templates] DELETE [id] error:", error);
    return NextResponse.json(
      { error: "Ошибка при удалении шаблона" },
      { status: 500 }
    );
  }
}
