import PDFDocument from "pdfkit";
import { createPDFDocument, UserData, formatDate, getFullName, streamToBuffer } from "../generator";

/**
 * Генерирует заявление о перечислении членских взносов
 */
export async function generateDuesApplication(userData: UserData): Promise<Buffer> {
  const doc = createPDFDocument({
    title: "Заявление о перечислении членских взносов",
    subject: "Заявление о взносах в МООП РЗ",
    keywords: "профсоюз, заявление, взносы",
  });

  const fullName = getFullName({
    firstName: userData.firstName,
    lastName: userData.lastName,
    middleName: userData.middleName,
  });

  // Заголовок
  doc
    .fontSize(14)
    .font("Helvetica-Bold")
    .text("Председателю Межрегиональной общественной", { align: "right" })
    .text("организации профсоюза работников здравоохранения", { align: "right" })
    .moveDown(0.5)
    .text(`от ${fullName}`, { align: "right" })
    .moveDown(2);

  // Название документа
  doc
    .fontSize(16)
    .font("Helvetica-Bold")
    .text("ЗАЯВЛЕНИЕ", { align: "center" })
    .text("о перечислении членских взносов", { align: "center", fontSize: 14 })
    .moveDown(1.5);

  // Текст заявления
  doc
    .fontSize(12)
    .font("Helvetica")
    .text(
      "Прошу производить ежемесячное удержание из моей заработной платы членских взносов в размере 1% (один процент) и перечислять их в Межрегиональную общественную организацию профсоюза работников здравоохранения (МООП РЗ).",
      {
        align: "justify",
        indent: 30,
      }
    )
    .moveDown(1.5);

  // Реквизиты для перечисления (примерные, нужно уточнить)
  doc
    .fontSize(12)
    .font("Helvetica-Bold")
    .text("Реквизиты для перечисления взносов:", { underline: true })
    .moveDown(0.5)
    .font("Helvetica")
    .text("Получатель: Межрегиональная общественная организация профсоюза работников здравоохранения")
    .text("ИНН: [указать ИНН]")
    .text("КПП: [указать КПП]")
    .text("Расчетный счет: [указать р/с]")
    .text("Банк: [указать банк]")
    .text("БИК: [указать БИК]")
    .text("Корр. счет: [указать к/с]")
    .moveDown(1.5);

  // Персональные данные
  doc
    .fontSize(12)
    .font("Helvetica-Bold")
    .text("Мои данные:", { underline: true })
    .moveDown(0.5)
    .font("Helvetica");

  const personalData = [
    ["ФИО:", fullName],
    ["Дата рождения:", formatDate(userData.dateOfBirth)],
    ["Должность:", userData.jobTitle],
    ["Организация:", userData.organizationName],
    ["Адрес:", userData.address],
    ["Телефон:", userData.phone],
  ];

  if (userData.organizationInn) {
    personalData.push(["ИНН организации:", userData.organizationInn]);
  }

  personalData.forEach(([label, value]) => {
    doc
      .font("Helvetica-Bold")
      .text(label, { continued: true })
      .font("Helvetica")
      .text(` ${value}`)
      .moveDown(0.5);
  });

  doc.moveDown(1.5);

  // Примечание
  doc
    .fontSize(11)
    .font("Helvetica-Oblique")
    .text(
      "Примечание: Членские взносы составляют 1% от заработной платы в соответствии с Уставом МООП РЗ.",
      {
        align: "justify",
      }
    )
    .moveDown(2);

  // Подпись и дата
  doc
    .fontSize(12)
    .font("Helvetica")
    .text(`Дата: ${formatDate(new Date())}`, { continued: false })
    .moveDown(2)
    .text("Подпись: __________________ / " + fullName + " /", { continued: false });

  doc.end();

  return streamToBuffer(doc);
}

