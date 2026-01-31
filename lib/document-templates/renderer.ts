import { User, Organization, DocumentTemplate } from "@prisma/client";
import puppeteer from "puppeteer";
import { declineNameToGenitive } from "../dadata";
import type { TemplateVariables } from "./variables";

export { type TemplateVariables, TEMPLATE_VARIABLES_FOR_EDITOR } from "./variables";

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
    // Место работы и руководитель
    workplace: (user as any).workplace || "",
    workplaceInn: (user as any).workplaceInn || "",
    directorName: (user as any).directorName || "",
    directorPosition: (user as any).directorPosition || "",
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

/** Пути к Chrome на macOS для fallback, если бандл Puppeteer не скачан */
const MACOS_CHROME_PATHS = [
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/Applications/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing",
  "/Applications/Chromium.app/Contents/MacOS/Chromium",
];

async function resolveChromeExecutablePath(): Promise<string | undefined> {
  const fs = await import("fs/promises");
  let executablePath = process.env.PUPPETEER_EXECUTABLE_PATH;

  const pathExists = async (p: string): Promise<boolean> => {
    try {
      await fs.access(p);
      return true;
    } catch {
      return false;
    }
  };

  if (executablePath && (await pathExists(executablePath))) {
    return executablePath;
  }

  try {
    executablePath = puppeteer.executablePath();
    if (executablePath && (await pathExists(executablePath))) {
      return executablePath;
    }
  } catch {
    // игнорируем
  }

  if (process.platform === "darwin") {
    for (const p of MACOS_CHROME_PATHS) {
      if (await pathExists(p)) {
        console.log(`[document-templates] Using system Chrome: ${p}`);
        return p;
      }
    }
  }

  return undefined;
}

/**
 * Генерирует PDF из HTML используя Puppeteer
 */
export async function generatePDFFromHTML(html: string): Promise<Buffer> {
  const executablePath = await resolveChromeExecutablePath();
  if (executablePath) {
    console.log(`[document-templates] Using Chrome: ${executablePath}`);
  } else {
    console.warn(`[document-templates] No Chrome executable found. Set PUPPETEER_EXECUTABLE_PATH or install: npx puppeteer browsers install chrome`);
  }
  
  const launchOptions: Parameters<typeof puppeteer.launch>[0] = {
    headless: true,
    args: [
      "--no-sandbox", 
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-accelerated-2d-canvas",
      "--disable-gpu",
      "--disable-software-rasterizer",
      "--disable-extensions",
      "--disable-background-timer-throttling",
      "--disable-backgrounding-occluded-windows",
      "--disable-renderer-backgrounding",
    ],
  };
  
  if (executablePath) {
    launchOptions.executablePath = executablePath;
  }
  
  let browser;
  try {
    browser = await puppeteer.launch(launchOptions);
  } catch (launchError) {
    const msg = launchError instanceof Error ? launchError.message : String(launchError);
    if (msg.includes("executablePath") || msg.includes("Browser was not found")) {
      throw new Error(
        "Chrome не найден. Установите Google Chrome или выполните: npx puppeteer browsers install chrome. " +
        "Либо задайте PUPPETEER_EXECUTABLE_PATH в .env (путь к Chrome)."
      );
    }
    throw launchError;
  }
  
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

