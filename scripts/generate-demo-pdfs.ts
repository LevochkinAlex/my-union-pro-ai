/**
 * Generate static demo PDFs for the demo meeting cabinet.
 * Run: npx tsx scripts/generate-demo-pdfs.ts
 */
import PDFDocument from "pdfkit";
import fs from "fs";
import path from "path";

const OUT_DIR = path.join(__dirname, "..", "public", "demo");
if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

const FONT_DIR = path.join(__dirname, "..", "fonts");
const HAS_CUSTOM_FONT = fs.existsSync(path.join(FONT_DIR, "DejaVuSans.ttf"));

function createDoc(): PDFKit.PDFDocument {
  const doc = new PDFDocument({ size: "A4", margin: 60, info: { Author: "MyUnion Pro (демо)" } });
  if (HAS_CUSTOM_FONT) {
    doc.registerFont("Regular", path.join(FONT_DIR, "DejaVuSans.ttf"));
    if (fs.existsSync(path.join(FONT_DIR, "DejaVuSans-Bold.ttf"))) {
      doc.registerFont("Bold", path.join(FONT_DIR, "DejaVuSans-Bold.ttf"));
    } else {
      doc.registerFont("Bold", path.join(FONT_DIR, "DejaVuSans.ttf"));
    }
    doc.font("Regular");
  }
  return doc;
}

function pipe(doc: PDFKit.PDFDocument, filename: string) {
  const out = fs.createWriteStream(path.join(OUT_DIR, filename));
  doc.pipe(out);
  doc.end();
  return new Promise<void>((resolve) => out.on("finish", resolve));
}

function heading(doc: PDFKit.PDFDocument, text: string) {
  doc.font(HAS_CUSTOM_FONT ? "Bold" : "Helvetica-Bold").fontSize(16).text(text, { align: "center" }).moveDown(0.5);
  doc.font(HAS_CUSTOM_FONT ? "Regular" : "Helvetica").fontSize(11);
}

function subheading(doc: PDFKit.PDFDocument, text: string) {
  doc.font(HAS_CUSTOM_FONT ? "Bold" : "Helvetica-Bold").fontSize(12).text(text).moveDown(0.3);
  doc.font(HAS_CUSTOM_FONT ? "Regular" : "Helvetica").fontSize(11);
}

const ORG = "Первичная профсоюзная организация (демо)";
const DATE = "01 апреля 2026 г.";

async function generateAgenda() {
  const doc = createDoc();
  heading(doc, "ПОВЕСТКА");
  doc.text(`Заседания профсоюзного комитета №4`, { align: "center" }).moveDown(0.3);
  doc.text(`${ORG}`, { align: "center" }).moveDown(0.3);
  doc.text(`Дата: ${DATE}   Место: Конференц-зал, каб. 201`, { align: "center" }).moveDown(1);

  const items = [
    { n: 1, title: "Об итогах работы ППО за I квартал", speaker: "Еременко И.С." },
    { n: 2, title: "Об организации Дня здоровья для сотрудников", speaker: "Сидорова А.П." },
    { n: 3, title: "О материальной помощи членам профсоюза", speaker: "Соколова Е.В." },
  ];

  items.forEach((item) => {
    subheading(doc, `${item.n}. ${item.title}`);
    doc.text(`Докладчик: ${item.speaker}`).moveDown(0.5);
  });

  doc.moveDown(2);
  doc.text("Председатель ________________ Еременко И.С.", { align: "left" }).moveDown(0.5);
  doc.text("Секретарь    ________________ Козлова М.С.", { align: "left" });

  await pipe(doc, "demo-agenda.pdf");
  console.log("  demo-agenda.pdf");
}

async function generateProtocol() {
  const doc = createDoc();
  heading(doc, "ПРОТОКОЛ №4");
  doc.text(`заседания профсоюзного комитета`, { align: "center" }).moveDown(0.3);
  doc.text(`${ORG}`, { align: "center" }).moveDown(0.3);
  doc.text(`от ${DATE}`, { align: "center" }).moveDown(1);

  doc.text(`Присутствовали: 4 из 5 членов комитета`).moveDown(0.3);
  doc.text(`Председатель: Еременко И.С.`).moveDown(0.3);
  doc.text(`Секретарь: Козлова М.С.`).moveDown(1);

  const items = [
    { n: 1, title: "Об итогах работы ППО за I квартал", speaker: "Еременко И.С.", decision: "Принять к сведению. Информацию утвердить.", votes: "За — 4, Против — 0, Воздержались — 0" },
    { n: 2, title: "Об организации Дня здоровья для сотрудников", speaker: "Сидорова А.П.", decision: "Провести мероприятие 15.05.2026. Ответственный — Сидорова А.П.", votes: "За — 4, Против — 0, Воздержались — 0" },
    { n: 3, title: "О материальной помощи членам профсоюза", speaker: "Соколова Е.В.", decision: "Выделить материальную помощь согласно положению. Список утвердить.", votes: "За — 3, Против — 0, Воздержались — 1" },
  ];

  items.forEach((item) => {
    subheading(doc, `${item.n}. ${item.title}`);
    doc.text(`СЛУШАЛИ: ${item.speaker}`).moveDown(0.2);
    doc.text(`ПОСТАНОВИЛИ: ${item.decision}`).moveDown(0.2);
    doc.text(`Голосование: ${item.votes}`).moveDown(0.5);
  });

  doc.moveDown(2);
  doc.text("Председатель ________________ Еременко И.С.").moveDown(0.5);
  doc.text("Секретарь    ________________ Козлова М.С.");

  await pipe(doc, "demo-protocol.pdf");
  console.log("  demo-protocol.pdf");
}

async function generateResolution() {
  const doc = createDoc();
  heading(doc, "ПОСТАНОВЛЕНИЕ");
  doc.text(`профсоюзного комитета ${ORG}`, { align: "center" }).moveDown(0.3);
  doc.text(`от ${DATE}`, { align: "center" }).moveDown(1);

  doc.text("На основании протокола заседания №4 профсоюзный комитет ПОСТАНОВИЛ:").moveDown(0.5);

  doc.text("1. Принять к сведению информацию об итогах работы ППО за I квартал 2026 года.").moveDown(0.3);
  doc.text("2. Провести День здоровья для сотрудников 15 мая 2026 года. Ответственный — Сидорова А.П. Срок подготовки — до 10.05.2026.").moveDown(0.3);
  doc.text("3. Выделить материальную помощь членам профсоюза согласно утверждённому положению. Список получателей утвердить.").moveDown(1);

  doc.moveDown(2);
  doc.text("Председатель ________________ Еременко И.С.").moveDown(0.5);
  doc.text("Секретарь    ________________ Козлова М.С.");

  await pipe(doc, "demo-resolution.pdf");
  console.log("  demo-resolution.pdf");
}

async function generateExtract() {
  const doc = createDoc();
  heading(doc, "ВЫПИСКА ИЗ ПРОТОКОЛА №4");
  doc.text(`заседания профсоюзного комитета`, { align: "center" }).moveDown(0.3);
  doc.text(`${ORG}`, { align: "center" }).moveDown(0.3);
  doc.text(`от ${DATE}`, { align: "center" }).moveDown(1);

  doc.text("По вопросу 2 повестки дня:").moveDown(0.3);

  subheading(doc, "Об организации Дня здоровья для сотрудников");
  doc.text("СЛУШАЛИ: Сидорова А.П. — предложение о проведении Дня здоровья.").moveDown(0.3);
  doc.text("ПОСТАНОВИЛИ: Провести мероприятие «День здоровья» 15.05.2026 г. Ответственный — Сидорова А.П.").moveDown(0.3);
  doc.text("Голосование: За — 4, Против — 0, Воздержались — 0").moveDown(1);

  doc.text("Выписка верна.").moveDown(1);

  doc.text("Председатель ________________ Еременко И.С.").moveDown(0.5);
  doc.text("Секретарь    ________________ Козлова М.С.");

  await pipe(doc, "demo-extract.pdf");
  console.log("  demo-extract.pdf");
}

async function main() {
  console.log("Generating demo PDFs...");
  await generateAgenda();
  await generateProtocol();
  await generateResolution();
  await generateExtract();
  console.log("Done!");
}

main().catch(console.error);
