/**
 * Импорт справочника должностей/профессий из Excel файла
 * Использует файл public/docs/job.xlsx
 *
 * Переписано с xlsx/SheetJS на exceljs после обнаружения CVE в xlsx
 * (prototype pollution + ReDoS, на npm нет исправленной версии).
 */

import { PrismaClient } from "@prisma/client";
import ExcelJS from "exceljs";
import * as path from "path";
import * as fs from "fs";

const prisma = new PrismaClient();

const EXCEL_PATH = path.join(process.cwd(), "public/docs/job.xlsx");

async function importJobsFromExcel() {
  console.log("\n📊 ИМПОРТ СПРАВОЧНИКА ДОЛЖНОСТЕЙ/ПРОФЕССИЙ ИЗ EXCEL\n");
  console.log("══════════════════════════════════════════════════════════════\n");

  if (!fs.existsSync(EXCEL_PATH)) {
    console.error("❌ Файл не найден:", EXCEL_PATH);
    return;
  }

  console.log("📁 Файл:", EXCEL_PATH);

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(EXCEL_PATH);

  const sheetNames = workbook.worksheets.map((ws) => ws.name);
  console.log("📋 Листы в файле:", sheetNames);

  // Берём первый лист
  const worksheet = workbook.worksheets[0];
  if (!worksheet) {
    console.error("❌ Нет листов в книге");
    return;
  }

  // Заголовки из первой строки
  const headerRow = worksheet.getRow(1);
  const headers: string[] = [];
  headerRow.eachCell({ includeEmpty: true }, (cell, col) => {
    headers[col - 1] = String(cell.value ?? "").trim();
  });

  const columns = headers.filter((h) => h.length > 0);
  console.log("\n📊 Колонки:", columns);

  // Собираем данные в виде массива объектов (как sheet_to_json из xlsx)
  const data: Record<string, string>[] = [];
  worksheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    if (rowNumber === 1) return; // пропускаем заголовок
    const obj: Record<string, string> = {};
    for (let i = 0; i < headers.length; i++) {
      const key = headers[i];
      if (!key) continue;
      const cell = row.getCell(i + 1).value;
      obj[key] = cell == null ? "" : String(cell);
    }
    data.push(obj);
  });

  console.log(`📝 Записей в файле: ${data.length}`);
  console.log("📝 Пример первых 3 записей:");
  for (let i = 0; i < Math.min(3, data.length); i++) {
    console.log(`   ${i + 1}:`, JSON.stringify(data[i]));
  }

  // Извлекаем все уникальные должности из колонки work_position
  const allValues = new Set<string>();

  for (const row of data) {
    const value = row["work_position"];
    if (value && typeof value === "string" && value.trim().length > 0) {
      const trimmed = value.trim();
      // Пропускаем заголовки категорий (начинаются с "Должности")
      if (
        trimmed.length >= 2 &&
        !trimmed.startsWith("Должности ") &&
        trimmed !== "Должность медицинского персонала"
      ) {
        allValues.add(trimmed);
      }
    }
  }

  console.log(`\n✅ Уникальных значений: ${allValues.size}`);

  const valuesArray = Array.from(allValues).sort();
  console.log("\n📝 Первые 20 значений:");
  for (let i = 0; i < Math.min(20, valuesArray.length); i++) {
    console.log(`   ${i + 1}. ${valuesArray[i]}`);
  }

  console.log("\n══════════════════════════════════════════════════════════════");
  console.log("🔄 Импорт в базу данных...\n");

  // Импорт в JobTitle
  let addedJobTitles = 0;
  let skippedJobTitles = 0;
  for (const name of valuesArray) {
    try {
      const existing = await prisma.jobTitle.findFirst({
        where: { name: { equals: name, mode: "insensitive" } },
      });
      if (!existing) {
        await prisma.jobTitle.create({ data: { name } });
        addedJobTitles++;
      } else {
        skippedJobTitles++;
      }
    } catch {
      skippedJobTitles++;
    }
  }
  console.log(`✅ Добавлено в JobTitle: ${addedJobTitles}`);
  console.log(`⏭️  Пропущено (уже существует): ${skippedJobTitles}`);

  // Импорт в Profession
  let addedProfessions = 0;
  let skippedProfessions = 0;
  for (const name of valuesArray) {
    try {
      const existing = await prisma.profession.findFirst({
        where: { name: { equals: name, mode: "insensitive" } },
      });
      if (!existing) {
        await prisma.profession.create({ data: { name } });
        addedProfessions++;
      } else {
        skippedProfessions++;
      }
    } catch {
      skippedProfessions++;
    }
  }
  console.log(`✅ Добавлено в Profession: ${addedProfessions}`);
  console.log(`⏭️  Пропущено (уже существует): ${skippedProfessions}`);

  const totalJobTitles = await prisma.jobTitle.count();
  const totalProfessions = await prisma.profession.count();

  console.log("\n══════════════════════════════════════════════════════════════");
  console.log("📊 ИТОГО В БАЗЕ ДАННЫХ:");
  console.log(`   JobTitle: ${totalJobTitles} записей`);
  console.log(`   Profession: ${totalProfessions} записей`);
  console.log("══════════════════════════════════════════════════════════════\n");
}

importJobsFromExcel()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
