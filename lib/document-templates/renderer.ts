import { User, Organization, DocumentTemplate } from "@prisma/client";
import puppeteer from "puppeteer";
import { declineNameToGenitive } from "../dadata";

/**
 * Доступные переменные для шаблонов документов
 */
export interface TemplateVariables {
  // ФИО
  firstName?: string;
  lastName?: string;
  middleName?: string;
  fullName?: string; // Фамилия Имя Отчество
  fullNameGenitive?: string; // Фамилия Имя Отчество в родительном падеже
  
  // Контактные данные
  phone?: string;
  email?: string;
  address?: string;
  
  // Профессиональная информация
  jobTitle?: string;
  profession?: string;
  education?: string;
  
  // Организация
  organizationName?: string;
  organizationInn?: string;
  organizationChairmanName?: string; // ФИО председателя организации
  organizationChairmanJobTitle?: string; // Должность председателя организации
  organizationChairmanFullName?: string; // Полное ФИО председателя с должностью (для шапки "Кому")
  
  // Даты
  dateOfBirth?: string; // Формат: ДД.ММ.ГГГГ
  currentDate?: string; // Текущая дата в формате: ДД.ММ.ГГГГ
  
  // Дополнительные переменные
  [key: string]: string | undefined;
}

/**
 * Извлекает переменные из пользователя для подстановки в шаблон
 */
export async function extractUserVariables(
  user: User & { organization?: Organization | null }
): Promise<TemplateVariables> {
  const fullName = `${user.lastName || ""} ${user.firstName || ""} ${user.middleName || ""}`.trim();
  
  // Получаем ФИО в родительном падеже
  let fullNameGenitive = "";
  try {
    fullNameGenitive = await declineNameToGenitive(
      user.lastName || "",
      user.firstName || "",
      user.middleName || undefined
    );
  } catch (error) {
    console.error("[document-templates] Error declining name:", error);
    fullNameGenitive = fullName; // Fallback на обычное ФИО
  }
  
  // Форматируем дату рождения
  let dateOfBirth = "";
  if (user.dateOfBirth) {
    const date = new Date(user.dateOfBirth);
    dateOfBirth = `${date.getDate().toString().padStart(2, "0")}.${(date.getMonth() + 1).toString().padStart(2, "0")}.${date.getFullYear()}`;
  }
  
  // Форматируем текущую дату
  const now = new Date();
  const currentDate = `${now.getDate().toString().padStart(2, "0")}.${(now.getMonth() + 1).toString().padStart(2, "0")}.${now.getFullYear()}`;
  
  return {
    firstName: user.firstName || "",
    lastName: user.lastName || "",
    middleName: user.middleName || "",
    fullName,
    fullNameGenitive,
    phone: user.phone || "",
    email: user.email || "",
    address: user.address || "",
    jobTitle: user.jobTitle ? `работающего(ей) ${user.jobTitle}` : "",
    profession: user.profession || "",
    education: user.education || "",
    organizationName: user.organization?.name || user.organizationName || "",
    organizationInn: user.organization?.inn || "",
    organizationChairmanName: user.organization?.chairmanName || "",
    organizationChairmanJobTitle: user.organization?.chairmanJobTitle || "",
    organizationChairmanFullName: user.organization?.chairmanName && user.organization?.chairmanJobTitle
      ? `${user.organization.chairmanJobTitle} ${user.organization.chairmanName}`
      : user.organization?.chairmanName || "",
    dateOfBirth,
    currentDate,
  };
}

/**
 * Рендерит HTML шаблон, заменяя переменные вида {{variableName}}
 */
export function renderTemplate(htmlTemplate: string, variables: TemplateVariables): string {
  let rendered = htmlTemplate;
  
  // Заменяем все переменные вида {{variableName}}
  for (const [key, value] of Object.entries(variables)) {
    const regex = new RegExp(`\\{\\{${key}\\}\\}`, "g");
    rendered = rendered.replace(regex, value || "");
  }
  
  // Удаляем оставшиеся неиспользованные переменные (опционально)
  // rendered = rendered.replace(/\{\{[^}]+\}\}/g, "");
  
  return rendered;
}

/**
 * Генерирует PDF из HTML используя Puppeteer
 */
export async function generatePDFFromHTML(html: string): Promise<Buffer> {
  // Используем системный Chromium, если доступен
  const executablePath = process.env.PUPPETEER_EXECUTABLE_PATH || 
    (process.platform === "linux" ? "/usr/bin/chromium-browser" : undefined);
  
  const launchOptions: Parameters<typeof puppeteer.launch>[0] = {
    headless: true,
    args: [
      "--no-sandbox", 
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-accelerated-2d-canvas",
      "--disable-gpu",
    ],
  };
  
  if (executablePath) {
    launchOptions.executablePath = executablePath;
    console.log(`[document-templates] Using Puppeteer executable: ${executablePath}`);
  }
  
  const browser = await puppeteer.launch(launchOptions);
  
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "networkidle0" });
    
    const pdfBuffer = await page.pdf({
      format: "A4",
      margin: {
        top: "2cm",
        right: "2cm",
        bottom: "2cm",
        left: "2cm",
      },
      printBackground: true,
    });
    
    return Buffer.from(pdfBuffer);
  } finally {
    await browser.close();
  }
}

/**
 * Генерирует PDF документ из шаблона для пользователя
 */
export async function generateDocumentFromTemplate(
  template: DocumentTemplate,
  user: User & { organization?: Organization | null }
): Promise<Buffer> {
  // Извлекаем переменные из пользователя
  const variables = await extractUserVariables(user);
  
  // Рендерим HTML шаблон
  const renderedHTML = renderTemplate(template.htmlContent, variables);
  
  // Добавляем CSS стили, если они есть
  const fullHTML = template.cssStyles
    ? `<style>${template.cssStyles}</style>${renderedHTML}`
    : renderedHTML;
  
  // Генерируем PDF
  return generatePDFFromHTML(fullHTML);
}

