/**
 * API для управления конкретным отчётом
 * GET /api/ppo-head/reports/[id] - получить отчёт с данными
 * PATCH /api/ppo-head/reports/[id] - обновить данные отчёта
 * DELETE /api/ppo-head/reports/[id] - удалить черновик
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { checkUserPermissions } from "@/lib/staff-permissions";

// GET - получить отчёт
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }

    const permissions = await checkUserPermissions(session.user.id, "reports_view");
    
    if (!permissions.hasAccess) {
      return NextResponse.json(
        {
          error: "Нет доступа",
          requiredPermission: "reports_view",
          denyReason: permissions.denyReason || "MISSING_PERMISSION",
        },
        { status: 403 }
      );
    }

    const report = await prisma.report.findUnique({
      where: { id },
      include: {
        template: {
          include: {
            sections: {
              orderBy: { order: "asc" },
              include: {
                fields: {
                  orderBy: { order: "asc" },
                },
              },
            },
          },
        },
        organization: {
          select: {
            id: true,
            name: true,
            type: true,
            address: true,
            phone: true,
            email: true,
            chairmanName: true,
            parent: {
              select: { name: true },
            },
          },
        },
        statusHistory: {
          orderBy: { createdAt: "desc" },
          take: 10,
        },
        childReports: {
          select: {
            id: true,
            status: true,
            organization: {
              select: { name: true },
            },
          },
        },
      },
    });

    if (!report) {
      return NextResponse.json({ error: "Отчёт не найден" }, { status: 404 });
    }

    // Проверяем доступ к отчёту
    const organizationId = permissions.organizationId;
    
    // Доступ есть если:
    // 1. Это отчёт своей организации
    // 2. Это отчёт дочерней организации (для вышестоящих)
    const hasAccess = report.organizationId === organizationId;
    
    if (!hasAccess) {
      // Проверяем, является ли организация отчёта дочерней
      const isChild = await prisma.organization.findFirst({
        where: {
          id: report.organizationId,
          parentId: organizationId,
        },
      });
      
      if (!isChild) {
        return NextResponse.json({ error: "Нет доступа к этому отчёту" }, { status: 403 });
      }
    }

    // Определяем, можно ли редактировать отчёт
    const canEdit = 
      report.organizationId === organizationId &&
      ["DRAFT", "REVISION"].includes(report.status) &&
      (permissions.isChairman || permissions.permissions.reports_create);

    // Определяем, можно ли согласовать/утвердить
    const canApprove =
      report.organizationId !== organizationId && // Отчёт дочерней организации
      report.status === "SUBMITTED" &&
      permissions.isChairman;

    return NextResponse.json({
      report,
      canEdit,
      canApprove,
    });
  } catch (error) {
    console.error("[API] Error fetching report:", error);
    return NextResponse.json(
      { error: "Ошибка при получении отчёта" },
      { status: 500 }
    );
  }
}

// PATCH - обновить данные отчёта
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }

    const permissions = await checkUserPermissions(session.user.id, "reports_create");
    
    if (!permissions.hasAccess) {
      return NextResponse.json(
        {
          error: "Нет доступа",
          requiredPermission: "reports_create",
          denyReason: permissions.denyReason || "MISSING_PERMISSION",
        },
        { status: 403 }
      );
    }

    const report = await prisma.report.findUnique({
      where: { id },
    });

    if (!report) {
      return NextResponse.json({ error: "Отчёт не найден" }, { status: 404 });
    }

    // Проверяем что это наш отчёт и он в редактируемом статусе
    if (report.organizationId !== permissions.organizationId) {
      return NextResponse.json({ error: "Нет доступа к этому отчёту" }, { status: 403 });
    }

    if (!["DRAFT", "REVISION"].includes(report.status)) {
      return NextResponse.json(
        { error: "Отчёт нельзя редактировать в текущем статусе" },
        { status: 400 }
      );
    }

    const body = await request.json();
    const { data } = body;

    if (!data || typeof data !== "object") {
      return NextResponse.json({ error: "Некорректные данные" }, { status: 400 });
    }

    // Объединяем новые данные с существующими
    const existingData = (report.data as Record<string, any>) || {};
    const newData = { ...existingData, ...data };

    const updatedReport = await prisma.report.update({
      where: { id },
      data: {
        data: newData,
        filledByUserId: session.user.id,
      },
    });

    return NextResponse.json({ report: updatedReport });
  } catch (error) {
    console.error("[API] Error updating report:", error);
    return NextResponse.json(
      { error: "Ошибка при обновлении отчёта" },
      { status: 500 }
    );
  }
}

// DELETE - удалить черновик
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }

    const permissions = await checkUserPermissions(session.user.id, "reports_create");
    
    if (!permissions.hasAccess) {
      return NextResponse.json(
        {
          error: "Нет доступа",
          requiredPermission: "reports_create",
          denyReason: permissions.denyReason || "MISSING_PERMISSION",
        },
        { status: 403 }
      );
    }

    const report = await prisma.report.findUnique({
      where: { id },
    });

    if (!report) {
      return NextResponse.json({ error: "Отчёт не найден" }, { status: 404 });
    }

    if (report.organizationId !== permissions.organizationId) {
      return NextResponse.json({ error: "Нет доступа" }, { status: 403 });
    }

    // Можно удалить только черновик
    if (report.status !== "DRAFT") {
      return NextResponse.json(
        { error: "Можно удалить только черновик" },
        { status: 400 }
      );
    }

    await prisma.report.delete({
      where: { id },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[API] Error deleting report:", error);
    return NextResponse.json(
      { error: "Ошибка при удалении отчёта" },
      { status: 500 }
    );
  }
}
