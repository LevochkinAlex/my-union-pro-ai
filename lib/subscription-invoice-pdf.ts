import PDFDocument from "pdfkit";
import fs from "fs";
import path from "path";
import type { TariffPeriod } from "@/lib/constants/tariffs";

function formatMoney(value: number): string {
  return new Intl.NumberFormat("ru-RU", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function periodLabel(period: TariffPeriod): string {
  if (period === "half_year") return "6 месяцев";
  if (period === "year") return "12 месяцев";
  return period;
}

function amountInWordsRub(amount: number): string {
  const intPart = Math.floor(amount + 0.005);
  const kopecks = Math.round((amount - intPart) * 100) % 100;
  const kStr = kopecks < 10 ? `0${kopecks}` : String(kopecks);

  const ones = ["", "один", "два", "три", "четыре", "пять", "шесть", "семь", "восемь", "девять"];
  const onesF = ["", "одна", "две", "три", "четыре", "пять", "шесть", "семь", "восемь", "девять"];
  const tens = ["", "десять", "двадцать", "тридцать", "сорок", "пятьдесят", "шестьдесят", "семьдесят", "восемьдесят", "девяносто"];
  const teens = ["десять", "одиннадцать", "двенадцать", "тринадцать", "четырнадцать", "пятнадцать", "шестнадцать", "семнадцать", "восемнадцать", "девятнадцать"];
  const hundreds = ["", "сто", "двести", "триста", "четыреста", "пятьсот", "шестьсот", "семьсот", "восемьсот", "девятьсот"];

  function triadToWords(n: number, feminine: boolean): string {
    if (n === 0) return "";
    const h = Math.floor(n / 100);
    const t = Math.floor((n % 100) / 10);
    const o = n % 10;
    const parts: string[] = [];
    if (h > 0) parts.push(hundreds[h]);
    if (t === 1) {
      parts.push(teens[o]);
    } else {
      if (t > 0) parts.push(tens[t]);
      if (o > 0) parts.push(feminine ? onesF[o] : ones[o]);
    }
    return parts.join(" ");
  }

  function pluralize(n: number, forms: [string, string, string]): string {
    const mod10 = n % 10;
    const mod100 = n % 100;
    if (mod100 >= 11 && mod100 <= 19) return forms[2];
    if (mod10 === 1) return forms[0];
    if (mod10 >= 2 && mod10 <= 4) return forms[1];
    return forms[2];
  }

  if (intPart === 0) {
    return `Ноль рублей ${kStr} ${pluralize(kopecks, ["копейка", "копейки", "копеек"])}`;
  }

  const parts: string[] = [];
  const millions = Math.floor(intPart / 1_000_000);
  const thousands = Math.floor((intPart % 1_000_000) / 1000);
  const units = intPart % 1000;

  if (millions > 0) {
    parts.push(triadToWords(millions, false) + " " + pluralize(millions, ["миллион", "миллиона", "миллионов"]));
  }
  if (thousands > 0) {
    parts.push(triadToWords(thousands, true) + " " + pluralize(thousands, ["тысяча", "тысячи", "тысяч"]));
  }
  if (units > 0) {
    parts.push(triadToWords(units, false) + " " + pluralize(units, ["рубль", "рубля", "рублей"]));
  } else {
    parts.push(pluralize(intPart, ["рубль", "рубля", "рублей"]));
  }

  let result = parts.join(" ");
  if (result[0]) result = result[0].toUpperCase() + result.slice(1);
  return `${result} ${kStr} ${pluralize(kopecks, ["копейка", "копейки", "копеек"])}`;
}

export interface InvoiceBuyerInfo {
  entityType: "INDIVIDUAL" | "INDIVIDUAL_ENTREPRENEUR" | "LEGAL_ENTITY";
  fullName?: string | null;
  companyName?: string | null;
  inn?: string | null;
  kpp?: string | null;
  legalAddress?: string | null;
  checkingAccount?: string | null;
  bankName?: string | null;
  bik?: string | null;
  correspondentAccount?: string | null;
}

export interface InvoicePdfInput {
  offerNumber: string;
  issuedAt: Date;
  amountRub: number;
  period: TariffPeriod;
  memberLimit: number;
  tariffLabel: string;
  ratePerUserPerMonth: number;
  buyer: InvoiceBuyerInfo;
}

export async function generateSubscriptionInvoicePdf(input: InvoicePdfInput): Promise<Buffer> {
  const doc = new PDFDocument({
    size: "A4",
    margin: 40,
    info: {
      Title: `Счет-оферта ${input.offerNumber}`,
      Author: "MyUnion Pro",
    },
  });
  const chunks: Buffer[] = [];
  doc.on("data", (chunk) => chunks.push(chunk));

  const fontsDir = path.join(process.cwd(), "public", "fonts");
  const robotoRegularPath = path.join(fontsDir, "Roboto-Regular.ttf");
  const robotoBoldPath = path.join(fontsDir, "Roboto-Bold.ttf");
  const hasCustomFonts = fs.existsSync(robotoRegularPath) && fs.existsSync(robotoBoldPath);
  if (hasCustomFonts) {
    doc.registerFont("Roboto", robotoRegularPath);
    doc.registerFont("Roboto-Bold", robotoBoldPath);
    doc.font("Roboto");
  }
  const fontRegular = hasCustomFonts ? "Roboto" : "Helvetica";
  const fontBold = hasCustomFonts ? "Roboto-Bold" : "Helvetica-Bold";

  const supplierName = "ООО «ЯППИКС»";
  const supplierInn = "9707055804";
  const supplierKpp = "770701001";
  const supplierOgrn = "1267700040684";
  const supplierAddress = "127055, г. Москва, вн.тер.г. МО Тверской, ул. Палиха, д. 7-9, к. 4, пом. 1/1";
  const supplierBank = "АО «Тинькофф Банк»";
  const supplierBik = "044525974";
  const supplierRs = "40702810910002055576";
  const supplierKs = "30101810145250000974";

  let x = 40;
  let y = 40;
  doc.font(fontRegular).fontSize(8).text("Образец заполнения платежного поручения", x, y);
  y += 14;
  doc.rect(x, y, 515, 56).stroke();
  doc.font(fontRegular).fontSize(8)
    .text(`ИНН ${supplierInn}`, x + 6, y + 6)
    .text(`КПП ${supplierKpp}`, x + 120, y + 6)
    .text(`Сч. № ${supplierRs}`, x + 360, y + 6, { width: 145, align: "right" })
    .text(`Получатель: ${supplierName}`, x + 6, y + 22, { width: 350 })
    .text(`Банк получателя: ${supplierBank}`, x + 6, y + 36, { width: 320 })
    .text(`БИК ${supplierBik}`, x + 360, y + 22)
    .text(`к/с ${supplierKs}`, x + 360, y + 36);

  y += 70;
  doc.font(fontBold).fontSize(14).text(
    `Счёт-оферта № ${input.offerNumber} от ${input.issuedAt.toLocaleDateString("ru-RU")}`,
    x,
    y,
    { align: "left" }
  );
  y += 24;

  doc.font(fontBold).fontSize(10).text("Лицензиар:", x, y);
  doc.font(fontRegular).fontSize(9).text(
    `${supplierName}, ${supplierAddress}, ИНН ${supplierInn}, КПП ${supplierKpp}, ОГРН ${supplierOgrn}, р/с ${supplierRs}, в банке ${supplierBank}, БИК ${supplierBik}, к/с ${supplierKs}`,
    x + 72,
    y,
    { width: 440 }
  );
  y = doc.y + 8;

  const buyerMainName =
    input.buyer.entityType === "INDIVIDUAL"
      ? input.buyer.fullName || "Физическое лицо"
      : input.buyer.companyName || "Организация";
  const buyerInnKpp =
    input.buyer.inn || input.buyer.kpp
      ? `ИНН/КПП ${input.buyer.inn || "—"}/${input.buyer.kpp || "—"}`
      : "";

  doc.font(fontBold).fontSize(10).text("Лицензиат:", x, y);
  doc.font(fontRegular).fontSize(9).text(
    [
      buyerMainName,
      buyerInnKpp,
      input.buyer.legalAddress || null,
      input.buyer.checkingAccount ? `р/с ${input.buyer.checkingAccount}` : null,
      input.buyer.bankName ? `${input.buyer.bankName}` : null,
      input.buyer.bik ? `БИК ${input.buyer.bik}` : null,
      input.buyer.correspondentAccount ? `к/с ${input.buyer.correspondentAccount}` : null,
    ].filter(Boolean).join(", "),
    x + 72,
    y,
    { width: 440 }
  );
  y = doc.y + 10;

  const col1 = 22;
  const col2 = 250;
  const col3 = 48;
  const col4 = 90;
  const col5 = 105;
  const rowH = 20;

  doc.rect(x, y, col1, rowH).stroke();
  doc.rect(x + col1, y, col2, rowH).stroke();
  doc.rect(x + col1 + col2, y, col3, rowH).stroke();
  doc.rect(x + col1 + col2 + col3, y, col4, rowH).stroke();
  doc.rect(x + col1 + col2 + col3 + col4, y, col5, rowH).stroke();

  doc.font(fontBold).fontSize(8)
    .text("№", x + 4, y + 6)
    .text("Наименование", x + col1 + 4, y + 6, { width: col2 - 8 })
    .text("Кол-во, ед.", x + col1 + col2 + 4, y + 6)
    .text("Цена, руб.", x + col1 + col2 + col3 + 4, y + 6, { width: col4 - 8, align: "right" })
    .text("Сумма, руб.", x + col1 + col2 + col3 + col4 + 4, y + 6, { width: col5 - 8, align: "right" });

  y += rowH;
  const itemNameFull = `Доступ к SaaS MyUnion Pro, ${input.tariffLabel}, ${periodLabel(input.period)}, 1 усл. ед. (код 876)`;
  doc.font(fontRegular).fontSize(8);
  const itemNameHeight = doc.heightOfString(itemNameFull, { width: col2 - 8 });
  const dataRowH = Math.max(36, Math.ceil(itemNameHeight) + 16);

  doc.rect(x, y, col1, dataRowH).stroke();
  doc.rect(x + col1, y, col2, dataRowH).stroke();
  doc.rect(x + col1 + col2, y, col3, dataRowH).stroke();
  doc.rect(x + col1 + col2 + col3, y, col4, dataRowH).stroke();
  doc.rect(x + col1 + col2 + col3 + col4, y, col5, dataRowH).stroke();

  doc.font(fontRegular).fontSize(8)
    .text("1", x + 4, y + 8)
    .text(itemNameFull, x + col1 + 4, y + 8, { width: col2 - 8 })
    .text("1", x + col1 + col2 + 4, y + 12)
    .text(`${formatMoney(input.amountRub)}`, x + col1 + col2 + col3 + 4, y + 12, { width: col4 - 8, align: "right" })
    .text(`${formatMoney(input.amountRub)}`, x + col1 + col2 + col3 + col4 + 4, y + 12, { width: col5 - 8, align: "right" });

  y += dataRowH + 10;
  doc.font(fontBold).fontSize(10).text(`Итого к оплате: ${formatMoney(input.amountRub)} ₽`, x, y, { width: 515 });
  y = doc.y + 4;
  doc.font(fontRegular).fontSize(9).text(amountInWordsRub(input.amountRub), x, y, { width: 515 });
  y = doc.y + 4;
  doc.font(fontRegular).fontSize(9).text(
    `НДС не облагается (УСН). Тарифная ставка: ${input.ratePerUserPerMonth} ₽/польз./месяц`,
    x,
    y,
    { width: 515 }
  );
  y = doc.y + 10;

  const offerText = [
    "Настоящий счет-оферта (далее — «Счет») является письменным предложением (офертой) Лицензиара заключить договор в соответствии со ст. 432–444 ГК РФ.",
    "Акцептом оферты является полная оплата настоящего Счета Лицензиатом (п. 3 ст. 438 ГК РФ).",
    "Счет действителен 7 (семь) рабочих дней с даты выставления.",
    "Предмет договора: предоставление доступа к SaaS MyUnion Pro по выбранному тарифу. Публичная оферта: https://myunion.pro/license",
    "Период предоставления услуг: " + periodLabel(input.period) + " с момента поступления денежных средств на счёт.",
    "Споры подлежат рассмотрению по месту нахождения Лицензиара.",
  ];
  doc.font(fontRegular).fontSize(9);
  for (const line of offerText) {
    doc.text(line, x, y, { width: 515 });
    y = doc.y + 4;
  }

  y += 18;
  const signatureBlockHeight = 130;
  if (y + signatureBlockHeight > doc.page.height - doc.page.margins.bottom) {
    doc.addPage();
    y = 40;
  }
  const signLineY = y;

  const podpisPath = path.join(process.cwd(), "public", "podpis.png");
  const stampPath = path.join(process.cwd(), "public", "Печать.png");

  if (fs.existsSync(podpisPath)) {
    try {
      doc.image(podpisPath, 320, signLineY - 8, { fit: [100, 36] });
    } catch (imgError) {
      console.warn("[invoice-pdf] podpis image render warning:", imgError);
    }
  }
  if (fs.existsSync(stampPath)) {
    try {
      doc.image(stampPath, 430, signLineY - 40, { fit: [120, 120] });
    } catch (imgError) {
      console.warn("[invoice-pdf] stamp image render warning:", imgError);
    }
  }

  doc.font(fontRegular).fontSize(10).text("Генеральный директор ООО «ЯППИКС»", x, y);
  doc.font(fontRegular).fontSize(10).text("Усманов Р.Р.", 430, signLineY);

  doc.end();
  return await new Promise((resolve, reject) => {
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });
}
