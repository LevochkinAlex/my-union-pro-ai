import PDFDocument from "pdfkit";
import { Readable } from "stream";
import path from "path";

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
  // Новые поля для места работы
  workplace?: string; // Название компании места работы
  workplaceInn?: string; // ИНН компании места работы
  directorName?: string; // ФИО руководителя (из ФНС через Dadata)
  directorPosition?: string; // Должность руководителя (из ФНС через Dadata)
  // Старые поля (перенесены в дополнительную информацию, оставлены для обратной совместимости)
  profession?: string;
  education?: string;
  organizationName: string;
  organizationInn?: string;
  region?: string; // Регион России
}

/**
 * Создает базовый PDFDocument с настройками
 * Использует только встроенные шрифты PDFKit без явного указания имени шрифта
 * Это предотвращает попытки загрузки шрифтов из файловой системы
 */
export function createPDFDocument(options: PDFGeneratorOptions): InstanceType<typeof PDFDocument> {
  try {
    // Создаем документ без указания шрифтов
    // PDFKit по умолчанию использует Helvetica, который встроен и не требует загрузки из файлов
    // Важно: не вызываем doc.font() явно, чтобы избежать попыток загрузки шрифтов из файловой системы
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
      // Не указываем fontPath - используем только встроенные шрифты
    });

    // Важно: НЕ вызываем doc.font() здесь
    // PDFKit автоматически использует встроенный Helvetica по умолчанию
    // Вызов doc.font() заставит PDFKit искать файлы шрифтов в файловой системе
    
    return doc;
  } catch (error) {
    console.error("[pdf/generator] Ошибка создания PDFDocument:", error);
    console.error("[pdf/generator] Детали ошибки:", {
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      name: error instanceof Error ? error.name : undefined,
    });
    throw new Error(`Не удалось создать PDF документ: ${error instanceof Error ? error.message : String(error)}`);
  }
}

type ReadableLike = Pick<Readable, "on">;

/**
 * Преобразует поток в Buffer
 */
export async function streamToBuffer(stream: ReadableLike): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let resolved = false;
    
    // Таймаут на случай, если поток зависнет
    const timeout = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        reject(new Error("PDF generation timeout: stream did not complete within 30 seconds"));
      }
    }, 30000);
    
    const cleanup = () => {
      clearTimeout(timeout);
      resolved = true;
    };
    
    stream.on("data", (chunk: Buffer) => {
      if (!resolved) {
        chunks.push(chunk);
      }
    });
    
    stream.on("error", (error: Error) => {
      cleanup();
      reject(error);
    });
    
    stream.on("end", () => {
      if (!resolved) {
        cleanup();
        resolve(Buffer.concat(chunks));
      }
    });
    
    // Также обрабатываем событие 'close' на случай, если 'end' не сработает
    if ('on' in stream && typeof (stream as any).on === 'function') {
      (stream as any).on("close", () => {
        if (!resolved && chunks.length > 0) {
          cleanup();
          resolve(Buffer.concat(chunks));
        }
      });
    }
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

