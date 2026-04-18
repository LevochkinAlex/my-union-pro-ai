import { PrismaClient } from "@prisma/client";
import { exec } from "child_process";
import { promisify } from "util";
import fs from "fs/promises";
import path from "path";
import { existsSync } from "fs";

const execAsync = promisify(exec);
const prisma = new PrismaClient();

// Конфигурация VDS из переменных окружения
const VDS_HOST = process.env.VDS_STORAGE_HOST || process.env.VDS_HOST || "79.143.29.66";
const VDS_USER = process.env.VDS_STORAGE_USER || process.env.VDS_USER || "root";
const VDS_PASSWORD = process.env.VDS_STORAGE_PASSWORD || process.env.VDS_PASSWORD;
const VDS_REMOTE_PATH = process.env.VDS_STORAGE_REMOTE_PATH || "/root/my-union-pro-ai/public/uploads";
const VDS_PUBLIC_URL = process.env.VDS_STORAGE_PUBLIC_URL || "https://myunion.pro/uploads";

if (!VDS_PASSWORD) {
  console.error("❌ VDS_PASSWORD не установлен в переменных окружения");
  process.exit(1);
}

/**
 * Экранирует пароль для использования в командах
 */
function escapePassword(pwd) {
  return pwd.replace(/'/g, "'\\''").replace(/\$/g, "\\$");
}

/**
 * Выполняет SSH команду на VDS
 */
async function execSSH(command) {
  const escapedCommand = command.replace(/'/g, "'\\''");
  const sshCommand = `sshpass -p '${escapePassword(VDS_PASSWORD)}' ssh -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null ${VDS_USER}@${VDS_HOST} '${escapedCommand}'`;
  try {
    const { stdout, stderr } = await execAsync(sshCommand);
    return { stdout: stdout.trim(), stderr: stderr.trim() };
  } catch (error) {
    throw new Error(`SSH command failed: ${error.message}`);
  }
}

/**
 * Копирует файл на VDS через SCP
 */
async function copyFileToVDS(localPath, remotePath) {
  const remoteDir = path.dirname(remotePath);
  
  // Создаем директорию на VDS
  await execSSH(`mkdir -p '${remoteDir}'`);
  
  // Копируем файл
  const scpCommand = `sshpass -p '${escapePassword(VDS_PASSWORD)}' scp -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null '${localPath}' ${VDS_USER}@${VDS_HOST}:'${remotePath}'`;
  await execAsync(scpCommand);
}

/**
 * Получает относительный путь от public/uploads
 */
function getRelativePath(fullPath) {
  const normalized = path.normalize(fullPath);
  const uploadsIndex = normalized.indexOf("public/uploads");
  if (uploadsIndex === -1) {
    return null;
  }
  return normalized.substring(uploadsIndex + "public/uploads/".length).replace(/\\/g, "/");
}

/**
 * Мигрирует документы
 */
async function migrateDocuments() {
  console.log("\n📄 Миграция документов...");
  
  const documents = await prisma.document.findMany({
    where: {
      OR: [
        { filePath: { not: null } },
        { signedFilePath: { not: null } },
      ],
    },
    select: {
      id: true,
      filePath: true,
      signedFilePath: true,
    },
  });

  let migrated = 0;
  let skipped = 0;
  let errors = 0;

  for (const doc of documents) {
    try {
      // Мигрируем filePath
      if (doc.filePath && !doc.filePath.startsWith("http")) {
        const localPath = path.join(process.cwd(), "public", doc.filePath);
        if (existsSync(localPath)) {
          const relativePath = getRelativePath(localPath);
          if (relativePath) {
            const remotePath = `${VDS_REMOTE_PATH}/${relativePath}`;
            await copyFileToVDS(localPath, remotePath);
            const publicUrl = `${VDS_PUBLIC_URL}/${relativePath}`;
            
            await prisma.document.update({
              where: { id: doc.id },
              data: { filePath: publicUrl },
            });
            
            migrated++;
            console.log(`  ✅ ${relativePath}`);
          }
        } else {
          skipped++;
          console.log(`  ⚠️  Файл не найден: ${localPath}`);
        }
      }

      // Мигрируем signedFilePath
      if (doc.signedFilePath && !doc.signedFilePath.startsWith("http")) {
        const localPath = path.join(process.cwd(), "public", doc.signedFilePath);
        if (existsSync(localPath)) {
          const relativePath = getRelativePath(localPath);
          if (relativePath) {
            const remotePath = `${VDS_REMOTE_PATH}/${relativePath}`;
            await copyFileToVDS(localPath, remotePath);
            const publicUrl = `${VDS_PUBLIC_URL}/${relativePath}`;
            
            await prisma.document.update({
              where: { id: doc.id },
              data: { signedFilePath: publicUrl },
            });
            
            migrated++;
            console.log(`  ✅ ${relativePath}`);
          }
        } else {
          skipped++;
          console.log(`  ⚠️  Файл не найден: ${localPath}`);
        }
      }
    } catch (error) {
      errors++;
      console.error(`  ❌ Ошибка миграции документа ${doc.id}:`, error.message);
    }
  }

  console.log(`\n📊 Документы: мигрировано ${migrated}, пропущено ${skipped}, ошибок ${errors}`);
}

/**
 * Мигрирует аватары пользователей
 */
async function migrateAvatars() {
  console.log("\n👤 Миграция аватаров...");
  
  const users = await prisma.user.findMany({
    where: {
      avatarUrl: { not: null },
    },
    select: {
      id: true,
      avatarUrl: true,
    },
  });

  let migrated = 0;
  let skipped = 0;
  let errors = 0;

  for (const user of users) {
    try {
      // Пропускаем base64 и уже мигрированные URL
      if (!user.avatarUrl || user.avatarUrl.startsWith("data:") || user.avatarUrl.startsWith("http")) {
        skipped++;
        continue;
      }

      // Проверяем, является ли это локальным путем
      if (user.avatarUrl.startsWith("/uploads/") || user.avatarUrl.startsWith("uploads/")) {
        const localPath = path.join(process.cwd(), "public", user.avatarUrl.replace(/^\/uploads\//, "uploads/"));
        if (existsSync(localPath)) {
          const relativePath = getRelativePath(localPath);
          if (relativePath) {
            const remotePath = `${VDS_REMOTE_PATH}/${relativePath}`;
            await copyFileToVDS(localPath, remotePath);
            const publicUrl = `${VDS_PUBLIC_URL}/${relativePath}`;
            
            await prisma.user.update({
              where: { id: user.id },
              data: { avatarUrl: publicUrl },
            });
            
            migrated++;
            console.log(`  ✅ ${relativePath}`);
          }
        } else {
          skipped++;
          console.log(`  ⚠️  Файл не найден: ${localPath}`);
        }
      }
    } catch (error) {
      errors++;
      console.error(`  ❌ Ошибка миграции аватара пользователя ${user.id}:`, error.message);
    }
  }

  console.log(`\n📊 Аватары: мигрировано ${migrated}, пропущено ${skipped}, ошибок ${errors}`);
}

/**
 * Мигрирует изображения новостей
 */
async function migrateNewsImages() {
  console.log("\n📰 Миграция изображений новостей...");
  
  const newsPosts = await prisma.newsPost.findMany({
    where: {
      imageUrl: { not: null },
    },
    select: {
      id: true,
      imageUrl: true,
    },
  });

  let migrated = 0;
  let skipped = 0;
  let errors = 0;

  for (const post of newsPosts) {
    try {
      if (!post.imageUrl || post.imageUrl.startsWith("http")) {
        skipped++;
        continue;
      }

      if (post.imageUrl.startsWith("/uploads/") || post.imageUrl.startsWith("uploads/")) {
        const localPath = path.join(process.cwd(), "public", post.imageUrl.replace(/^\/uploads\//, "uploads/"));
        if (existsSync(localPath)) {
          const relativePath = getRelativePath(localPath);
          if (relativePath) {
            const remotePath = `${VDS_REMOTE_PATH}/${relativePath}`;
            await copyFileToVDS(localPath, remotePath);
            const publicUrl = `${VDS_PUBLIC_URL}/${relativePath}`;
            
            await prisma.newsPost.update({
              where: { id: post.id },
              data: { imageUrl: publicUrl },
            });
            
            migrated++;
            console.log(`  ✅ ${relativePath}`);
          }
        } else {
          skipped++;
          console.log(`  ⚠️  Файл не найден: ${localPath}`);
        }
      }
    } catch (error) {
      errors++;
      console.error(`  ❌ Ошибка миграции изображения новости ${post.id}:`, error.message);
    }
  }

  console.log(`\n📊 Изображения новостей: мигрировано ${migrated}, пропущено ${skipped}, ошибок ${errors}`);
}

/**
 * Мигрирует файлы базы знаний
 */
async function migrateKnowledgeFiles() {
  console.log("\n📚 Миграция файлов базы знаний...");
  
  const knowledgeDocs = await prisma.knowledgeDocument.findMany({
    where: {
      filePath: { not: null },
    },
    select: {
      id: true,
      filePath: true,
    },
  });

  let migrated = 0;
  let skipped = 0;
  let errors = 0;

  for (const doc of knowledgeDocs) {
    try {
      if (!doc.filePath || doc.filePath.startsWith("http")) {
        skipped++;
        continue;
      }

      if (doc.filePath.startsWith("/uploads/") || doc.filePath.startsWith("uploads/")) {
        const localPath = path.join(process.cwd(), "public", doc.filePath.replace(/^\/uploads\//, "uploads/"));
        if (existsSync(localPath)) {
          const relativePath = getRelativePath(localPath);
          if (relativePath) {
            const remotePath = `${VDS_REMOTE_PATH}/${relativePath}`;
            await copyFileToVDS(localPath, remotePath);
            const publicUrl = `${VDS_PUBLIC_URL}/${relativePath}`;
            
            await prisma.knowledgeDocument.update({
              where: { id: doc.id },
              data: { filePath: publicUrl },
            });
            
            migrated++;
            console.log(`  ✅ ${relativePath}`);
          }
        } else {
          skipped++;
          console.log(`  ⚠️  Файл не найден: ${localPath}`);
        }
      }
    } catch (error) {
      errors++;
      console.error(`  ❌ Ошибка миграции файла базы знаний ${doc.id}:`, error.message);
    }
  }

  console.log(`\n📊 Файлы базы знаний: мигрировано ${migrated}, пропущено ${skipped}, ошибок ${errors}`);
}

/**
 * Мигрирует все файлы из директории
 */
async function migrateAllFilesFromDirectory() {
  console.log("\n📁 Миграция всех файлов из public/uploads...");
  
  const uploadsDir = path.join(process.cwd(), "public", "uploads");
  
  async function processDirectory(dir, baseDir = uploadsDir) {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    let migrated = 0;
    let errors = 0;

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      
      if (entry.isDirectory()) {
        const result = await processDirectory(fullPath, baseDir);
        migrated += result.migrated;
        errors += result.errors;
      } else if (entry.isFile()) {
        try {
          const relativePath = getRelativePath(fullPath);
          if (relativePath) {
            const remotePath = `${VDS_REMOTE_PATH}/${relativePath}`;
            await copyFileToVDS(fullPath, remotePath);
            migrated++;
            if (migrated % 10 === 0) {
              console.log(`  ✅ Мигрировано ${migrated} файлов...`);
            }
          }
        } catch (error) {
          errors++;
          console.error(`  ❌ Ошибка миграции файла ${fullPath}:`, error.message);
        }
      }
    }

    return { migrated, errors };
  }

  const result = await processDirectory(uploadsDir);
  console.log(`\n📊 Все файлы: мигрировано ${result.migrated}, ошибок ${result.errors}`);
}

async function main() {
  try {
    console.log("🚀 Начало миграции файлов на VDS...");
    console.log(`📡 VDS: ${VDS_USER}@${VDS_HOST}`);
    console.log(`📂 Удаленный путь: ${VDS_REMOTE_PATH}`);
    console.log(`🌐 Публичный URL: ${VDS_PUBLIC_URL}\n`);

    // Проверяем подключение к VDS
    console.log("🔍 Проверка подключения к VDS...");
    await execSSH("echo 'Connection OK'");
    console.log("✅ Подключение к VDS установлено\n");

    // Мигрируем все файлы из директории
    await migrateAllFilesFromDirectory();

    // Обновляем пути в базе данных
    await migrateDocuments();
    await migrateAvatars();
    await migrateNewsImages();
    await migrateKnowledgeFiles();

    console.log("\n✨ Миграция завершена!");
  } catch (error) {
    console.error("\n❌ Критическая ошибка:", error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();

