/**
 * Импорт справочника должностей/профессий из Excel файла
 * Использует файл public/docs/job.xlsx
 */

import { PrismaClient } from "@prisma/client";
import * as XLSX from "xlsx";
import * as path from "path";
import * as fs from "fs";

const prisma = new PrismaClient();

const EXCEL_PATH = path.join(process.cwd(), "public/docs/job.xlsx");

async function importJobsFromExcel() {
  console.log("\n📊 ИМПОРТ СПРАВОЧНИКА ДОЛЖНОСТЕЙ/ПРОФЕССИЙ ИЗ EXCEL\n");
  console.log("══════════════════════════════════════════════════════════════\n");

  // Проверяем существование файла
  if (!fs.existsSync(EXCEL_PATH)) {
    console.error("❌ Файл не найден:", EXCEL_PATH);
    return;
  }

  console.log("📁 Файл:", EXCEL_PATH);

  // Читаем Excel файл
  const workbook = XLSX.readFile(EXCEL_PATH);
  
  console.log("📋 Листы в файле:", workbook.SheetNames);

  // Берём первый лист
  const sheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[sheetName];

  // Конвертируем в JSON
  const data = XLSX.utils.sheet_to_json<{ [key: string]: string }>(worksheet, {
    defval: "",
  });

  console.log(`📝 Записей в файле: ${data.length}`);
  console.log("📝 Пример первых 3 записей:");
  for (let i = 0; i < Math.min(3, data.length); i++) {
    console.log(`   ${i + 1}:`, JSON.stringify(data[i]));
  }

  // Определяем колонки с данными
  const firstRow = data[0];
  const columns = Object.keys(firstRow);
  console.log("\n📊 Колонки:", columns);

  // Извлекаем все уникальные должности из колонки work_position
  const allValues = new Set<string>();
  
  for (const row of data) {
    const value = row["work_position"];
    if (value && typeof value === "string" && value.trim().length > 0) {
      const trimmed = value.trim();
      // Пропускаем заголовки категорий (начинаются с "Должности")
      if (trimmed.length >= 2 && 
          !trimmed.startsWith("Должности ") && 
          trimmed !== "Должность медицинского персонала") {
        allValues.add(trimmed);
      }
    }
  }

  console.log(`\n✅ Уникальных значений: ${allValues.size}`);

  // Показываем первые 20 значений
  const valuesArray = Array.from(allValues).sort();
  console.log("\n📝 Первые 20 значений:");
  for (let i = 0; i < Math.min(20, valuesArray.length); i++) {
    console.log(`   ${i + 1}. ${valuesArray[i]}`);
  }

  // Спрашиваем подтверждение импорта
  console.log("\n══════════════════════════════════════════════════════════════");
  console.log("🔄 Импорт в базу данных...\n");

  // Импортируем в таблицу JobTitle
  let addedJobTitles = 0;
  let skippedJobTitles = 0;

  for (const name of valuesArray) {
    try {
      // Проверяем существует ли уже
      const existing = await prisma.jobTitle.findFirst({
        where: { name: { equals: name, mode: "insensitive" } },
      });

      if (!existing) {
        await prisma.jobTitle.create({ data: { name } });
        addedJobTitles++;
      } else {
        skippedJobTitles++;
      }
    } catch (error) {
      // Если дубликат, пропускаем
      skippedJobTitles++;
    }
  }

  console.log(`✅ Добавлено в JobTitle: ${addedJobTitles}`);
  console.log(`⏭️  Пропущено (уже существует): ${skippedJobTitles}`);

  // Импортируем также в таблицу Profession (те же данные - мед профессии)
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
    } catch (error) {
      skippedProfessions++;
    }
  }

  console.log(`✅ Добавлено в Profession: ${addedProfessions}`);
  console.log(`⏭️  Пропущено (уже существует): ${skippedProfessions}`);

  // Показываем итоговую статистику
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

