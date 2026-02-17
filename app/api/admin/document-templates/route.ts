import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { DocumentType } from "@prisma/client";

/**
 * GET /api/admin/document-templates
 * Получить список всех шаблонов документов
 */
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }

    // Проверяем права доступа (только SUPER_ADMIN); при первом входе после назначения роли проверяем по БД
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { role: true },
    });

    if (user?.role !== "SUPER_ADMIN") {
      return NextResponse.json({ error: "Доступ запрещен. Только супер-администратор может открыть конструктор документов." }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const type = searchParams.get("type") as DocumentType | null;
    const isActive = searchParams.get("isActive");

    const where: any = {};
    if (type) {
      where.type = type;
    }
    if (isActive !== null) {
      where.isActive = isActive === "true";
    }

    const templates = await prisma.documentTemplate.findMany({
      where,
      orderBy: [
        { isDefault: "desc" },
        { createdAt: "desc" },
      ],
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

    return NextResponse.json({ templates });
  } catch (error) {
    console.error("[admin/document-templates] GET error:", error);
    return NextResponse.json(
      { error: "Ошибка при получении шаблонов" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/admin/document-templates
 * Создать новый шаблон документа
 */
export async function POST(request: NextRequest) {
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

    const body = await request.json();
    const { name, description, type, htmlContent, cssStyles, isActive, isDefault } = body;

    if (!name || !type || !htmlContent) {
      return NextResponse.json(
        { error: "Необходимо указать название, тип и HTML содержимое" },
        { status: 400 }
      );
    }

    // Если это шаблон по умолчанию, снимаем флаг isDefault с других шаблонов этого типа
    if (isDefault) {
      await prisma.documentTemplate.updateMany({
        where: {
          type: type as DocumentType,
          isDefault: true,
        },
        data: {
          isDefault: false,
        },
      });
    }

    const template = await prisma.documentTemplate.create({
      data: {
        name,
        description,
        type: type as DocumentType,
        htmlContent,
        cssStyles,
        isActive: isActive !== false,
        isDefault: isDefault === true,
        createdByUserId: session.user.id,
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
      },
    });

    return NextResponse.json({ template }, { status: 201 });
  } catch (error) {
    console.error("[admin/document-templates] POST error:", error);
    return NextResponse.json(
      { error: "Ошибка при создании шаблона" },
      { status: 500 }
    );
  }
}

