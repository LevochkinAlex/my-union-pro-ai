import { Readable } from "stream";
import { createPDFDocument, UserData, formatDate, getFullName, getFullNameGenitive, streamToBuffer } from "../generator";

/**
 * Генерирует заявление о снятии с учета в профсоюзе
 */
export async function generateMembershipRemovalApplication(userData: UserData): Promise<Buffer> {
  const doc = createPDFDocument({
    title: "Заявление о снятии с учета в профсоюзе",
    subject: "Заявление о снятии с учета в Профсоюзе работников здравоохранения РФ",
    keywords: "профсоюз, заявление, снятие с учета",
  });

  const fullName = getFullName({
    firstName: userData.firstName,
    lastName: userData.lastName,
    middleName: userData.middleName,
  });

  const fullNameGenitive = getFullNameGenitive({
    firstName: userData.firstName,
    lastName: userData.lastName,
    middleName: userData.middleName,
  });

  const ppoName = userData.organizationName || "первичной профсоюзной организации";
  const currentDate = formatDate(new Date());

  // Заголовок справа вверху
  doc
    .fontSize(14)
    .font("Times-Roman")
    .text(`Председателю ${ppoName}`, { align: "right" })
    .moveDown(0.3)
    .fontSize(14)
    .text(`от ${fullNameGenitive}.`, { align: "right" })
    .moveDown(0.3)
    .fontSize(14)
    .text(userData.jobTitle || "", { align: "right" });
  
  // Добавляем название организации, если оно указано
  if (userData.organizationName) {
    doc
      .moveDown(0.3)
      .fontSize(14)
      .text(userData.organizationName, { align: "right" });
  }
  
  doc.moveDown(2);

  // Название документа по центру
  doc
    .fontSize(16)
    .font("Times-Bold")
    .text("ЗАЯВЛЕНИЕ.", { align: "center" })
    .moveDown(1.5);

  // Текст заявления
  doc
    .fontSize(14)
    .font("Times-Roman")
    .text(`Прошу снять меня с учета в Профсоюзе работников здравоохранения РФ с ${currentDate}.`, {
      align: "left",
    })
    .moveDown(1)
    .text("Основание: собственное желание.", {
      align: "left",
    })
    .moveDown(2);

  // Дата слева внизу
  doc
    .fontSize(14)
    .font("Times-Roman")
    .text(currentDate, { align: "left" })
    .moveDown(1);

  // Подпись справа внизу
  doc
    .fontSize(14)
    .font("Times-Roman")
    .text("Личная подпись", { align: "right" })
    .moveDown(0.2)
    .text("__________________", { align: "right" });

  doc.end();

  return streamToBuffer(doc as unknown as Readable);
}

