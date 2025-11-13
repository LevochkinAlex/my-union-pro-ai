import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import type { AppealType } from "@prisma/client";

/**
 * Export analytics to CSV or PDF
 */
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    // Only admins can export
    if (session?.user?.role !== "SUPER_ADMIN") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const searchParams = request.nextUrl.searchParams;
    const format = searchParams.get("format") || "csv"; // csv or pdf
    const days = parseInt(searchParams.get("days") || "7");
    const appealType = searchParams.get("type");

    if (!["csv", "pdf"].includes(format)) {
      return NextResponse.json(
        { error: "Format must be 'csv' or 'pdf'" },
        { status: 400 }
      );
    }

    // Fetch analytics data
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const query: any = {
      periodStart: { gte: startDate },
    };

    if (appealType) {
      query.appealType = appealType;
    }

    const records = await prisma.appealAnalytics.findMany({
      where: query,
      orderBy: { periodStart: "desc" },
    });

    if (format === "csv") {
      return exportToCSV(records);
    } else {
      return exportToPDF(records);
    }
  } catch (error) {
    console.error("[analytics-export] Error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

/**
 * Export to CSV format
 */
function exportToCSV(
  records: any[]
): NextResponse {
  // Header
  const headers = [
    "Date",
    "Appeal Type",
    "Total Questions",
    "Resolved",
    "Resolution %",
    "Avg Resolution Time (h)",
    "Keywords",
  ];

  // Rows
  const rows = records.map((record) => [
    new Date(record.periodStart).toLocaleDateString("ru-RU"),
    getAppealTypeName(record.appealType),
    record.totalCount,
    record.resolvedCount,
    ((record.resolvedCount / Math.max(record.totalCount, 1)) * 100).toFixed(1),
    record.averageResolutionTime?.toFixed(2) || "—",
    record.commonKeywords
      ? JSON.parse(record.commonKeywords).join(", ")
      : "",
  ]);

  // Format CSV
  const csv = [
    headers.join(","),
    ...rows.map((row) =>
      row
        .map((cell) => {
          const str = String(cell);
          // Escape quotes and wrap if contains comma
          if (str.includes(",") || str.includes('"') || str.includes("\n")) {
            return `"${str.replace(/"/g, '""')}"`;
          }
          return str;
        })
        .join(",")
    ),
  ].join("\n");

  // Add BOM for UTF-8 Excel compatibility
  const bom = "\uFEFF";

  return new NextResponse(bom + csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="appeal-analytics-${new Date().toISOString().split("T")[0]}.csv"`,
    },
  });
}

/**
 * Export to PDF format
 */
async function exportToPDF(records: any[]): Promise<NextResponse> {
  try {
    const PDFDocument = require("pdfkit");
    const doc = new PDFDocument();

    // Title
    doc.fontSize(20).font("Helvetica-Bold").text("Appeal Bot Analytics Report", {
      align: "center",
    });

    doc.fontSize(10).font("Helvetica").text(
      `Generated: ${new Date().toLocaleString("ru-RU")}`,
      {
        align: "center",
      }
    );

    doc.moveDown(1);

    // Summary
    const totalQuestions = records.reduce((sum, r) => sum + r.totalCount, 0);
    const totalResolved = records.reduce((sum, r) => sum + r.resolvedCount, 0);

    doc
      .fontSize(12)
      .font("Helvetica-Bold")
      .text("Summary Statistics", { underline: true });
    doc
      .fontSize(10)
      .font("Helvetica")
      .text(`Total Questions: ${totalQuestions}`)
      .text(`Total Resolved: ${totalResolved}`)
      .text(
        `Resolution Rate: ${((totalResolved / Math.max(totalQuestions, 1)) * 100).toFixed(1)}%`
      );

    doc.moveDown(1);

    // Table header
    const startY = doc.y;
    const col1 = 50;
    const col2 = 150;
    const col3 = 250;
    const col4 = 330;
    const col5 = 410;
    const col6 = 480;
    const rowHeight = 20;

    doc.rect(50, startY, 530, rowHeight).fill("#E0E0E0");

    doc
      .fontSize(10)
      .font("Helvetica-Bold")
      .fillColor("black")
      .text("Date", col1, startY + 5)
      .text("Type", col2, startY + 5)
      .text("Total", col3, startY + 5)
      .text("Resolved", col4, startY + 5)
      .text("Res. %", col5, startY + 5)
      .text("Avg Time (h)", col6, startY + 5);

    let yPos = startY + rowHeight;

    // Table rows
    doc.fontSize(9).font("Helvetica");

    records.forEach((record, index) => {
      const isEven = index % 2 === 0;
      if (isEven) {
        doc.rect(50, yPos, 530, rowHeight).fill("#F5F5F5");
      }
      doc.fillColor("black");

      doc
        .text(new Date(record.periodStart).toLocaleDateString("ru-RU"), col1, yPos + 5)
        .text(getAppealTypeName(record.appealType), col2, yPos + 5)
        .text(record.totalCount.toString(), col3, yPos + 5)
        .text(record.resolvedCount.toString(), col4, yPos + 5)
        .text(
          ((record.resolvedCount / Math.max(record.totalCount, 1)) * 100).toFixed(1),
          col5,
          yPos + 5
        )
        .text(record.averageResolutionTime?.toFixed(2) || "—", col6, yPos + 5);

      yPos += rowHeight;
    });

    // Footer
    const pageCount = doc.bufferedPageRange().count;
    for (let i = 0; i < pageCount; i++) {
      doc.switchToPage(i);
      doc
        .fontSize(8)
        .font("Helvetica")
        .text(
          `Page ${i + 1} of ${pageCount}`,
          50,
          doc.page.height - 30,
          { align: "center" }
        );
    }

    // Convert to buffer
    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = [];
      doc.on("data", (chunk: Buffer) => chunks.push(chunk));
      doc.on("end", () => {
        const buffer = Buffer.concat(chunks);
        resolve(
          new NextResponse(buffer, {
            headers: {
              "Content-Type": "application/pdf",
              "Content-Disposition": `attachment; filename="appeal-analytics-${new Date().toISOString().split("T")[0]}.pdf"`,
            },
          })
        );
      });
      doc.on("error", reject);
      doc.end();
    });
  } catch (error) {
    console.error("[analytics-export] PDF error:", error);
    throw error;
  }
}

/**
 * Get appeal type display name
 */
function getAppealTypeName(type: AppealType): string {
  const names: Record<AppealType, string> = {
    LEGAL: "Юридические",
    ACCOUNTING: "Бухгалтерские",
    TECHNICAL: "Технические",
    OTHER: "Прочие",
  };
  return names[type] || type;
}

