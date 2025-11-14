import PDFDocument from "pdfkit";
import { Readable } from "stream";

export interface PDFGeneratorOptions {
  title: string;
  author?: string;
  subject?: string;
  keywords?: string;
}

export interface UserData {
  firstName: string;
  lastName: string;
  middleName?: string;
  dateOfBirth: string;
  address: string;
  phone: string;
  jobTitle: string;
  profession: string;
  education: string;
  organizationName: string;
  organizationInn?: string;
  region?: string; // Регион России
}

/**
 * Создает базовый PDFDocument с настройками
 */
export function createPDFDocument(options: PDFGeneratorOptions): InstanceType<typeof PDFDocument> {
  const doc = new PDFDocument({
    size: "A4",
    margins: {
      top: 50,
      bottom: 50,
      left: 50,
      right: 50,
    },
    info: {
      Title: options.title,
      Author: options.author || "MyUnion Pro",
      Subject: options.subject,
      Keywords: options.keywords,
    },
  });

  return doc;
}

type ReadableLike = Pick<Readable, "on">;

/**
 * Преобразует поток в Buffer
 */
export async function streamToBuffer(stream: ReadableLike): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    stream.on("data", (chunk) => chunks.push(chunk));
    stream.on("error", reject);
    stream.on("end", () => resolve(Buffer.concat(chunks)));
  });
}

/**
 * Форматирует дату в российский формат
 */
export function formatDate(date: string | Date): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return d.toLocaleDateString("ru-RU");
}

/**
 * Получает полное ФИО
 */
export function getFullName(user: { firstName: string; lastName: string; middleName?: string }): string {
  return `${user.lastName} ${user.firstName}${user.middleName ? ` ${user.middleName}` : ""}`;
}

/**
 * Получает ФИО в родительном падеже (примитивная версия)
 * TODO: Использовать библиотеку для склонения
 */
export function getFullNameGenitive(user: { firstName: string; lastName: string; middleName?: string }): string {
  // Упрощенная версия - добавляем окончания для родительного падежа
  // В реальном проекте лучше использовать библиотеку типа "petrovich"
  const lastNameGenitive = user.lastName.endsWith("ов") || user.lastName.endsWith("ев") || user.lastName.endsWith("ин")
    ? user.lastName + "а"
    : user.lastName.endsWith("а") || user.lastName.endsWith("я")
    ? user.lastName.slice(0, -1) + "ы"
    : user.lastName + "а";
  
  const firstNameGenitive = user.firstName.endsWith("а") || user.firstName.endsWith("я")
    ? user.firstName.slice(0, -1) + "ы"
    : user.firstName + "а";
  
  const middleNameGenitive = user.middleName
    ? user.middleName.endsWith("ич")
      ? user.middleName + "а"
      : user.middleName.endsWith("на")
      ? user.middleName.slice(0, -1) + "ы"
      : user.middleName + "а"
    : "";
  
  return `${lastNameGenitive} ${firstNameGenitive}${middleNameGenitive ? ` ${middleNameGenitive}` : ""}`;
}

