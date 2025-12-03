import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { DocumentType } from "@prisma/client";

/**
 * GET /api/admin/document-templates/[id]
 * Получить шаблон по ID
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }

    // Проверяем права доступа (только SUPER_ADMIN)
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { role: true },
    });

    if (user?.role !== "SUPER_ADMIN") {
      return NextResponse.json({ error: "Доступ запрещен" }, { status: 403 });
    }

    const { id } = await params;

    const template = await prisma.documentTemplate.findUnique({
      where: { id },
      include: {
        createdBy: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
        updatedBy: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
      },
    });

    if (!template) {
      return NextResponse.json({ error: "Шаблон не найден" }, { status: 404 });
    }

    return NextResponse.json({ template });
  } catch (error) {
    console.error("[admin/document-templates] GET [id] error:", error);
    return NextResponse.json(
      { error: "Ошибка при получении шаблона" },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/admin/document-templates/[id]
 * Обновить шаблон
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }

    // Проверяем права доступа (только SUPER_ADMIN)
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { role: true },
    });

    if (user?.role !== "SUPER_ADMIN") {
      return NextResponse.json({ error: "Доступ запрещен" }, { status: 403 });
    }

    const { id } = await params;
    const body = await request.json();
    const { name, description, type, htmlContent, cssStyles, isActive, isDefault } = body;

    // Проверяем существование шаблона
    const existingTemplate = await prisma.documentTemplate.findUnique({
      where: { id },
    });

    if (!existingTemplate) {
      return NextResponse.json({ error: "Шаблон не найден" }, { status: 404 });
    }

    // Если это шаблон по умолчанию, снимаем флаг isDefault с других шаблонов этого типа
    if (isDefault && !existingTemplate.isDefault) {
      await prisma.documentTemplate.updateMany({
        where: {
          type: existingTemplate.type,
          isDefault: true,
          id: { not: id },
        },
        data: {
          isDefault: false,
        },
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
      include: {
        createdBy: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
        updatedBy: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
      },
    });

    return NextResponse.json({ template });
  } catch (error) {
    console.error("[admin/document-templates] PUT [id] error:", error);
    return NextResponse.json(
      { error: "Ошибка при обновлении шаблона" },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/admin/document-templates/[id]
 * Удалить шаблон
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }

    // Проверяем права доступа (только SUPER_ADMIN)
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { role: true },
    });

    if (user?.role !== "SUPER_ADMIN") {
      return NextResponse.json({ error: "Доступ запрещен" }, { status: 403 });
    }

    const { id } = await params;

    // Проверяем существование шаблона
    const existingTemplate = await prisma.documentTemplate.findUnique({
      where: { id },
    });

    if (!existingTemplate) {
      return NextResponse.json({ error: "Шаблон не найден" }, { status: 404 });
    }

    // Нельзя удалить шаблон по умолчанию
    if (existingTemplate.isDefault) {
      return NextResponse.json(
        { error: "Нельзя удалить шаблон по умолчанию. Сначала установите другой шаблон по умолчанию." },
        { status: 400 }
      );
    }

    await prisma.documentTemplate.delete({
      where: { id },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[admin/document-templates] DELETE [id] error:", error);
    return NextResponse.json(
      { error: "Ошибка при удалении шаблона" },
      { status: 500 }
    );
  }
}

