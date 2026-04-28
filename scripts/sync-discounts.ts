#!/usr/bin/env node
/**
 * Синхронизация каталога скидок с BestBenefits (cron / ручной запуск).
 * Запуск: pnpm sync:discounts
 * На VDS: каждые 15 мин через crontab (scripts/setup-cron.sh) или вручную: dotenv -c -- tsx scripts/sync-discounts.ts
 * Опционально HTTP: wget/curl на GET /api/cron/sync-discounts?secret=CRON_SECRET (тот же скрипт удобнее).
 */

import { config } from "dotenv";
import { PrismaClient } from "@prisma/client";
import crypto from "crypto";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import { exec } from "child_process";
import { promisify } from "util";

import { fetchAllBestBenefitsCatalogProducts } from "../lib/best-benefits-catalog-fetch";
import { getBestBenefitsToken } from "../lib/best-benefits-auth";

const execAsync = promisify(exec);

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
config({ path: path.join(root, ".env") });
config({ path: path.join(root, ".env.local"), override: true });

const prisma = new PrismaClient();

const VDS_HOST = process.env.VDS_STORAGE_HOST;
const VDS_USER = process.env.VDS_STORAGE_USER ?? "root";
const VDS_PATH = process.env.VDS_STORAGE_PATH ?? "/var/www/cdn";
const VDS_PASSWORD = process.env.VDS_STORAGE_PASSWORD;
const CDN_BASE_URL = process.env.CDN_BASE_URL ?? "https://cdn.myunion.pro";

console.log("=== Синхронизация скидок BestBenefits ===");
console.log(`Время: ${new Date().toISOString()}`);

function cleanDescription(html: string | null | undefined): string | null {
  if (!html) return null;

  const bulletChars =
    /[\u2022\u2023\u2043\u204C\u204D\u2219\u25AA\u25AB\u25B6\u25B8\u25BA\u25BC\u25C6\u25CB\u25CF\u25D8\u25E6\u2605\u2606\u2713\u2714\u2716\u2717\u27A4\u2B9A●○•◦◆◇■□▪▫▶►▸▹▻→➔➤✓✔☐☑★☆]/g;

  let cleaned = html
    .replace(bulletChars, "")
    .replace(/^\s*[-–—―]\s*/gm, "")
    .replace(/\n\s*[-–—―]\s*/g, "\n")
    .replace(/^\s+/gm, "");

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

function generateImageHash(content: string): string {
  return crypto.createHash("md5").update(content).digest("hex").slice(0, 12);
}

async function uploadImageToCDN(
  base64Data: string,
  discountId: number
): Promise<string | null> {
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

    await fs.writeFile(localPath, buffer);

    await execAsync(
      `sshpass -p '${VDS_PASSWORD}' ssh -o StrictHostKeyChecking=no ${VDS_USER}@${VDS_HOST} "mkdir -p ${VDS_PATH}/discounts"`
    );
    await execAsync(
      `sshpass -p '${VDS_PASSWORD}' scp -o StrictHostKeyChecking=no ${localPath} ${VDS_USER}@${VDS_HOST}:${remotePath}`
    );

    await fs.unlink(localPath).catch(() => {});

    return `${CDN_BASE_URL}/discounts/${filename}`;
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error(`  ❌ Ошибка загрузки изображения для скидки ${discountId}:`, msg);
    return null;
  }
}

async function syncDiscounts() {
  const startTime = Date.now();
  let created = 0;
  let updated = 0;
  let imagesProcessed = 0;
  const errors: string[] = [];

  try {
    console.log("\n🔐 Токен BestBenefits (BB_PROFSOYUZY_TOKEN)...");
    const token = await getBestBenefitsToken();
    console.log("  ✅ Готово");

    console.log("\n📦 Загрузка скидок из BestBenefits...");
    const { items: bbDiscounts, pagesFetched, truncatedByCap } =
      await fetchAllBestBenefitsCatalogProducts({
        token,
        log: (level, message) => {
          if (level === "warn") console.warn(message);
          else console.log(message);
        },
      });
    console.log(
      `  📊 Всего получено: ${bbDiscounts.length} скидок (страниц: ${pagesFetched}${truncatedByCap ? ", обрезано лимитом maxPages" : ""})`
    );

    console.log("\n📁 Синхронизация категорий...");
    const categoriesMap = new Map<
      number,
      { name: string; order: number }
    >();
    for (const d of bbDiscounts as any[]) {
      for (const c of d.categories ?? []) {
        if (c.id && c.name) {
          categoriesMap.set(c.id, { name: c.name, order: c.order ?? 0 });
        }
      }
    }

    for (const [id, cat] of categoriesMap.entries()) {
      try {
        await prisma.discountCategory.upsert({
          where: { id },
          update: {
            name: cat.name,
            order: cat.order,
            lastSyncedAt: new Date(),
          },
          create: {
            id,
            name: cat.name,
            order: cat.order,
            lastSyncedAt: new Date(),
          },
        });
      } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : String(error);
        errors.push(`Category ${id}: ${msg}`);
      }
    }
    console.log(`  ✅ Синхронизировано ${categoriesMap.size} категорий`);

    console.log("\n💰 Синхронизация скидок...");
    let processed = 0;

    for (const bbDiscount of bbDiscounts as any[]) {
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

        let imageUrl: string | null = null;
        const originalImage = bbDiscount.image_url || bbDiscount.image;

        if (originalImage) {
          if (originalImage.startsWith("http")) {
            imageUrl = originalImage;
          } else if (
            originalImage.startsWith("data:image") ||
            /^[A-Za-z0-9+/=]+$/.test(originalImage)
          ) {
            if (
              !existing?.imageUrl ||
              existing.originalImageUrl !== originalImage.slice(0, 100)
            ) {
              const uploadedUrl = await uploadImageToCDN(
                originalImage,
                discountId
              );
              if (uploadedUrl) {
                imageUrl = uploadedUrl;
                imagesProcessed++;
              }
            } else {
              imageUrl = existing.imageUrl;
            }
          }
        }

        const dynamicData = {
          description: cleanDescription(bbDiscount.description),
          shortDescription: cleanDescription(bbDiscount.short_description),
          discountValue: bbDiscount.discount_value ?? null,
          partnerUrl: bbDiscount.cta_url ?? null,
          categories: bbDiscount.categories ?? [],
          mainCategoryId: bbDiscount.main_category?.id ?? null,
          mainCategoryName: bbDiscount.main_category?.name ?? null,
          cities: bbDiscount.cities ?? [],
          tags: bbDiscount.tags ?? [],
          options: bbDiscount.options ?? [],
          isPremium: Boolean(bbDiscount.isPremium),
          validUntil: bbDiscount.end ? new Date(bbDiscount.end) : null,
          bbUpdatedAt: bbDiscount.updated_at
            ? new Date(bbDiscount.updated_at)
            : null,
          lastSyncedAt: new Date(),
          isActive: true,
        };

        if (existing) {
          const updateData = {
            ...dynamicData,
            title: existing.title || bbDiscount.name || "Без названия",
            imageUrl: existing.imageUrl?.includes("cdn.myunion.pro")
              ? existing.imageUrl
              : (imageUrl ?? existing.imageUrl ?? null),
            originalImageUrl:
              originalImage?.slice(0, 100) ?? existing.originalImageUrl ?? null,
          };
          await prisma.discount.update({
            where: { id: discountId },
            data: updateData,
          });
          updated++;
        } else {
          await prisma.discount.create({
            data: {
              id: discountId,
              title: bbDiscount.name ?? "Без названия",
              imageUrl: imageUrl ?? null,
              originalImageUrl: originalImage?.slice(0, 100) ?? null,
              ...dynamicData,
            },
          });
          created++;
        }
      } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : String(error);
        errors.push(`Discount ${bbDiscount?.id}: ${msg}`);
      }
    }

    console.log("\n🗑️ Деактивация устаревших скидок...");
    const bbDiscountIds = (bbDiscounts as any[])
      .map((d) => d.id)
      .filter(Boolean);
    if (bbDiscountIds.length > 0) {
      const result = await prisma.discount.updateMany({
        where: { id: { notIn: bbDiscountIds }, isActive: true },
        data: { isActive: false, lastSyncedAt: new Date() },
      });
      if (result.count > 0) {
        console.log(`  ✅ Деактивировано ${result.count} скидок`);
      }
    }

    console.log("\n📊 Обновление счетчиков категорий...");
    const discounts = await prisma.discount.findMany({
      where: { isActive: true },
      select: { categories: true },
    });
    const counts = new Map<number, number>();
    discounts.forEach((d) => {
      (d.categories || []).forEach((cat: { id?: number }) => {
        if (cat.id) {
          counts.set(cat.id, (counts.get(cat.id) ?? 0) + 1);
        }
      });
    });
    for (const [id, count] of counts.entries()) {
      await prisma.discountCategory
        .update({
          where: { id },
          data: { discountCount: count },
        })
        .catch(() => {});
    }

    const duration = Date.now() - startTime;

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
        metadata: {
          catalogCount: bbDiscounts.length,
          pagesFetched,
          truncatedByCap,
        },
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
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("\n❌ КРИТИЧЕСКАЯ ОШИБКА:", message);

    await prisma.syncLog
      .create({
        data: {
          type: "DISCOUNTS",
          source: "CRON",
          status: "FAILED",
          duration: Date.now() - startTime,
          errors: [message],
        },
      })
      .catch(() => {});

    return { success: false, error: message };
  } finally {
    await prisma.$disconnect();
  }
}

syncDiscounts()
  .then((result) => {
    process.exit(result.success ? 0 : 1);
  })
  .catch((error) => {
    console.error("Fatal error:", error);
    process.exit(1);
  });
