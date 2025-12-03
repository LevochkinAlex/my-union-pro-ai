import { User, Organization } from "@prisma/client";
import fs from "fs/promises";
import path from "path";
import puppeteer from "puppeteer";
import { declineNameToGenitive } from "./dadata";

const DOCUMENTS_DIR = path.join(process.cwd(), "public", "uploads", "documents");

// Убеждаемся, что директория существует
export async function ensureDocumentsDir() {
  try {
    await fs.mkdir(DOCUMENTS_DIR, { recursive: true });
  } catch (error) {
    console.error("[documents] Ошибка создания директории:", error);
  }
}

// Форматирование даты для заявлений
function formatDate(date: Date): string {
  const day = date.getDate().toString().padStart(2, "0");
  const month = (date.getMonth() + 1).toString().padStart(2, "0");
  const year = date.getFullYear();
  return `${day}.${month}.${year}`;
}

// Получение текущей даты
function getCurrentDate(): string {
  return formatDate(new Date());
}

/**
 * Получение ФИО в родительном падеже через DaData API
 */
async function getFullNameGenitive(user: { 
  firstName?: string | null; 
  lastName?: string | null; 
  middleName?: string | null 
}): Promise<string> {
  if (!user.lastName || !user.firstName) return "";
  
  try {
    return await declineNameToGenitive(
      user.lastName,
      user.firstName,
      user.middleName
    );
  } catch (error) {
    console.error("[documents] Error declining name:", error);
    // Если DaData не сработал, вернем просто ФИО без склонения
    return `${user.lastName} ${user.firstName}${user.middleName ? ` ${user.middleName}` : ""}`;
  }
}

/**
 * Форматирует должность с приставкой "работающего(ей)"
 */
function formatJobTitle(jobTitle?: string | null): string {
  if (!jobTitle) return "";
  return `работающего(ей) ${jobTitle}`;
}

// Генерация HTML для заявления о вступлении (согласно образцу PDF)
async function generateMembershipApplicationHTML(
  user: User & { organization?: Organization | null },
  ppoChairman: string = "Председатель ППО"
): Promise<string> {
  const fullName = `${user.lastName || ""} ${user.firstName || ""} ${user.middleName || ""}`.trim();
  const fullNameGenitive = await getFullNameGenitive(user);
  const jobTitle = formatJobTitle(user.jobTitle);
  const ppoName = user.organization?.name || "первичной профсоюзной организации";
  const currentDate = getCurrentDate();

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    body {
      font-family: 'Times New Roman', serif;
      font-size: 14pt;
      line-height: 1.5;
      margin: 2cm;
      color: #000;
    }
    .header {
      text-align: right;
      margin-bottom: 2em;
    }
    .title {
      text-align: center;
      font-weight: bold;
      font-size: 16pt;
      margin-bottom: 1.5em;
      text-transform: uppercase;
    }
    .content {
      margin-bottom: 1em;
      font-size: 14pt;
    }
    .footer {
      margin-top: 2em;
      display: flex;
      justify-content: space-between;
    }
    .date {
      text-align: left;
      font-size: 14pt;
    }
    .signature {
      text-align: right;
      font-size: 14pt;
    }
    .signature-line {
      border-top: 1px solid #000;
      width: 200px;
      display: inline-block;
      margin-top: 5px;
    }
  </style>
</head>
<body>
  <div class="header">
    Председателю ${ppoName}<br>
    от ${fullNameGenitive}.<br>
    ${jobTitle}
  </div>
  
  <div class="title">
    ЗАЯВЛЕНИЕ.
  </div>
  
  <div class="content">
    Прошу принять меня в Профсоюз работников здравоохранения РФ с ${currentDate}
  </div>
  
  <div class="content">
    С уставом Профсоюза работников здравоохранения РФ ознакомлен(а) и обязуюсь исполнять.
  </div>
  
  <div class="footer">
    <div class="date">
      ${currentDate}
    </div>
    <div class="signature">
      Личная подпись<br>
      <div class="signature-line"></div>
    </div>
  </div>
</body>
</html>
  `.trim();
}

// Генерация HTML для заявления о взносах (согласно новому образцу PDF)
async function generateContributionsApplicationHTML(
  user: User & { organization?: Organization | null },
  employerName?: string,
  employerFullName?: string
): Promise<string> {
  const fullName = `${user.lastName || ""} ${user.firstName || ""} ${user.middleName || ""}`.trim();
  const fullNameGenitive = await getFullNameGenitive(user);
  const organizationName = user.organization?.name || employerName || "организации работодателя";
  const employerFIO = employerFullName || "";
  const jobTitle = formatJobTitle(user.jobTitle);
  const currentDate = getCurrentDate();

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    body {
      font-family: 'Times New Roman', serif;
      font-size: 14pt;
      line-height: 1.5;
      margin: 2cm;
      color: #000;
    }
    .header {
      text-align: right;
      margin-bottom: 2em;
    }
    .title {
      text-align: center;
      font-weight: bold;
      font-size: 16pt;
      margin-bottom: 1.5em;
      text-transform: uppercase;
    }
    .content {
      margin-bottom: 1em;
      font-size: 14pt;
      text-align: left;
    }
    .signature {
      margin-top: 2em;
      text-align: left;
    }
    .signature-line {
      border-top: 1px solid #000;
      width: 200px;
      display: inline-block;
      margin-top: 5px;
    }
  </style>
</head>
<body>
  <div class="header">
    Руководителю (главному врачу, директору)<br>
    ${organizationName}<br>
    ${employerFIO}
  </div>
  
  <div style="text-align: right; margin-bottom: 2em;">
    от ${fullNameGenitive}<br>
    ${jobTitle}
  </div>
  
  <div class="title">
    ЗАЯВЛЕНИЕ.
  </div>
  
  <div class="content">
    На основании ст.28 Федерального закона «О профессиональных союзах, их правах и гарантиях деятельности» прошу ежемесячно удерживать из моей заработной платы членские профсоюзные взносы в размере 1% (один процент) и перечислять их на счет профсоюзной организации с ${currentDate}
  </div>
  
  <div class="signature">
    Подпись<br>
    <div class="signature-line"></div>
  </div>
</body>
</html>
  `.trim();
}

// Генерация PDF из HTML
async function generatePDFFromHTML(html: string, outputPath: string): Promise<void> {
  await ensureDocumentsDir();
  
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
  }
  
  console.log("[documents] Launching Puppeteer...", { 
    executablePath: executablePath || "auto-detect",
    platform: process.platform 
  });
  
  const browser = await puppeteer.launch(launchOptions);
  
  console.log("[documents] Puppeteer launched successfully");
  
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "networkidle0" });
    
    await page.pdf({
      path: outputPath,
      format: "A4",
      margin: {
        top: "2cm",
        right: "2cm",
        bottom: "2cm",
        left: "2cm",
      },
      printBackground: true,
    });
  } finally {
    await browser.close();
  }
}

// Генерация заявления о вступлении
export async function generateMembershipApplication(
  user: User & { organization?: Organization | null },
  ppoChairman?: string
): Promise<string> {
  const html = await generateMembershipApplicationHTML(user, ppoChairman);
  const fileName = `membership_${user.id}_${Date.now()}.pdf`;
  const filePath = path.join(DOCUMENTS_DIR, fileName);
  
  await generatePDFFromHTML(html, filePath);
  
  return `/uploads/documents/${fileName}`;
}

// Генерация заявления о взносах
export async function generateContributionsApplication(
  user: User & { organization?: Organization | null },
  employerName?: string,
  employerFullName?: string
): Promise<string> {
  const html = await generateContributionsApplicationHTML(user, employerName, employerFullName);
  const fileName = `contributions_${user.id}_${Date.now()}.pdf`;
  const filePath = path.join(DOCUMENTS_DIR, fileName);
  
  await generatePDFFromHTML(html, filePath);
  
  return `/uploads/documents/${fileName}`;
}

