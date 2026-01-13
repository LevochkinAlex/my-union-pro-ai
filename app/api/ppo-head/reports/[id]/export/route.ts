/**
 * API для экспорта отчёта в Excel или PDF
 * GET /api/ppo-head/reports/[id]/export?format=xlsx|pdf
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { checkUserPermissions } from "@/lib/staff-permissions";
import ExcelJS from "exceljs";
import { generatePDFFromHTML } from "@/lib/document-templates/renderer";

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
    const { searchParams } = new URL(request.url);
    const format = searchParams.get("format") || "xlsx"; // xlsx или pdf

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

    // Экспорт в PDF
    if (format === "pdf") {
      return exportToPDF(report);
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

/**
 * Экспорт отчёта в PDF
 */
async function exportToPDF(report: any): Promise<NextResponse> {
  const data = (report.data as Record<string, any>) || {};
  const periodText = report.periodMonth
    ? `${report.periodMonth} месяц ${report.periodYear} года`
    : `${report.periodYear} год`;

  // Генерируем HTML для PDF
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <style>
        @page { size: A4; margin: 2cm; }
        body { 
          font-family: 'Times New Roman', serif; 
          font-size: 12pt; 
          line-height: 1.5;
          color: #000;
        }
        .header { 
          text-align: center; 
          margin-bottom: 20px;
          border-bottom: 2px solid #333;
          padding-bottom: 15px;
        }
        .title { 
          font-size: 16pt; 
          font-weight: bold; 
          margin-bottom: 10px;
          text-transform: uppercase;
        }
        .subtitle { 
          font-size: 11pt; 
          color: #444; 
        }
        .info-block {
          background: #f5f5f5;
          padding: 15px;
          border-radius: 5px;
          margin-bottom: 20px;
        }
        .info-row { 
          margin: 5px 0; 
        }
        .info-label { 
          font-weight: bold;
          display: inline-block;
          width: 200px;
        }
        .section { 
          margin: 20px 0;
          page-break-inside: avoid;
        }
        .section-title { 
          font-size: 13pt; 
          font-weight: bold; 
          background: #e0e0e0; 
          padding: 8px 12px;
          margin-bottom: 10px;
          border-left: 4px solid #333;
        }
        table { 
          width: 100%; 
          border-collapse: collapse; 
          margin: 10px 0;
        }
        th, td { 
          border: 1px solid #333; 
          padding: 8px 10px; 
          text-align: left;
          vertical-align: top;
        }
        th { 
          background: #f0f0f0; 
          font-weight: bold;
          text-align: center;
        }
        .field-num {
          width: 50px;
          text-align: center;
          font-weight: bold;
        }
        .field-title {
          width: 50%;
        }
        .field-value {
          width: 40%;
        }
        .footer { 
          margin-top: 30px; 
          font-size: 10pt; 
          color: #666;
          border-top: 1px solid #ccc;
          padding-top: 10px;
          page-break-inside: avoid;
        }
        .status-badge {
          display: inline-block;
          padding: 3px 10px;
          border-radius: 3px;
          font-weight: bold;
          font-size: 10pt;
        }
        .status-DRAFT { background: #f0f0f0; color: #666; }
        .status-SUBMITTED { background: #e3f2fd; color: #1976d2; }
        .status-REVISION { background: #fff3e0; color: #f57c00; }
        .status-APPROVED { background: #e8f5e9; color: #388e3c; }
        .status-CONFIRMED { background: #e8f5e9; color: #2e7d32; }
        .signature-block {
          margin-top: 40px;
          display: flex;
          justify-content: space-between;
        }
        .signature-line {
          border-bottom: 1px solid #000;
          width: 200px;
          margin-top: 30px;
        }
        .signature-label {
          font-size: 10pt;
          color: #666;
        }
      </style>
    </head>
    <body>
      <div class="header">
        <div class="title">${report.template.name}</div>
        <div class="subtitle">Код формы: ${report.template.code.toUpperCase()}</div>
      </div>

      <div class="info-block">
        <div class="info-row">
          <span class="info-label">Организация:</span>
          ${report.organization.name}
        </div>
        ${report.organization.parent ? `
        <div class="info-row">
          <span class="info-label">Вышестоящая организация:</span>
          ${report.organization.parent.name}
        </div>
        ` : ""}
        ${report.organization.chairmanName ? `
        <div class="info-row">
          <span class="info-label">Председатель:</span>
          ${report.organization.chairmanName}
        </div>
        ` : ""}
        <div class="info-row">
          <span class="info-label">Отчётный период:</span>
          ${periodText}
        </div>
        <div class="info-row">
          <span class="info-label">Статус:</span>
          <span class="status-badge status-${report.status}">${STATUS_LABELS[report.status] || report.status}</span>
        </div>
      </div>

      ${report.template.sections.map((section: any) => {
        const multiColumnField = section.fields.find((f: any) => f.isMultiple && f.columnsCount > 1);
        const headers = multiColumnField?.columnHeaders as string[] || [];
        
        return `
          <div class="section">
            <div class="section-title">${section.title}</div>
            <table>
              <thead>
                <tr>
                  <th class="field-num">№</th>
                  <th class="field-title">Наименование показателя</th>
                  ${headers.length > 0 
                    ? headers.map((h: string) => `<th>${h}</th>`).join("") 
                    : `<th class="field-value">Значение</th>`
                  }
                </tr>
              </thead>
              <tbody>
                ${section.fields.map((field: any) => {
                  const value = data[field.code];
                  
                  if (field.isMultiple && field.columnsCount > 1) {
                    const values = Array.isArray(value) ? value : [];
                    return `
                      <tr>
                        <td class="field-num">${field.num || ""}</td>
                        <td class="field-title">${field.title}</td>
                        ${values.map((v: any) => `<td>${v ?? ""}</td>`).join("") || headers.map(() => `<td></td>`).join("")}
                      </tr>
                    `;
                  } else {
                    return `
                      <tr>
                        <td class="field-num">${field.num || ""}</td>
                        <td class="field-title">${field.title}</td>
                        <td colspan="${headers.length || 1}">${value ?? ""}</td>
                      </tr>
                    `;
                  }
                }).join("")}
              </tbody>
            </table>
          </div>
        `;
      }).join("")}

      <div class="signature-block">
        <div>
          <div class="signature-line"></div>
          <div class="signature-label">Подпись председателя</div>
        </div>
        <div>
          <div class="signature-line"></div>
          <div class="signature-label">М.П.</div>
        </div>
        <div>
          <div class="signature-line"></div>
          <div class="signature-label">Дата</div>
        </div>
      </div>

      <div class="footer">
        <p>Дата формирования: ${new Date().toLocaleDateString("ru-RU", {
          day: "2-digit",
          month: "long",
          year: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        })}</p>
        <p>Документ сформирован в системе MyUnion Pro</p>
      </div>
    </body>
    </html>
  `;

  // Генерируем PDF
  const pdfBuffer = await generatePDFFromHTML(html);

  // Формируем имя файла
  const fileName = `report_${report.template.code}_${report.periodYear}${
    report.periodMonth ? `_${report.periodMonth}` : ""
  }.pdf`;

  return new NextResponse(new Uint8Array(pdfBuffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${encodeURIComponent(fileName)}"`,
    },
  });
}
