import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import PDFDocument from "pdfkit";

// Маппинги для перевода статусов
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
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }

    // Проверяем роль
    const currentUser = await db.user.findUnique({
      where: { id: session.user.id },
      select: { role: true, organizationId: true },
    });

    if (!currentUser || (currentUser.role !== "PPO_HEAD" && currentUser.role !== "SUPER_ADMIN")) {
      return NextResponse.json({ error: "Нет доступа" }, { status: 403 });
    }

    const { id } = await params;

    // Получаем данные члена
    const member = await db.user.findUnique({
      where: { id },
      include: {
        organization: { select: { name: true } },
        documents: {
          select: {
            id: true,
            type: true,
            status: true,
            title: true,
            createdAt: true,
          },
        },
      },
    });

    if (!member) {
      return NextResponse.json({ error: "Пользователь не найден" }, { status: 404 });
    }

    // Проверяем принадлежность к организации (для PPO_HEAD)
    if (currentUser.role === "PPO_HEAD" && member.organizationId !== currentUser.organizationId) {
      return NextResponse.json({ error: "Нет доступа к данному пользователю" }, { status: 403 });
    }

    // Создаём PDF
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

    // Регистрируем шрифт для кириллицы
    // PDFKit по умолчанию использует встроенные шрифты, которые поддерживают кириллицу
    doc.font("Helvetica");

    const pageWidth = doc.page.width - 100;
    
    // Заголовок
    doc.fontSize(20).text("АНКЕТА ЧЛЕНА ПРОФСОЮЗА", { align: "center" });
    doc.moveDown(0.5);
    
    // ФИО
    const fullName = [member.lastName, member.firstName, member.middleName].filter(Boolean).join(" ");
    doc.fontSize(16).text(fullName || "ФИО не указано", { align: "center" });
    doc.moveDown(0.3);
    
    // Статус
    const statusText = MEMBERSHIP_STATUS_MAP[member.membershipStatus || ""] || member.membershipStatus || "Не указан";
    doc.fontSize(10).text(`Статус: ${statusText}`, { align: "center" });
    
    if (member.unionCardNumber) {
      doc.text(`Профсоюзный билет № ${member.unionCardNumber}`, { align: "center" });
    }
    doc.moveDown(1);

    // Функция добавления секции
    const addSection = (title: string) => {
      doc.moveDown(0.5);
      doc.fontSize(12).font("Helvetica-Bold").text(title);
      doc.font("Helvetica").fontSize(10);
      doc.moveDown(0.3);
    };

    // Функция добавления поля
    const addField = (label: string, value: string | null | undefined | Date) => {
      if (!value) return;
      let displayValue = value;
      if (value instanceof Date) {
        displayValue = value.toLocaleDateString("ru-RU");
      }
      doc.text(`${label}: ${displayValue}`, { continued: false });
    };

    // ЛИЧНЫЕ ДАННЫЕ
    addSection("ЛИЧНЫЕ ДАННЫЕ");
    addField("Email", member.email);
    addField("Телефон", member.phone);
    addField("Телефон регистрации", member.authPhone);
    if (member.dateOfBirth) {
      addField("Дата рождения", new Date(member.dateOfBirth).toLocaleDateString("ru-RU"));
    }
    addField("Адрес", member.address);
    addField("Город для скидок", member.preferredDiscountCity);

    // РАБОТА
    addSection("РАБОТА");
    addField("Организация (Профсоюз)", member.organization?.name);
    if (member.employmentStatus) {
      addField("Статус занятости", EMPLOYMENT_STATUS_MAP[member.employmentStatus] || member.employmentStatus);
    }
    addField("Место работы", member.workplace);
    addField("ИНН работодателя", member.workplaceInn);
    addField("Должность", member.jobTitle);
    addField("Профессия", member.profession);
    addField("Руководитель", member.directorName);
    addField("Должность руководителя", member.directorPosition);

    // Профессии (JSON)
    if (member.professions) {
      try {
        const professions = JSON.parse(member.professions);
        if (Array.isArray(professions) && professions.length > 0) {
          doc.moveDown(0.3);
          doc.text("Профессии:");
          professions.forEach((p: any) => {
            doc.text(`  • ${p.name}${p.experience ? ` (опыт: ${p.experience})` : ""}`);
          });
        }
      } catch {}
    }

    // СЕМЬЯ
    addSection("СЕМЬЯ");
    if (member.maritalStatus) {
      addField("Семейное положение", MARITAL_STATUS_MAP[member.maritalStatus] || member.maritalStatus);
    }
    addField("Информация о супруге", member.spouseInfo);
    if (member.hasChildren !== null) {
      addField("Есть дети", member.hasChildren ? "Да" : "Нет");
    }
    addField("О детях", member.childrenInfo);

    // Дети (JSON)
    if (member.childrenBirthDates) {
      try {
        const children = JSON.parse(member.childrenBirthDates);
        if (Array.isArray(children) && children.length > 0) {
          doc.moveDown(0.3);
          doc.text("Дети:");
          children.forEach((child: any) => {
            const gender = child.gender === "М" ? "👦" : "👧";
            const birthDate = child.birthDate ? new Date(child.birthDate).toLocaleDateString("ru-RU") : "";
            doc.text(`  • ${child.name} ${gender} ${birthDate}`);
          });
        }
      } catch {}
    }

    // ОБРАЗОВАНИЕ
    addSection("ОБРАЗОВАНИЕ");
    addField("Образование", member.education);

    // Учебные заведения (JSON)
    if (member.educations) {
      try {
        const educations = JSON.parse(member.educations);
        if (Array.isArray(educations) && educations.length > 0) {
          doc.moveDown(0.3);
          doc.text("Учебные заведения:");
          educations.forEach((edu: any) => {
            doc.text(`  • ${edu.institution} (${edu.level}, ${edu.specialty}, ${edu.year})`);
          });
        }
      } catch {}
    }

    // Повышение квалификации (JSON)
    if (member.training) {
      try {
        const trainings = JSON.parse(member.training);
        if (Array.isArray(trainings) && trainings.length > 0) {
          doc.moveDown(0.3);
          doc.text("Повышение квалификации:");
          trainings.forEach((t: any) => {
            doc.text(`  • ${t.name} (${t.year})${t.description ? ` - ${t.description}` : ""}`);
          });
        }
      } catch {}
    }

    // НАГРАДЫ
    if (member.awards) {
      try {
        const awards = JSON.parse(member.awards);
        if (Array.isArray(awards) && awards.length > 0) {
          addSection("НАГРАДЫ");
          awards.forEach((a: any) => {
            doc.text(`  • ${a.type || "Награда"}: ${a.description} (${a.year})`);
          });
        }
      } catch {}
    }

    // ЧЛЕНСТВО
    addSection("ЧЛЕНСТВО В ПРОФСОЮЗЕ");
    addField("Статус членства", MEMBERSHIP_STATUS_MAP[member.membershipStatus || ""] || member.membershipStatus);
    addField("Номер профсоюзного билета", member.unionCardNumber);
    if (member.membershipJoinedAt) {
      addField("Дата вступления", new Date(member.membershipJoinedAt).toLocaleDateString("ru-RU"));
    }
    addField("Организация", member.organization?.name);

    // О СЕБЕ
    if (member.aboutMe || member.hobbies) {
      addSection("О СЕБЕ");
      addField("О себе", member.aboutMe);
      addField("Хобби", member.hobbies);
    }

    // Дополнительная информация
    if (member.additionalInfo) {
      addSection("ДОПОЛНИТЕЛЬНАЯ ИНФОРМАЦИЯ");
      doc.text(member.additionalInfo);
    }

    // Футер
    doc.moveDown(2);
    doc.fontSize(8).fillColor("gray");
    doc.text(`Сформировано: ${new Date().toLocaleString("ru-RU")}`, { align: "left" });
    doc.text("MyUnion Pro - Система управления профсоюзом", { align: "left" });

    // Завершаем документ
    doc.end();

    // Ждём завершения генерации
    const pdfBuffer = await new Promise<Buffer>((resolve) => {
      doc.on("end", () => {
        resolve(Buffer.concat(chunks));
      });
    });

    // Формируем имя файла
    const fileName = `anketa_${(member.lastName || "member").toLowerCase().replace(/[^a-zа-яё0-9]/gi, "_")}_${member.id.slice(0, 8)}.pdf`;

    return new NextResponse(pdfBuffer, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${encodeURIComponent(fileName)}"`,
        "Content-Length": pdfBuffer.length.toString(),
      },
    });
  } catch (error) {
    console.error("[members/pdf] Error generating PDF:", error);
    return NextResponse.json(
      { error: "Ошибка при генерации PDF" },
      { status: 500 }
    );
  }
}

