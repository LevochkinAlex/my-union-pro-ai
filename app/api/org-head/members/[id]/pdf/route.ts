import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getOrgHeadScope } from "@/lib/org-head-permissions";
import PDFDocument from "pdfkit";
import path from "path";
import fs from "fs";

const MEMBERSHIP_STATUS_MAP: Record<string, string> = {
  PENDING: "Ожидает",
  PENDING_VERIFICATION: "Ожидает проверки",
  PROFILE_INCOMPLETE: "Профиль не заполнен",
  DOCUMENTS_PENDING: "Ожидает документов",
  APPROVED: "Одобрен",
  REJECTED: "Отклонён",
  SUSPENDED: "Приостановлен",
  EXCLUDED: "Исключён",
};

const EMPLOYMENT_STATUS_MAP: Record<string, string> = {
  EMPLOYED: "Трудоустроен",
  UNEMPLOYED: "Не работает",
  STUDENT: "Студент",
  PENSIONER: "Пенсионер",
  SELF_EMPLOYED: "Самозанятый",
};

const MARITAL_STATUS_MAP: Record<string, string> = {
  SINGLE: "Не женат/не замужем",
  MARRIED: "Женат/замужем",
  DIVORCED: "Разведён(а)",
  WIDOWED: "Вдовец/вдова",
};

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }

    const scope = await getOrgHeadScope(session.user.id);
    if (!scope) {
      return NextResponse.json({ error: "Нет доступа" }, { status: 403 });
    }

    const { id } = await context.params;

    const member = await prisma.user.findUnique({
      where: { id },
      include: {
        organization: { select: { name: true } },
        documents: {
          select: { id: true, type: true, status: true, title: true, createdAt: true },
        },
      },
    });

    if (!member) {
      return NextResponse.json({ error: "Пользователь не найден" }, { status: 404 });
    }

    if (!member.organizationId || !scope.organizationIds.includes(member.organizationId)) {
      return NextResponse.json({ error: "Нет доступа к данному пользователю" }, { status: 403 });
    }

    const doc = new PDFDocument({
      size: "A4",
      margin: 50,
      info: {
        Title: `Анкета - ${member.lastName || ""} ${member.firstName || ""}`,
        Author: "MyUnion Pro",
      },
    });

    const chunks: Buffer[] = [];
    doc.on("data", (chunk) => chunks.push(chunk));

    const fontsDir = path.join(process.cwd(), "public", "fonts");
    const robotoRegularPath = path.join(fontsDir, "Roboto-Regular.ttf");
    const robotoBoldPath = path.join(fontsDir, "Roboto-Bold.ttf");

    if (fs.existsSync(robotoRegularPath) && fs.existsSync(robotoBoldPath)) {
      doc.registerFont("Roboto", robotoRegularPath);
      doc.registerFont("Roboto-Bold", robotoBoldPath);
      doc.font("Roboto");
    } else {
      doc.font("Helvetica");
    }

    const fontRegular = fs.existsSync(robotoRegularPath) ? "Roboto" : "Helvetica";
    const fontBold = fs.existsSync(robotoBoldPath) ? "Roboto-Bold" : "Helvetica-Bold";

    doc.fontSize(20).text("АНКЕТА ЧЛЕНА ПРОФСОЮЗА", { align: "center" });
    doc.moveDown(0.5);

    const fullName = [member.lastName, member.firstName, member.middleName].filter(Boolean).join(" ");
    doc.fontSize(16).text(fullName || "ФИО не указано", { align: "center" });
    doc.moveDown(0.3);

    const statusText = MEMBERSHIP_STATUS_MAP[member.membershipStatus || ""] || member.membershipStatus || "Не указан";
    doc.fontSize(10).text(`Статус: ${statusText}`, { align: "center" });

    if (member.unionCardNumber) {
      doc.text(`Профсоюзный билет № ${member.unionCardNumber}`, { align: "center" });
    }
    doc.moveDown(1);

    const addSection = (title: string) => {
      doc.moveDown(0.5);
      doc.fontSize(12).font(fontBold).text(title);
      doc.font(fontRegular).fontSize(10);
      doc.moveDown(0.3);
    };

    const addField = (label: string, value: string | null | undefined | Date) => {
      if (!value) return;
      let displayValue: string;
      if (value instanceof Date) {
        displayValue = value.toLocaleDateString("ru-RU");
      } else {
        displayValue = value;
      }
      doc.text(`${label}: ${displayValue}`, { continued: false });
    };

    addSection("ЛИЧНЫЕ ДАННЫЕ");
    addField("Email", member.email);
    addField("Телефон", member.phone);
    if (member.dateOfBirth) {
      addField("Дата рождения", new Date(member.dateOfBirth).toLocaleDateString("ru-RU"));
    }
    addField("Адрес", member.address);

    addSection("РАБОТА");
    addField("Организация (Профсоюз)", member.organization?.name);
    if (member.employmentStatus) {
      addField("Статус занятости", EMPLOYMENT_STATUS_MAP[member.employmentStatus] || member.employmentStatus);
    }
    addField("Место работы", member.workplace);
    addField("Должность", member.jobTitle);
    addField("Профессия", member.profession);

    addSection("СЕМЬЯ");
    if (member.maritalStatus) {
      addField("Семейное положение", MARITAL_STATUS_MAP[member.maritalStatus] || member.maritalStatus);
    }
    if (member.hasChildren !== null) {
      addField("Есть дети", member.hasChildren ? "Да" : "Нет");
    }

    if (member.childrenBirthDates) {
      try {
        const children = JSON.parse(member.childrenBirthDates);
        if (Array.isArray(children) && children.length > 0) {
          doc.moveDown(0.3);
          doc.text("Дети:");
          children.forEach((child: any) => {
            const gender = child.gender === "М" ? "М" : "Ж";
            const birthDate = child.birthDate ? new Date(child.birthDate).toLocaleDateString("ru-RU") : "";
            doc.text(`  • ${child.name} (${gender}) ${birthDate}`);
          });
        }
      } catch { /* noop */ }
    }

    addSection("ОБРАЗОВАНИЕ");
    addField("Образование", member.education);

    addSection("ЧЛЕНСТВО В ПРОФСОЮЗЕ");
    addField("Статус членства", statusText);
    addField("Номер профсоюзного билета", member.unionCardNumber);
    if (member.membershipJoinedAt) {
      addField("Дата вступления", new Date(member.membershipJoinedAt).toLocaleDateString("ru-RU"));
    }
    addField("Организация", member.organization?.name);

    doc.moveDown(2);
    doc.fontSize(8).fillColor("gray");
    doc.text(`Сформировано: ${new Date().toLocaleString("ru-RU")}`, { align: "left" });
    doc.text("MyUnion Pro - Система управления профсоюзом", { align: "left" });

    doc.end();

    const pdfBuffer = await new Promise<Buffer>((resolve) => {
      doc.on("end", () => resolve(Buffer.concat(chunks)));
    });

    const fileName = `anketa_${(member.lastName || "member").toLowerCase().replace(/[^a-zа-яё0-9]/gi, "_")}_${member.id.slice(0, 8)}.pdf`;
    const uint8Array = new Uint8Array(pdfBuffer);

    return new NextResponse(uint8Array, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${encodeURIComponent(fileName)}"`,
        "Content-Length": pdfBuffer.length.toString(),
      },
    });
  } catch (error) {
    console.error("[org-head/members/pdf] Error generating PDF:", error);
    return NextResponse.json({ error: "Ошибка при генерации PDF" }, { status: 500 });
  }
}
