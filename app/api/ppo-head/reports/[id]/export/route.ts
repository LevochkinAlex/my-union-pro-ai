/**
 * API для экспорта отчёта в Excel
 * GET /api/ppo-head/reports/[id]/export
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { checkUserPermissions } from "@/lib/staff-permissions";
import ExcelJS from "exceljs";

const STATUS_LABELS: Record<string, string> = {
  DRAFT: "Черновик",
  SUBMITTED: "На согласовании",
  REVISION: "На доработке",
  APPROVED: "Согласован",
  CONFIRMED: "Утверждён",
};

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
      return NextResponse.json({ error: "Нет доступа" }, { status: 403 });
    }

    // Получаем отчёт со всеми данными
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
            name: true,
            address: true,
            phone: true,
            email: true,
            chairmanName: true,
            parent: {
              select: { name: true },
            },
          },
        },
      },
    });

    if (!report) {
      return NextResponse.json({ error: "Отчёт не найден" }, { status: 404 });
    }

    // Создаём Excel документ
    const workbook = new ExcelJS.Workbook();
    workbook.creator = "MyUnion Pro";
    workbook.created = new Date();

    const worksheet = workbook.addWorksheet(report.template.code.toUpperCase());

    // Настройки ширины колонок
    worksheet.columns = [
      { width: 5 },   // №
      { width: 50 },  // Наименование показателя
      { width: 20 },  // Значение / Колонка 1
      { width: 20 },  // Колонка 2
      { width: 20 },  // Колонка 3
      { width: 20 },  // Колонка 4
    ];

    // Заголовок отчёта
    const titleRow = worksheet.addRow([report.template.name]);
    titleRow.font = { bold: true, size: 14 };
    worksheet.mergeCells(titleRow.number, 1, titleRow.number, 6);
    titleRow.alignment = { horizontal: "center" };

    // Информация об организации
    worksheet.addRow([]);
    const orgRow = worksheet.addRow([`Организация: ${report.organization.name}`]);
    worksheet.mergeCells(orgRow.number, 1, orgRow.number, 6);

    if (report.organization.parent) {
      const parentRow = worksheet.addRow([`Вышестоящая организация: ${report.organization.parent.name}`]);
      worksheet.mergeCells(parentRow.number, 1, parentRow.number, 6);
    }

    // Период и статус
    const periodText = report.periodMonth
      ? `${report.periodMonth} месяц ${report.periodYear} года`
      : `${report.periodYear} год`;
    const periodRow = worksheet.addRow([`Отчётный период: ${periodText}`]);
    worksheet.mergeCells(periodRow.number, 1, periodRow.number, 6);

    const statusRow = worksheet.addRow([`Статус: ${STATUS_LABELS[report.status] || report.status}`]);
    worksheet.mergeCells(statusRow.number, 1, statusRow.number, 6);

    worksheet.addRow([]);
    worksheet.addRow([]);

    const data = (report.data as Record<string, any>) || {};

    // Проходим по секциям
    for (const section of report.template.sections) {
      // Заголовок секции
      const sectionRow = worksheet.addRow([section.title]);
      sectionRow.font = { bold: true, size: 12 };
      worksheet.mergeCells(sectionRow.number, 1, sectionRow.number, 6);
      sectionRow.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FFE0E0E0" },
      };

      // Если есть многоколоночные поля, добавляем заголовки колонок
      const multiColumnField = section.fields.find((f) => f.isMultiple && f.columnsCount > 1);
      if (multiColumnField && multiColumnField.columnHeaders) {
        const headers = multiColumnField.columnHeaders as string[];
        const headerRow = worksheet.addRow([
          "№",
          "Наименование показателя",
          ...headers,
        ]);
        headerRow.font = { bold: true };
        headerRow.fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: "FFF0F0F0" },
        };
        headerRow.eachCell((cell) => {
          cell.border = {
            top: { style: "thin" },
            left: { style: "thin" },
            bottom: { style: "thin" },
            right: { style: "thin" },
          };
        });
      }

      // Поля секции
      for (const field of section.fields) {
        const value = data[field.code];

        if (field.isMultiple && field.columnsCount > 1) {
          // Многоколоночное поле
          const values = Array.isArray(value) ? value : [];
          const row = worksheet.addRow([
            field.num || "",
            field.title,
            ...values.map((v: any) => v ?? ""),
          ]);
          row.eachCell((cell) => {
            cell.border = {
              top: { style: "thin" },
              left: { style: "thin" },
              bottom: { style: "thin" },
              right: { style: "thin" },
            };
          });
        } else {
          // Простое поле
          const row = worksheet.addRow([
            field.num || "",
            field.title,
            value ?? "",
          ]);
          worksheet.mergeCells(row.number, 3, row.number, 6);
          row.eachCell((cell) => {
            cell.border = {
              top: { style: "thin" },
              left: { style: "thin" },
              bottom: { style: "thin" },
              right: { style: "thin" },
            };
          });
        }
      }

      worksheet.addRow([]);
    }

    // Дата формирования
    worksheet.addRow([]);
    const dateRow = worksheet.addRow([
      `Дата формирования: ${new Date().toLocaleDateString("ru-RU", {
        day: "2-digit",
        month: "long",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })}`,
    ]);
    worksheet.mergeCells(dateRow.number, 1, dateRow.number, 6);
    dateRow.font = { italic: true, size: 10 };

    // Генерируем буфер
    const buffer = await workbook.xlsx.writeBuffer();

    // Формируем имя файла
    const fileName = `report_${report.template.code}_${report.periodYear}${
      report.periodMonth ? `_${report.periodMonth}` : ""
    }.xlsx`;

    // Возвращаем файл
    return new NextResponse(buffer, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${encodeURIComponent(fileName)}"`,
      },
    });
  } catch (error) {
    console.error("[API] Error exporting report:", error);
    return NextResponse.json(
      { error: "Ошибка экспорта отчёта" },
      { status: 500 }
    );
  }
}
