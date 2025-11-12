import { User, Organization } from "@prisma/client";
import fs from "fs/promises";
import path from "path";
import puppeteer from "puppeteer";

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

// Генерация HTML для заявления о вступлении
function generateMembershipApplicationHTML(
  user: User & { organization?: Organization | null },
  ppoChairman: string = "Председатель ППО"
): string {
  const fullName = `${user.lastName || ""} ${user.firstName || ""} ${user.middleName || ""}`.trim();
  const birthDate = user.dateOfBirth ? formatDate(user.dateOfBirth) : "";
  const address = user.address || "";
  const phone = user.phone || "";
  const jobTitle = user.jobTitle || "";
  const profession = user.profession || "";
  const education = user.education || "";
  const organizationName = user.organization?.name || "МООП РЗ";
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
      margin-bottom: 1.5em;
      text-transform: uppercase;
    }
    .content {
      text-indent: 1.5cm;
      margin-bottom: 1em;
    }
    .signature {
      margin-top: 2em;
      text-align: right;
    }
    .signature-line {
      border-top: 1px solid #000;
      width: 200px;
      display: inline-block;
      margin-top: 40px;
    }
  </style>
</head>
<body>
  <div class="header">
    ${organizationName}<br>
    ${ppoChairman}
  </div>
  
  <div class="title">
    Заявление
  </div>
  
  <div class="content">
    Я, ${fullName}, ${birthDate ? `родившийся(ая) ${birthDate} года,` : ""} ${address ? `проживающий(ая) по адресу: ${address},` : ""} ${phone ? `телефон: ${phone},` : ""} ${jobTitle ? `работающий(ая) в должности ${jobTitle},` : ""} ${profession ? `по профессии ${profession},` : ""} ${education ? `имеющий(ая) ${education} образование,` : ""} прошу принять меня в члены профсоюза.
  </div>
  
  <div class="content">
    С Уставом профсоюза и условиями членства ознакомлен(а).
  </div>
  
  <div class="signature">
    <div style="margin-top: 60px;">
      ${currentDate}
    </div>
    <div class="signature-line"></div>
    <div style="margin-top: 5px; font-size: 12pt;">
      ${fullName}
    </div>
  </div>
</body>
</html>
  `.trim();
}

// Генерация HTML для заявления о взносах
function generateContributionsApplicationHTML(
  user: User & { organization?: Organization | null },
  ppoChairman: string = "Председатель ППО"
): string {
  const fullName = `${user.lastName || ""} ${user.firstName || ""} ${user.middleName || ""}`.trim();
  const organizationName = user.organization?.name || "МООП РЗ";
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
      margin-bottom: 1.5em;
      text-transform: uppercase;
    }
    .content {
      text-indent: 1.5cm;
      margin-bottom: 1em;
    }
    .signature {
      margin-top: 2em;
      text-align: right;
    }
    .signature-line {
      border-top: 1px solid #000;
      width: 200px;
      display: inline-block;
      margin-top: 40px;
    }
  </style>
</head>
<body>
  <div class="header">
    ${organizationName}<br>
    ${ppoChairman}
  </div>
  
  <div class="title">
    Заявление
  </div>
  
  <div class="content">
    Я, ${fullName}, прошу удерживать из моей заработной платы членские взносы в размере 1% и перечислять их на счет профсоюза.
  </div>
  
  <div class="signature">
    <div style="margin-top: 60px;">
      ${currentDate}
    </div>
    <div class="signature-line"></div>
    <div style="margin-top: 5px; font-size: 12pt;">
      ${fullName}
    </div>
  </div>
</body>
</html>
  `.trim();
}

// Генерация PDF из HTML
async function generatePDFFromHTML(html: string, outputPath: string): Promise<void> {
  await ensureDocumentsDir();
  
  const browser = await puppeteer.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });
  
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
  const html = generateMembershipApplicationHTML(user, ppoChairman);
  const fileName = `membership_${user.id}_${Date.now()}.pdf`;
  const filePath = path.join(DOCUMENTS_DIR, fileName);
  
  await generatePDFFromHTML(html, filePath);
  
  return `/uploads/documents/${fileName}`;
}

// Генерация заявления о взносах
export async function generateContributionsApplication(
  user: User & { organization?: Organization | null },
  ppoChairman?: string
): Promise<string> {
  const html = generateContributionsApplicationHTML(user, ppoChairman);
  const fileName = `contributions_${user.id}_${Date.now()}.pdf`;
  const filePath = path.join(DOCUMENTS_DIR, fileName);
  
  await generatePDFFromHTML(html, filePath);
  
  return `/uploads/documents/${fileName}`;
}

