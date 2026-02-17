import { Readable } from "stream";
import { createPDFDocument, UserData, formatDate, getFullName, getFullNameGenitive, streamToBuffer } from "../generator";

/**
 * Генерирует заявление о вступлении в профсоюз
 * Формат согласно образцу: Заявление о вступлении.pdf
 * Использует только встроенные шрифты PDFKit без явного указания имени шрифта
 */
export async function generateMembershipApplication(userData: UserData): Promise<Buffer> {
  let doc;
  try {
    doc = createPDFDocument({
      title: "Заявление о вступлении в профсоюз",
      subject: "Заявление о вступлении в Профсоюз работников здравоохранения РФ",
      keywords: "профсоюз, заявление, вступление",
    });
  } catch (error) {
    console.error("[pdf/membershipApplication] Ошибка создания PDFDocument:", error);
    throw new Error(`Не удалось создать PDF документ: ${error instanceof Error ? error.message : String(error)}`);
  }

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

  // Используем только шрифт по умолчанию (Helvetica) без явного указания
  // Это предотвращает ошибки загрузки шрифтов из файловой системы
  
  try {
    // Заголовок справа вверху
    doc
      .fontSize(14)
      .text(`Председателю ${ppoName}`, { align: "right" })
    .moveDown(0.3)
    .fontSize(14)
    .text(`от ${fullNameGenitive}`, { align: "right" })
    .moveDown(0.3)
    .fontSize(14)
    .text(userData.jobTitle || "", { align: "right" });
  
  // Добавляем название места работы, если оно указано (приоритет новому полю)
  if (userData.workplace) {
    doc
      .moveDown(0.3)
      .fontSize(14)
      .text(userData.workplace, { align: "right" });
  } else if (userData.organizationName) {
    // Fallback на старое поле организации
    doc
      .moveDown(0.3)
      .fontSize(14)
      .text(userData.organizationName, { align: "right" });
  }
  
  doc.moveDown(2);

  // Название документа по центру (без точки после заголовка)
  doc
    .fontSize(16)
    .text("ЗАЯВЛЕНИЕ", { align: "center" })
    .moveDown(1.5);

  // Текст заявления
  doc
    .fontSize(14)
    .text(`Прошу принять меня в Профсоюз работников здравоохранения РФ с ${currentDate}`, {
      align: "left",
    })
    .moveDown(1)
    .text("С уставом Профсоюза работников здравоохранения РФ ознакомлен(а) и обязуюсь исполнять.", {
      align: "left",
    })
    .moveDown(2);

  // Дата слева внизу
  doc
    .fontSize(14)
    .text(currentDate, { align: "left" })
    .moveDown(1);

    // Подпись справа внизу
    doc
      .fontSize(14)
      .text("Личная подпись", { align: "right" })
      .moveDown(0.2)
      .text("__________________", { align: "right" });
  } catch (error) {
    console.error("[pdf/membershipApplication] Ошибка при генерации PDF:", error);
    // Если произошла ошибка, пробуем закрыть документ и выбросить ошибку
    try {
      doc.end();
    } catch (closeError) {
      // Игнорируем ошибку закрытия
    }
    throw new Error(`Ошибка генерации PDF: ${error instanceof Error ? error.message : String(error)}`);
  }

  doc.end();

  return streamToBuffer(doc as unknown as Readable);
}
