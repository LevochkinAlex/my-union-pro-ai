#!/usr/bin/env node
/**
 * Скрипт синхронизации скидок с BestBenefits
 * Запускается напрямую через cron, минуя HTTP API
 * 
 * Использование: node scripts/sync-discounts.mjs
 */

import { config } from "dotenv";
import { PrismaClient } from "@prisma/client";
import crypto from "crypto";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Загружаем .env из корня проекта
config({ path: path.join(__dirname, "..", ".env") });

const prisma = new PrismaClient();

const API_BASE_URL = process.env.BEST_BENEFITS_API_URL ?? "https://bestbenefits.ru/api/products";
const BB_AUTH_URL = "https://bestbenefits.ru/api/auth";
const BB_EMAIL = process.env.BB_LOGIN;
const BB_PASSWORD = process.env.BB_PASSWORD;

const VDS_HOST = process.env.VDS_STORAGE_HOST;
const VDS_USER = process.env.VDS_STORAGE_USER ?? "root";
const VDS_PATH = process.env.VDS_STORAGE_PATH ?? "/var/www/cdn";
const VDS_PASSWORD = process.env.VDS_STORAGE_PASSWORD;
const CDN_BASE_URL = process.env.CDN_BASE_URL ?? "https://cdn.myunion.pro";

console.log("=== Синхронизация скидок BestBenefits ===");
console.log(`Время: ${new Date().toISOString()}`);

/**
 * Получает токен авторизации BestBenefits
 */
async function getBBToken() {
  if (!BB_EMAIL || !BB_PASSWORD) {
    throw new Error("BB_LOGIN и BB_PASSWORD не настроены в .env");
  }

  const response = await fetch(BB_AUTH_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: BB_EMAIL, password: BB_PASSWORD }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`BB Auth failed: ${response.status} - ${text}`);
  }

  const data = await response.json();
  return data.access_token || data.token;
}

/**
 * Очищает HTML-описание
 */
function cleanDescription(html) {
  if (!html) return null;
  
  let cleaned = html
    .replace(/[●○•■▪◦◆◇★☆▶►▸▹→✓✔☑]/g, "")
    .replace(/^\s*[-–—]\s*/gm, "")
    .replace(/\n\s*[-–—]\s*/g, "\n");
  
  if (/<[^>]+>/.test(cleaned)) {
    cleaned = cleaned
      .replace(/\s*style="[^"]*"/gi, "")
      .replace(/\s*class="[^"]*"/gi, "")
      .replace(/<li[^>]*>/gi, "\n— ")
      .replace(/<\/li>/gi, "")
      .replace(/<ul[^>]*>/gi, "\n")
      .replace(/<\/ul>/gi, "\n")
      .replace(/<ol[^>]*>/gi, "\n")
      .replace(/<\/ol>/gi, "\n")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<p[^>]*>/gi, "\n\n")
      .replace(/<\/p>/gi, "")
      .replace(/<div[^>]*>/gi, "\n")
      .replace(/<\/div>/gi, "")
      .replace(/<a[^>]*>([^<]*)<\/a>/gi, "$1")
      .replace(/<[^>]+>/g, "");
  }
  
  cleaned = cleaned
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&mdash;/g, "—")
    .replace(/&ndash;/g, "–")
    .replace(/[ \t]+/g, " ")
    .replace(/\n +/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  
  return cleaned.length > 0 ? cleaned : null;
}

/**
 * Генерирует хеш для изображения
 */
function generateImageHash(content) {
  return crypto.createHash("md5").update(content).digest("hex").slice(0, 12);
}

/**
 * Загружает base64 изображение на CDN через SSH/SCP
 */
async function uploadImageToCDN(base64Data, discountId) {
  if (!VDS_HOST || !VDS_PASSWORD) {
    return null;
  }

  try {
    if (!base64Data.startsWith("data:image")) {
      if (base64Data.startsWith("http")) {
        return base64Data;
      }
      base64Data = `data:image/jpeg;base64,${base64Data}`;
    }

    const matches = base64Data.match(/^data:image\/(\w+);base64,(.+)$/);
    if (!matches) return null;

    const [, format, data] = matches;
    const buffer = Buffer.from(data, "base64");
    
    const hash = generateImageHash(data);
    const filename = `discount_${discountId}_${hash}.${format === "jpeg" ? "jpg" : format}`;
    const localPath = `/tmp/${filename}`;
    const remotePath = `${VDS_PATH}/discounts/${filename}`;
    
    // Сохраняем локально
    await fs.writeFile(localPath, buffer);
    
    // Загружаем через sshpass + scp
    const { exec } = await import("child_process");
    const { promisify } = await import("util");
    const execAsync = promisify(exec);
    
    // Создаем директорию если нет
    await execAsync(`sshpass -p '${VDS_PASSWORD}' ssh -o StrictHostKeyChecking=no ${VDS_USER}@${VDS_HOST} "mkdir -p ${VDS_PATH}/discounts"`);
    
    // Копируем файл
    await execAsync(`sshpass -p '${VDS_PASSWORD}' scp -o StrictHostKeyChecking=no ${localPath} ${VDS_USER}@${VDS_HOST}:${remotePath}`);
    
    // Удаляем локальный файл
    await fs.unlink(localPath).catch(() => {});
    
    return `${CDN_BASE_URL}/discounts/${filename}`;
  } catch (error) {
    console.error(`  ❌ Ошибка загрузки изображения для скидки ${discountId}:`, error.message);
    return null;
  }
}

/**
 * Загружает все скидки из BestBenefits
 */
async function fetchAllDiscounts(token) {
  const allDiscounts = [];
  let currentPage = 1;
  let hasMore = true;
  const maxPages = 50;

  while (hasMore && currentPage <= maxPages) {
    process.stdout.write(`  📥 Страница ${currentPage}...`);
    
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000);
    
    try {
      const url = `${API_BASE_URL}?per_page=100&page=${currentPage}`;
      const response = await fetch(url, {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
          Accept: "application/json",
        },
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`API error ${response.status}`);
      }

      const data = await response.json();
      const discounts = data?.data ?? [];
      
      if (discounts.length === 0) {
        hasMore = false;
        console.log(" пусто");
      } else {
        allDiscounts.push(...discounts);
        hasMore = data?.meta?.current_page < data?.meta?.last_page || discounts.length >= 100;
        console.log(` ${discounts.length} скидок`);
        currentPage++;
      }
      
      await new Promise(resolve => setTimeout(resolve, 200));
    } catch (error) {
      clearTimeout(timeoutId);
      throw error;
    }
  }

  return allDiscounts;
}

/**
 * Основная функция синхронизации
 */
async function syncDiscounts() {
  const startTime = Date.now();
  let created = 0;
  let updated = 0;
  let imagesProcessed = 0;
  const errors = [];

  try {
    // Получаем токен BB
    console.log("\n🔐 Авторизация в BestBenefits...");
    const token = await getBBToken();
    console.log("  ✅ Токен получен");

    // Загружаем скидки
    console.log("\n📦 Загрузка скидок из BestBenefits...");
    const bbDiscounts = await fetchAllDiscounts(token);
    console.log(`  📊 Всего получено: ${bbDiscounts.length} скидок`);

    // Синхронизируем категории
    console.log("\n📁 Синхронизация категорий...");
    const categoriesMap = new Map();
    bbDiscounts.forEach((d) => {
      (d.categories ?? []).forEach((c) => {
        if (c.id && c.name) {
          categoriesMap.set(c.id, { name: c.name, order: c.order ?? 0 });
        }
      });
    });

    for (const [id, cat] of categoriesMap.entries()) {
      try {
        await prisma.discountCategory.upsert({
          where: { id },
          update: { name: cat.name, order: cat.order, lastSyncedAt: new Date() },
          create: { id, name: cat.name, order: cat.order, lastSyncedAt: new Date() },
        });
      } catch (error) {
        errors.push(`Category ${id}: ${error.message}`);
      }
    }
    console.log(`  ✅ Синхронизировано ${categoriesMap.size} категорий`);

    // Синхронизируем скидки
    console.log("\n💰 Синхронизация скидок...");
    let processed = 0;
    
    for (const bbDiscount of bbDiscounts) {
      try {
        const discountId = bbDiscount.id;
        if (!discountId) continue;

        processed++;
        if (processed % 100 === 0) {
          console.log(`  ⏳ Обработано ${processed}/${bbDiscounts.length}...`);
        }

        const existing = await prisma.discount.findUnique({
          where: { id: discountId },
        });

        // Обрабатываем изображение
        let imageUrl = null;
        const originalImage = bbDiscount.image_url || bbDiscount.image;
        
        if (originalImage) {
          if (originalImage.startsWith("http")) {
            imageUrl = originalImage;
          } else if (originalImage.startsWith("data:image") || /^[A-Za-z0-9+/=]+$/.test(originalImage)) {
            if (!existing?.imageUrl || existing.originalImageUrl !== originalImage.slice(0, 100)) {
              const uploadedUrl = await uploadImageToCDN(originalImage, discountId);
              if (uploadedUrl) {
                imageUrl = uploadedUrl;
                imagesProcessed++;
              }
            } else {
              imageUrl = existing.imageUrl;
            }
          }
        }

        const discountData = {
          title: bbDiscount.name ?? "Без названия",
          description: cleanDescription(bbDiscount.description),
          shortDescription: cleanDescription(bbDiscount.short_description),
          discountValue: bbDiscount.discount_value ?? null,
          imageUrl: imageUrl ?? existing?.imageUrl ?? null,
          originalImageUrl: originalImage?.slice(0, 100) ?? null,
          partnerUrl: bbDiscount.cta_url ?? null,
          categories: bbDiscount.categories ?? [],
          mainCategoryId: bbDiscount.main_category?.id ?? null,
          mainCategoryName: bbDiscount.main_category?.name ?? null,
          cities: bbDiscount.cities ?? [],
          tags: bbDiscount.tags ?? [],
          isPremium: Boolean(bbDiscount.isPremium),
          validUntil: bbDiscount.end ? new Date(bbDiscount.end) : null,
          bbUpdatedAt: bbDiscount.updated_at ? new Date(bbDiscount.updated_at) : null,
          lastSyncedAt: new Date(),
          isActive: true,
        };

        if (existing) {
          await prisma.discount.update({ where: { id: discountId }, data: discountData });
          updated++;
        } else {
          await prisma.discount.create({ data: { id: discountId, ...discountData } });
          created++;
        }
      } catch (error) {
        errors.push(`Discount ${bbDiscount.id}: ${error.message}`);
      }
    }

    // Деактивируем старые скидки
    console.log("\n🗑️ Деактивация устаревших скидок...");
    const bbDiscountIds = bbDiscounts.map((d) => d.id).filter(Boolean);
    if (bbDiscountIds.length > 0) {
      const result = await prisma.discount.updateMany({
        where: { id: { notIn: bbDiscountIds }, isActive: true },
        data: { isActive: false, lastSyncedAt: new Date() },
      });
      if (result.count > 0) {
        console.log(`  ✅ Деактивировано ${result.count} скидок`);
      }
    }

    // Обновляем счетчики категорий
    console.log("\n📊 Обновление счетчиков категорий...");
    const discounts = await prisma.discount.findMany({
      where: { isActive: true },
      select: { categories: true },
    });
    const counts = new Map();
    discounts.forEach((d) => {
      (d.categories || []).forEach((cat) => {
        if (cat.id) {
          counts.set(cat.id, (counts.get(cat.id) ?? 0) + 1);
        }
      });
    });
    for (const [id, count] of counts.entries()) {
      await prisma.discountCategory.update({
        where: { id },
        data: { discountCount: count },
      }).catch(() => {});
    }

    const duration = Date.now() - startTime;

    // Записываем лог
    await prisma.syncLog.create({
      data: {
        type: "DISCOUNTS",
        source: "CRON",
        status: errors.length === 0 ? "SUCCESS" : "PARTIAL",
        itemsCreated: created,
        itemsUpdated: updated,
        itemsFailed: errors.length,
        duration,
        errors: errors.length > 0 ? errors.slice(0, 50) : undefined,
      },
    });

    console.log("\n" + "=".repeat(50));
    console.log("✅ СИНХРОНИЗАЦИЯ ЗАВЕРШЕНА");
    console.log("=".repeat(50));
    console.log(`  📈 Создано: ${created}`);
    console.log(`  🔄 Обновлено: ${updated}`);
    console.log(`  🖼️ Изображений: ${imagesProcessed}`);
    console.log(`  ❌ Ошибок: ${errors.length}`);
    console.log(`  ⏱️ Время: ${(duration / 1000).toFixed(1)}с`);

    if (errors.length > 0) {
      console.log("\n⚠️ Ошибки:");
      errors.slice(0, 10).forEach((e) => console.log(`  • ${e}`));
      if (errors.length > 10) {
        console.log(`  ... и ещё ${errors.length - 10} ошибок`);
      }
    }

    return { success: true, created, updated, errors: errors.length, duration };
  } catch (error) {
    console.error("\n❌ КРИТИЧЕСКАЯ ОШИБКА:", error.message);
    
    await prisma.syncLog.create({
      data: {
        type: "DISCOUNTS",
        source: "CRON",
        status: "FAILED",
        duration: Date.now() - startTime,
        errors: [error.message],
      },
    }).catch(() => {});

    return { success: false, error: error.message };
  } finally {
    await prisma.$disconnect();
  }
}

// Запускаем синхронизацию
syncDiscounts()
  .then((result) => {
    process.exit(result.success ? 0 : 1);
  })
  .catch((error) => {
    console.error("Fatal error:", error);
    process.exit(1);
  });

