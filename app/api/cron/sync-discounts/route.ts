import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getBestBenefitsToken } from "@/lib/best-benefits-auth";
import { uploadFileToVDS, isVDSStorageConfigured } from "@/lib/vds-storage";
import { cleanupExpiredDiscounts } from "@/lib/discount-activation";
import { coalesceBestBenefitsDescriptions } from "@/lib/best-benefits-description";
import crypto from "crypto";

const API_BASE_URL = process.env.BEST_BENEFITS_API_URL ?? "https://bestbenefits.ru/api/products";
const CRON_SECRET = process.env.CRON_SECRET;

/**
 * Проверяет авторизацию cron запроса
 */
function validateCronRequest(request: NextRequest): boolean {
  // 0. Вызов от Vercel Cron
  const vercelCron = request.headers.get("x-vercel-cron");
  if (vercelCron === "true") {
    return true;
  }

  // Без секрета не валидируем пользовательские запросы
  if (!CRON_SECRET) {
    return false;
  }

  // 1. Проверка секретного ключа в заголовке
  const authHeader = request.headers.get("authorization");
  if (authHeader === `Bearer ${CRON_SECRET}`) {
    return true;
  }

  // 2. Проверка секретного ключа в query параметре
  const url = new URL(request.url);
  const secretParam = url.searchParams.get("secret");
  if (secretParam === CRON_SECRET) {
    return true;
  }

  return false;
}

/**
 * Очищает HTML-описание от мусора
 */
function cleanDescription(html: string | null | undefined): string | null {
  if (!html) return null;
  
  let cleaned = html;
  
  cleaned = cleaned
    .replace(/[●○•■▪◦◆◇★☆▶►▸▹→✓✔☑]/g, '')
    .replace(/^\s*[-–—]\s*/gm, '')
    .replace(/\n\s*[-–—]\s*/g, '\n');
  
  if (/<[^>]+>/.test(cleaned)) {
    cleaned = cleaned
      .replace(/\s*style="[^"]*"/gi, '')
      .replace(/\s*style='[^']*'/gi, '')
      .replace(/\s*class="[^"]*"/gi, '')
      .replace(/\s*class='[^']*'/gi, '')
      .replace(/<li[^>]*>/gi, '\n— ')
      .replace(/<\/li>/gi, '')
      .replace(/<ul[^>]*>/gi, '\n')
      .replace(/<\/ul>/gi, '\n')
      .replace(/<ol[^>]*>/gi, '\n')
      .replace(/<\/ol>/gi, '\n')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<p[^>]*>/gi, '\n\n')
      .replace(/<\/p>/gi, '')
      .replace(/<div[^>]*>/gi, '\n')
      .replace(/<\/div>/gi, '')
      .replace(/<a[^>]*href="([^"]*)"[^>]*>([^<]*)<\/a>/gi, '$2')
      .replace(/<strong[^>]*>/gi, '')
      .replace(/<\/strong>/gi, '')
      .replace(/<b[^>]*>/gi, '')
      .replace(/<\/b>/gi, '')
      .replace(/<em[^>]*>/gi, '')
      .replace(/<\/em>/gi, '')
      .replace(/<i[^>]*>/gi, '')
      .replace(/<\/i>/gi, '')
      .replace(/<[^>]+>/g, '');
  }
  
  cleaned = cleaned
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&mdash;/g, '—')
    .replace(/&ndash;/g, '–')
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(parseInt(code)));
  
  cleaned = cleaned
    .replace(/[ \t]+/g, ' ')
    .replace(/\n +/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/\n—\s*\n/g, '\n')
    .trim();
  
  return cleaned.length > 0 ? cleaned : null;
}

/**
 * Генерирует хеш для изображения
 */
function generateImageHash(content: string): string {
  return crypto.createHash("md5").update(content).digest("hex").slice(0, 12);
}

/**
 * Загружает base64 изображение на CDN
 */
async function uploadImageToCDN(
  base64Data: string,
  discountId: number
): Promise<string | null> {
  if (!isVDSStorageConfigured()) {
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
    if (!matches) {
      return null;
    }

    const [, format, data] = matches;
    const buffer = Buffer.from(data, "base64");
    
    const hash = generateImageHash(data);
    const filename = `discount_${discountId}_${hash}.${format === "jpeg" ? "jpg" : format}`;
    const fileKey = `discounts/${filename}`;
    
    const cdnUrl = await uploadFileToVDS(fileKey, buffer, `image/${format}`);
    return cdnUrl;
  } catch (error) {
    console.error(`[cron] Failed to upload image for discount ${discountId}:`, error);
    return null;
  }
}

/**
 * Загружает все скидки из BestBenefits
 */
async function fetchAllDiscountsFromBB(): Promise<any[]> {
  const token = await getBestBenefitsToken();
  const allDiscounts: any[] = [];
  let currentPage = 1;
  let hasMore = true;
  const maxPages = 50;

  while (hasMore && currentPage <= maxPages) {
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
        cache: "no-store",
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
      } else {
        allDiscounts.push(...discounts);
        hasMore = data?.meta?.current_page < data?.meta?.last_page || discounts.length >= 100;
        currentPage++;
      }
      
      await new Promise(resolve => setTimeout(resolve, 200));
    } catch (error: any) {
      clearTimeout(timeoutId);
      throw error;
    }
  }

  return allDiscounts;
}

/**
 * GET /api/cron/sync-discounts
 * Автоматическая синхронизация скидок (вызывается cron)
 */
export async function GET(request: NextRequest) {
  const startTime = Date.now();

  // Проверяем авторизацию
  if (!validateCronRequest(request)) {
    if (!CRON_SECRET) {
      console.error("[cron] CRON_SECRET not configured (and request is not x-vercel-cron)");
      return NextResponse.json({ error: "Cron not configured" }, { status: 500 });
    }
    console.warn("[cron] Unauthorized cron request");
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  console.log("[cron] Starting scheduled discount sync...");

  try {
    const bbDiscounts = await fetchAllDiscountsFromBB();
    
    let created = 0;
    let updated = 0;
    let imagesProcessed = 0;
    const errors: string[] = [];

    // Синхронизируем категории
    const categoriesMap = new Map<number, { name: string; order: number }>();
    bbDiscounts.forEach((d: any) => {
      (d.categories ?? []).forEach((c: any) => {
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
        errors.push(`Category ${id}: ${error}`);
      }
    }

    // Синхронизируем скидки
    for (const bbDiscount of bbDiscounts) {
      try {
        const discountId = bbDiscount.id;
        if (!discountId) continue;

        const existing = await prisma.discount.findUnique({
          where: { id: discountId },
        });

        // Обрабатываем изображение
        let imageUrl: string | null = null;
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

        const { description: rawDesc, shortDescription: rawShort } =
          coalesceBestBenefitsDescriptions(bbDiscount as Record<string, unknown>);

        const discountData = {
          title: bbDiscount.name ?? "Без названия",
          description: cleanDescription(rawDesc),
          shortDescription: cleanDescription(rawShort),
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
        errors.push(`Discount ${bbDiscount.id}: ${error}`);
      }
    }

    // Деактивируем старые скидки
    const bbDiscountIds = bbDiscounts.map((d: any) => d.id).filter(Boolean);
    if (bbDiscountIds.length > 0) {
      await prisma.discount.updateMany({
        where: { id: { notIn: bbDiscountIds }, isActive: true },
        data: { isActive: false, lastSyncedAt: new Date() },
      });
    }

    // Записываем лог синхронизации
    await prisma.syncLog.create({
      data: {
        type: "DISCOUNTS",
        source: "CRON",
        status: errors.length === 0 ? "SUCCESS" : "PARTIAL",
        itemsCreated: created,
        itemsUpdated: updated,
        itemsFailed: errors.length,
        duration: Date.now() - startTime,
        errors: errors.length > 0 ? errors.slice(0, 50) : undefined,
      },
    });

    // Дополнительно проверяем срок действия пользовательских активаций
    // (чтобы просроченные промокоды не оставались до следующего user-triggered запроса).
    let expiredActivationsRemoved = 0;
    try {
      expiredActivationsRemoved = await cleanupExpiredDiscounts();
    } catch (cleanupError) {
      errors.push(`Cleanup expired activations failed: ${cleanupError}`);
    }

    const duration = Date.now() - startTime;
    console.log(`[cron] Sync completed in ${duration}ms: ${created} created, ${updated} updated`);

    return NextResponse.json({
      success: true,
      synced: created + updated,
      created,
      updated,
      expiredActivationsRemoved,
      imagesProcessed,
      errors: errors.slice(0, 10),
      duration,
    });
  } catch (error) {
    console.error("[cron] Sync failed:", error);
    
    // Записываем ошибку в лог
    await prisma.syncLog.create({
      data: {
        type: "DISCOUNTS",
        source: "CRON",
        status: "FAILED",
        duration: Date.now() - startTime,
        errors: [error instanceof Error ? error.message : String(error)],
      },
    }).catch(() => {});

    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}

