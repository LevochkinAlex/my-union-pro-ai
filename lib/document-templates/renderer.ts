import { User, Organization, DocumentTemplate } from "@prisma/client";
import fs from "fs/promises";
import os from "os";
import path from "path";
import puppeteer from "puppeteer";
import { declineNameToGenitive, declineNameToDative } from "../dadata";
import type { TemplateVariables } from "./variables";

/** Парсит строку ФИО "Фамилия Имя Отчество" в части */
function parseFullName(fullName: string): { lastName: string; firstName: string; middleName?: string } {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { lastName: "", firstName: "" };
  if (parts.length === 1) return { lastName: parts[0], firstName: "" };
  return {
    lastName: parts[0],
    firstName: parts[1],
    middleName: parts.slice(2).join(" ") || undefined,
  };
}

/**
 * Извлекает переменные из пользователя для подстановки в шаблон
 */
export async function extractUserVariables(
  user: User & { organization?: Organization | null }
): Promise<TemplateVariables> {
  const fullName = `${user.lastName || ""} ${user.firstName || ""} ${user.middleName || ""}`.trim();
  
  // Получаем ФИО в родительном падеже (от кого?)
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

  // ФИО председателя в дательном падеже (Председателю кому?)
  let organizationChairmanNameDative = "";
  const chairmanName = user.organization?.chairmanName || "";
  if (chairmanName) {
    try {
      const { lastName, firstName, middleName } = parseFullName(chairmanName);
      if (lastName && firstName) {
        organizationChairmanNameDative = await declineNameToDative(lastName, firstName, middleName);
      }
    } catch (error) {
      console.error("[document-templates] Error declining chairman name:", error);
    }
  }
  
  // Форматируем дату рождения
  let dateOfBirth = "";
  if (user.dateOfBirth) {
    const date = new Date(user.dateOfBirth);
    dateOfBirth = `${date.getDate().toString().padStart(2, "0")}.${(date.getMonth() + 1).toString().padStart(2, "0")}.${date.getFullYear()}`;
  }
  
  // Форматируем текущую дату (без точки в конце)
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
    organizationChairmanNameDative,
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

/** Пути к Chrome на macOS для fallback */
const MACOS_CHROME_PATHS = [
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/Applications/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing",
  "/Applications/Chromium.app/Contents/MacOS/Chromium",
];

/** Стандартные пути Chrome/Chromium на Linux (VDS, Docker) */
const LINUX_CHROME_PATHS = [
  "/usr/bin/google-chrome-stable",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
  "/usr/bin/chromium-browser",
  "/snap/bin/chromium",
];

const LINUX_PUPPETEER_CACHE_ROOTS = [
  () => path.join(os.homedir(), ".cache", "puppeteer", "chrome"),
  "/root/.cache/puppeteer/chrome",
];

async function pathExists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

/**
 * Скачанный `npx puppeteer browsers install chrome` лежит в ~/.cache/puppeteer/chrome/<build>/chrome-linux64/chrome.
 * На проде иногда homedir процесса ≠ root при установке браузера — перебираем типичные каталоги.
 */
async function discoverLinuxPuppeteerCachedChrome(): Promise<string | undefined> {
  if (process.platform !== "linux") return undefined;

  const seen = new Set<string>();
  for (const rootRef of LINUX_PUPPETEER_CACHE_ROOTS) {
    const root = typeof rootRef === "function" ? rootRef() : rootRef;
    if (seen.has(root)) continue;
    seen.add(root);
    let dirs: string[];
    try {
      dirs = await fs.readdir(root);
    } catch {
      continue;
    }
    for (const dir of dirs) {
      const candidate = path.join(root, dir, "chrome-linux64", "chrome");
      if (await pathExists(candidate)) {
        console.log(`[document-templates] Using Puppeteer cache Chrome: ${candidate}`);
        return candidate;
      }
    }
  }
  return undefined;
}

async function resolveChromeExecutablePath(): Promise<string | undefined> {
  let executablePath = process.env.PUPPETEER_EXECUTABLE_PATH;

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

  const cached = await discoverLinuxPuppeteerCachedChrome();
  if (cached) return cached;

  if (process.platform === "darwin") {
    for (const p of MACOS_CHROME_PATHS) {
      if (await pathExists(p)) {
        console.log(`[document-templates] Using system Chrome: ${p}`);
        return p;
      }
    }
  }

  if (process.platform === "linux") {
    for (const p of LINUX_CHROME_PATHS) {
      if (await pathExists(p)) {
        console.log(`[document-templates] Using system Chrome: ${p}`);
        return p;
      }
    }
  }

  return undefined;
}

/** Сообщение для ответа API в проде, если PDF не собрался из‑за отсутствия Chrome/Puppeteer */
export function getPdfChromeMissingHint(): string {
  return (
    "На сервере не найден браузер для печати PDF (Puppeteer). " +
    "Администратору: на ВДС из каталога проекта выполнить «npx puppeteer browsers install chrome» " +
    "или задать PUPPETEER_EXECUTABLE_PATH на системный Chromium/Chrome."
  );
}

export function isLikelyMissingChromeForPdf(error: unknown): boolean {
  const msg = error instanceof Error ? error.message : String(error);
  return /Chrome не найден|Browser was not found|Could not find Chrome|Failed to launch the browser|No Chrome executable found|PUPPETEER_EXECUTABLE_PATH/i.test(
    msg
  );
}

/** Краткая подсказка в ответе API (прод), если PDF упал по типовой причине */
export function getPublicPdfErrorDetail(error: unknown): string | undefined {
  if (isLikelyMissingChromeForPdf(error)) return getPdfChromeMissingHint();
  const msg = error instanceof Error ? error.message : String(error);
  if (
    /error while loading shared libraries|cannot open shared object file|libnss3|libatk|libgbm|libdrm|libxkbcommon|libXcomposite|libXdamage|libXfixes|libxrandr|libcups|libasound|libgtk|libglib/i.test(
      msg
    )
  ) {
    return (
      "На сервере не хватает системных библиотек для Chrome (PDF). " +
      "Установите зависимости, например: apt-get install -y ca-certificates fonts-liberation libasound2 " +
      "libatk-bridge2.0-0 libatk1.0-0 libcairo2 libcups2 libdbus-1-3 libdrm2 libgbm1 libglib2.0-0 libgtk-3-0 libnspr4 libnss3 " +
      "libpango-1.0-0 libx11-6 libx11-xcb1 libxcb1 libxcomposite1 libxdamage1 libxext6 libxfixes3 libxrandr2 libxshmfence1 xdg-utils — " +
      "или пакет google-chrome-stable с dl.google.com (подтянет зависимости)."
    );
  }
  return undefined;
}

/** Убирает мусор, при необходимости оборачивает фрагмент в полный документ (Puppeteer стабильнее с DOCTYPE). */
export function normalizeHtmlForPdf(raw: string): string {
  if (raw == null || typeof raw !== "string") {
    throw new Error("HTML для PDF не задан");
  }
  let s = raw.replace(/\0/g, "").trim();
  if (!s) {
    throw new Error("HTML для PDF пуст");
  }
  if (!/^<!DOCTYPE/i.test(s) && !/^<html/i.test(s)) {
    s = `<!DOCTYPE html><html lang="ru"><head><meta charset="UTF-8" /></head><body>${s}</body></html>`;
  }
  return s;
}

const PDF_MARGIN = { top: "2cm", right: "2cm", bottom: "2.2cm", left: "2cm" } as const;

const DEFAULT_LAUNCH_ARGS = [
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
  "--font-render-hinting=none",
];

/**
 * Генерирует PDF из HTML используя Puppeteer
 */
export async function generatePDFFromHTML(html: string): Promise<Buffer> {
  const normalized = normalizeHtmlForPdf(html);
  const executablePath = await resolveChromeExecutablePath();
  if (executablePath) {
    console.log(`[document-templates] Using Chrome: ${executablePath}`);
  } else {
    console.warn(
      `[document-templates] No Chrome executable found. Set PUPPETEER_EXECUTABLE_PATH or install: npx puppeteer browsers install chrome`
    );
  }

  const buildLaunchOptions = (headless: boolean | "shell"): Parameters<typeof puppeteer.launch>[0] => ({
    headless,
    args: DEFAULT_LAUNCH_ARGS,
    ...(executablePath ? { executablePath } : {}),
  });

  let browser;
  try {
    browser = await puppeteer.launch(buildLaunchOptions("shell"));
  } catch (shellErr) {
    console.warn("[document-templates] headless=shell launch failed, retry headless=true:", shellErr);
    try {
      browser = await puppeteer.launch(buildLaunchOptions(true));
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
  }

  try {
    const page = await browser.newPage();
    page.setDefaultNavigationTimeout(60000);
    page.setDefaultTimeout(60000);
    await page.setContent(normalized, { waitUntil: "domcontentloaded", timeout: 90000 });

    const basePdf = {
      format: "A4" as const,
      margin: PDF_MARGIN,
      printBackground: true,
    };

    try {
      const pdfBuffer = await page.pdf({
        ...basePdf,
        displayHeaderFooter: true,
        footerTemplate: `
        <div style="width: 100%; font-size: 10px; text-align: center; font-family: 'Times New Roman', Times, serif; color: #333;">
          <span class="pageNumber"></span> из <span class="totalPages"></span>
        </div>
      `,
        headerTemplate: "<div></div>",
      });
      return Buffer.from(pdfBuffer);
    } catch (footerErr) {
      console.warn("[document-templates] PDF with header/footer failed, retry without:", footerErr);
      const pdfBuffer = await page.pdf({
        ...basePdf,
        displayHeaderFooter: false,
      });
      return Buffer.from(pdfBuffer);
    }
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

