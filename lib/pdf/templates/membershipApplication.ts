import PDFDocument from "pdfkit";
import { createPDFDocument, UserData, formatDate, getFullName, streamToBuffer } from "../generator";

/**
 * Генерирует заявление о вступлении в профсоюз
 */
export async function generateMembershipApplication(userData: UserData): Promise<Buffer> {
  const doc = createPDFDocument({
    title: "Заявление о вступлении в профсоюз",
    subject: "Заявление о вступлении в МООП РЗ",
    keywords: "профсоюз, заявление, вступление",
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
    .moveDown(1.5);

  // Текст заявления
  doc
    .fontSize(12)
    .font("Helvetica")
    .text("Прошу принять меня в члены Межрегиональной общественной организации профсоюза работников здравоохранения (МООП РЗ).", {
      align: "justify",
      indent: 30,
    })
    .moveDown(1.5);

  // Персональные данные
  doc
    .fontSize(12)
    .font("Helvetica-Bold")
    .text("Персональные данные:", { underline: true })
    .moveDown(0.5)
    .font("Helvetica");

  const personalData = [
    ["ФИО:", fullName],
    ["Дата рождения:", formatDate(userData.dateOfBirth)],
    ["Адрес проживания:", userData.address],
    ["Телефон:", userData.phone],
    ["Должность:", userData.jobTitle],
    ["Профессия:", userData.profession],
    ["Образование:", userData.education],
    ["Организация:", userData.organizationName],
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

  // Согласие на обработку персональных данных
  doc
    .fontSize(11)
    .font("Helvetica")
    .text(
      "Настоящим я даю согласие на обработку моих персональных данных Межрегиональной общественной организацией профсоюза работников здравоохранения в соответствии с Федеральным законом от 27.07.2006 № 152-ФЗ \"О персональных данных\".",
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

