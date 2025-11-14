import fs from "fs/promises";
import path from "path";
import { PDFParse } from "pdf-parse";
import mammoth from "mammoth";
import ExcelJS from "exceljs";
import { parse as parseCsv } from "csv-parse/sync";
import stripAnsi from "strip-ansi";
import JSZip from "jszip";

function normalizeWhitespace(text: string) {
  return stripAnsi(text)
    .replace(/\r\n?/g, "\n")
    .replace(/\u0000/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

async function extractFromPdf(filePath: string) {
  const buffer = await fs.readFile(filePath);
  const parser = new PDFParse({ data: buffer });
  try {
    const result = await parser.getText();
    return normalizeWhitespace(result.text || "");
  } finally {
    await parser.destroy();
  }
}

async function extractFromDocx(filePath: string) {
  const buffer = await fs.readFile(filePath);
  const { value } = await mammoth.extractRawText({ buffer });
  return normalizeWhitespace(value || "");
}

async function extractFromPlainText(filePath: string) {
  const buffer = await fs.readFile(filePath, "utf-8");
  return normalizeWhitespace(buffer);
}

async function extractFromCsv(filePath: string) {
  const buffer = await fs.readFile(filePath, "utf-8");
  const records: string[][] = parseCsv(buffer, {
    skip_empty_lines: true,
  });

  const text = records
    .map((row) => row.filter(Boolean).join(" | "))
    .join("\n");

  return normalizeWhitespace(text);
}

async function extractFromXlsx(filePath: string) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(filePath);

  const parts: string[] = [];

  workbook.eachSheet((worksheet) => {
    const rows: string[] = [];

    worksheet.eachRow((row) => {
      const rawValues = Array.isArray(row.values)
        ? row.values
        : Object.values(row.values ?? {});

      const values = rawValues
        .flatMap((value) => (Array.isArray(value) ? value : [value]))
        .filter((value): value is string | number => typeof value === "string" || typeof value === "number")
        .map((value) => String(value).trim())
        .filter(Boolean);

      if (values.length > 0) {
        rows.push(values.join(" | "));
      }
    });

    if (rows.length > 0) {
      parts.push(`# ${worksheet.name}`);
      parts.push(rows.join("\n"));
    }
  });

  return normalizeWhitespace(parts.join("\n\n"));
}

async function extractFromJson(filePath: string) {
  const buffer = await fs.readFile(filePath, "utf-8");
  try {
    const parsed = JSON.parse(buffer);
    return normalizeWhitespace(JSON.stringify(parsed, null, 2));
  } catch {
    return normalizeWhitespace(buffer);
  }
}

async function extractFromPptx(filePath: string) {
  const buffer = await fs.readFile(filePath);
  const zip = await JSZip.loadAsync(buffer);
  const slidePaths = Object.keys(zip.files)
    .filter((name) => name.startsWith("ppt/slides/slide") && name.endsWith(".xml"))
    .sort();

  const slides: string[] = [];

  for (const slidePath of slidePaths) {
    const file = zip.file(slidePath);
    if (!file) continue;
    const xml = await file.async("string");
    const text = xml
      .replace(/<a:t[^>]*>/g, "")
      .replace(/<\/a:t>/g, "")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    if (text) {
      slides.push(text);
    }
  }

  return normalizeWhitespace(slides.join("\n\n"));
}

function resolveExtension(filePath: string, mimeType?: string) {
  if (mimeType) {
    if (mimeType === "application/pdf") return "pdf";
    if (mimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") return "docx";
    if (mimeType === "application/msword") return "doc";
    if (mimeType === "text/plain") return "txt";
    if (mimeType === "text/markdown") return "md";
    if (mimeType === "text/csv") return "csv";
    if (mimeType === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet") return "xlsx";
    if (mimeType === "application/vnd.ms-excel") return "xls";
    if (mimeType === "application/json") return "json";
    if (mimeType === "text/html") return "html";
    if (mimeType === "application/vnd.openxmlformats-officedocument.presentationml.presentation") return "pptx";
    if (mimeType === "application/vnd.ms-powerpoint") return "ppt";
  }

  const ext = path.extname(filePath).slice(1).toLowerCase();
  return ext;
}

export async function extractTextFromFile(filePath: string, mimeType?: string) {
  const extension = resolveExtension(filePath, mimeType);

  if (!extension) {
    return "";
  }

  switch (extension) {
    case "pdf":
      return extractFromPdf(filePath);
    case "docx":
      return extractFromDocx(filePath);
    case "doc":
      // Attempt to process legacy .doc files via mammoth after conversion
      try {
        return await extractFromDocx(filePath);
      } catch {
        console.warn(`[knowledge] DOC parsing failed for ${filePath}`);
        return "";
      }
    case "txt":
    case "md":
    case "html":
    case "htm":
      return extractFromPlainText(filePath);
    case "csv":
      return extractFromCsv(filePath);
    case "xlsx":
    case "xls":
      return extractFromXlsx(filePath);
    case "json":
      return extractFromJson(filePath);
    case "pptx":
      return extractFromPptx(filePath);
    case "ppt":
      console.warn(`[knowledge] PPT parsing is not supported for ${filePath}`);
      return "";
    default:
      return "";
  }
}
