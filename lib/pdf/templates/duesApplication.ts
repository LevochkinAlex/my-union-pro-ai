import { Readable } from "stream";
import { createPDFDocument, UserData, formatDate, getFullName, streamToBuffer } from "../generator";

/**
 * Генерирует заявление о перечислении членских взносов
 * Использует только встроенные шрифты PDFKit без явного указания имени шрифта
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

  // Используем только шрифт по умолчанию (Helvetica) без явного указания
  // Это предотвращает ошибки загрузки шрифтов из файловой системы

  // Заголовок с данными о месте работы и руководителе
  doc
    .fontSize(14);
  
  // Если есть данные о месте работы и руководителе
  if (userData.workplace && userData.directorName && userData.directorPosition) {
    doc
      .text(`${userData.directorPosition}`, { align: "right" })
      .text(`${userData.workplace}`, { align: "right" })
      .text(`${userData.directorName}`, { align: "right" })
      .moveDown(0.5)
      .text(`от ${fullName}`, { align: "right" })
      .text(`${userData.jobTitle}`, { align: "right" })
      .moveDown(2);
  } else {
    // Fallback на старый формат
    doc
      .text("Председателю Межрегиональной общественной", { align: "right" })
      .text("организации профсоюза работников здравоохранения", { align: "right" })
      .moveDown(0.5)
      .text(`от ${fullName}`, { align: "right" })
      .moveDown(2);
  }

  // Название документа
  doc
    .fontSize(16)
    .text("ЗАЯВЛЕНИЕ", { align: "center" })
    .fontSize(14)
    .text("о перечислении членских взносов", { align: "center" })
    .moveDown(1.5);

  // Текст заявления
  doc
    .fontSize(12)
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
    .text("Реквизиты для перечисления взносов:", { underline: true })
    .moveDown(0.5)
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
    .text("Мои данные:", { underline: true })
    .moveDown(0.5);

  const personalData = [
    ["ФИО:", fullName],
    ["Дата рождения:", formatDate(userData.dateOfBirth)],
    ["Должность:", userData.jobTitle],
  ];

  // Добавляем данные о месте работы (приоритет новым полям)
  if (userData.workplace) {
    personalData.push(["Место работы:", userData.workplace]);
    if (userData.workplaceInn) {
      personalData.push(["ИНН места работы:", userData.workplaceInn]);
    }
  } else if (userData.organizationName) {
    // Fallback на старое поле
    personalData.push(["Организация:", userData.organizationName]);
    if (userData.organizationInn) {
      personalData.push(["ИНН организации:", userData.organizationInn]);
    }
  }

  personalData.push(
    ["Адрес:", userData.address],
    ["Телефон:", userData.phone]
  );

  personalData.forEach(([label, value]) => {
    doc
      .text(label, { continued: true })
      .text(` ${value}`)
      .moveDown(0.5);
  });

  doc.moveDown(1.5);

  // Примечание
  doc
    .fontSize(11)
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
    .text(`Дата: ${formatDate(new Date())}`, { continued: false })
    .moveDown(2)
    .text("Подпись: __________________ / " + fullName + " /", { continued: false });

  doc.end();

  return streamToBuffer(doc as unknown as Readable);
}
