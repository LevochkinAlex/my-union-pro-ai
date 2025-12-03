#!/usr/bin/env tsx

/**
 * Скрипт для проверки неиспользуемых библиотек
 * Выводит список библиотек, которые могут быть неиспользуемыми
 */

import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.join(__dirname, "..");

// Библиотеки, которые точно используются
const USED_LIBRARIES = new Set([
  "@prisma/client",
  "prisma",
  "next",
  "react",
  "react-dom",
  "next-auth",
  "puppeteer",
  "@tinymce/tinymce-react",
  "tinymce",
  "tailwindcss",
  "typescript",
  "tsx",
  "dotenv",
  "dotenv-cli",
  "eslint",
  "eslint-config-next",
]);

// Библиотеки, которые могут быть неиспользуемыми (требуют проверки)
const POTENTIALLY_UNUSED = [
  "pdfkit", // Заменен на Puppeteer
  "@types/pdfkit", // Типы для pdfkit
  "jspdf", // Возможно не используется
  "docxtemplater", // Возможно не используется
  "pizzip", // Зависимость docxtemplater
  "@types/pizzip", // Типы для pizzip
];

async function checkLibraryUsage(libName: string): Promise<boolean> {
  try {
    const searchPattern = new RegExp(
      `(import|require|from).*["']${libName.replace(/\//g, "\\/")}["']`,
      "g"
    );

    // Ищем в основных директориях
    const searchDirs = ["app", "components", "lib", "scripts"];
    let found = false;

    for (const dir of searchDirs) {
      const dirPath = path.join(projectRoot, dir);
      try {
        const files = await getAllFiles(dirPath);
        for (const file of files) {
          if (!file.endsWith(".ts") && !file.endsWith(".tsx") && !file.endsWith(".js") && !file.endsWith(".jsx")) {
            continue;
          }
          const content = await fs.readFile(file, "utf-8");
          if (searchPattern.test(content)) {
            found = true;
            break;
          }
        }
        if (found) break;
      } catch (error) {
        // Игнорируем ошибки доступа к директориям
      }
    }

    return found;
  } catch (error) {
    return false;
  }
}

async function getAllFiles(dirPath: string): Promise<string[]> {
  const files: string[] = [];
  try {
    const entries = await fs.readdir(dirPath, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);
      if (entry.isDirectory() && !entry.name.startsWith(".") && entry.name !== "node_modules") {
        files.push(...(await getAllFiles(fullPath)));
      } else if (entry.isFile()) {
        files.push(fullPath);
      }
    }
  } catch (error) {
    // Игнорируем ошибки
  }
  return files;
}

async function checkUnusedLibraries() {
  console.log("🔍 Проверка использования библиотек...\n");

  const unused: string[] = [];
  const used: string[] = [];

  for (const lib of POTENTIALLY_UNUSED) {
    if (USED_LIBRARIES.has(lib)) {
      used.push(lib);
      continue;
    }

    const isUsed = await checkLibraryUsage(lib);
    if (isUsed) {
      used.push(lib);
      console.log(`✅ ${lib} - используется`);
    } else {
      unused.push(lib);
      console.log(`❌ ${lib} - не используется`);
    }
  }

  console.log("\n" + "═".repeat(60));
  console.log("📊 РЕЗУЛЬТАТЫ:");
  console.log(`   ✅ Используется: ${used.length}`);
  console.log(`   ❌ Не используется: ${unused.length}`);
  
  if (unused.length > 0) {
    console.log("\n📦 Библиотеки, которые можно удалить:");
    unused.forEach((lib) => console.log(`   - ${lib}`));
    console.log("\n💡 Команда для удаления:");
    console.log(`   pnpm remove ${unused.join(" ")}`);
  }
  console.log("═".repeat(60) + "\n");
}

checkUnusedLibraries().catch(console.error);

