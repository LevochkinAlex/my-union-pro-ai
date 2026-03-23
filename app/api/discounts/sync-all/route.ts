import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getBestBenefitsToken } from "@/lib/best-benefits-auth";
import { uploadFileToVDS, isVDSStorageConfigured } from "@/lib/vds-storage";
import crypto from "crypto";
import { coalesceBestBenefitsDescriptions } from "@/lib/best-benefits-description";

const API_BASE_URL = process.env.BEST_BENEFITS_API_URL ?? "https://bestbenefits.ru/api/products";

interface SyncResult {
  success: boolean;
  synced: number;
  updated: number;
  created: number;
  imagesProcessed: number;
  errors: string[];
  duration: number;
}

/**
 * Очищает HTML-описание от мусора и форматирует для хранения
 * Сохраняет структуру (списки, параграфы) в чистом виде
 */
function cleanDescription(html: string | null | undefined): string | null {
  if (!html) return null;
  
  let cleaned = html;
  
  // 1. Удаляем все варианты маркеров списков
  cleaned = cleaned
    .replace(/[●○•■▪◦◆◇★☆▶►▸▹→✓✔☑]/g, '')
    .replace(/^\s*[-–—]\s*/gm, '')
    .replace(/\n\s*[-–—]\s*/g, '\n');
  
  // 2. Обрабатываем HTML если есть
  if (/<[^>]+>/.test(cleaned)) {
    cleaned = cleaned
      // Убираем inline стили и классы
      .replace(/\s*style="[^"]*"/gi, '')
      .replace(/\s*style='[^']*'/gi, '')
      .replace(/\s*class="[^"]*"/gi, '')
      .replace(/\s*class='[^']*'/gi, '')
      // Конвертируем списки в текст с маркерами
      .replace(/<li[^>]*>/gi, '\n— ')
      .replace(/<\/li>/gi, '')
      .replace(/<ul[^>]*>/gi, '\n')
      .replace(/<\/ul>/gi, '\n')
      .replace(/<ol[^>]*>/gi, '\n')
      .replace(/<\/ol>/gi, '\n')
      // Заменяем br на переносы
      .replace(/<br\s*\/?>/gi, '\n')
      // Параграфы
      .replace(/<p[^>]*>/gi, '\n\n')
      .replace(/<\/p>/gi, '')
      // Дивы
      .replace(/<div[^>]*>/gi, '\n')
      .replace(/<\/div>/gi, '')
      // Сохраняем ссылки
      .replace(/<a[^>]*href="([^"]*)"[^>]*>([^<]*)<\/a>/gi, '$2')
      // Жирный текст
      .replace(/<strong[^>]*>/gi, '')
      .replace(/<\/strong>/gi, '')
      .replace(/<b[^>]*>/gi, '')
      .replace(/<\/b>/gi, '')
      // Курсив
      .replace(/<em[^>]*>/gi, '')
      .replace(/<\/em>/gi, '')
      .replace(/<i[^>]*>/gi, '')
      .replace(/<\/i>/gi, '')
      // Убираем все оставшиеся теги
      .replace(/<[^>]+>/g, '');
  }
  
  // 3. Декодируем HTML entities
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
  
  // 4. Очищаем форматирование
  cleaned = cleaned
    // Убираем множественные пробелы (но не переносы)
    .replace(/[ \t]+/g, ' ')
    // Убираем пробелы в начале строк
    .replace(/\n +/g, '\n')
    // Убираем множественные переносы (более 2)
    .replace(/\n{3,}/g, '\n\n')
    // Убираем пустые строки с тире
    .replace(/\n—\s*\n/g, '\n')
    .trim();
  
  return cleaned.length > 0 ? cleaned : null;
}

/**
 * Генерирует хеш для идентификации изображения
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
    console.warn("[sync-all] VDS storage not configured, skipping image upload");
    return null;
  }

  try {
    // Проверяем, что это base64
    if (!base64Data.startsWith("data:image")) {
      // Уже URL, возвращаем как есть
      if (base64Data.startsWith("http")) {
        return base64Data;
      }
      // Пробуем добавить prefix
      base64Data = `data:image/jpeg;base64,${base64Data}`;
    }

    // Извлекаем данные
    const matches = base64Data.match(/^data:image\/(\w+);base64,(.+)$/);
    if (!matches) {
      console.warn(`[sync-all] Invalid base64 format for discount ${discountId}`);
      return null;
    }

    const [, format, data] = matches;
    const buffer = Buffer.from(data, "base64");
    
    // Генерируем уникальное имя файла
    const hash = generateImageHash(data);
    const filename = `discount_${discountId}_${hash}.${format === "jpeg" ? "jpg" : format}`;
    const fileKey = `discounts/${filename}`;
    
    // Загружаем на VDS
    const cdnUrl = await uploadFileToVDS(fileKey, buffer, `image/${format}`);
    console.log(`[sync-all] Uploaded image for discount ${discountId}: ${cdnUrl}`);
    
    return cdnUrl;
  } catch (error) {
    console.error(`[sync-all] Failed to upload image for discount ${discountId}:`, error);
    return null;
  }
}

/**
 * Загружает все скидки из BestBenefits API
 */
async function fetchAllDiscountsFromBB(): Promise<any[]> {
  const token = await getBestBenefitsToken();
  const allDiscounts: any[] = [];
  let currentPage = 1;
  let hasMore = true;
  const maxPages = 50; // Ограничение для безопасности

  while (hasMore && currentPage <= maxPages) {
    console.log(`[sync-all] Fetching page ${currentPage}...`);
    
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
        throw new Error(`API error ${response.status}: ${await response.text()}`);
      }

      const data = await response.json();
      const discounts = data?.data ?? [];
      
      if (discounts.length === 0) {
        hasMore = false;
      } else {
        allDiscounts.push(...discounts);
        
        // Проверяем пагинацию
        hasMore = data?.meta?.current_page && data?.meta?.last_page
          ? data.meta.current_page < data.meta.last_page
          : discounts.length >= 100;
        
        currentPage++;
      }
      
      // Небольшая задержка между запросами
      await new Promise(resolve => setTimeout(resolve, 200));
    } catch (error: any) {
      clearTimeout(timeoutId);
      if (error.name === "AbortError") {
        console.error(`[sync-all] Request timeout on page ${currentPage}`);
      }
      throw error;
    }
  }

  console.log(`[sync-all] Fetched ${allDiscounts.length} discounts from ${currentPage - 1} pages`);
  return allDiscounts;
}

/**
 * POST /api/discounts/sync-all
 * Полная синхронизация всех скидок с BestBenefits
 * Доступно только для SUPER_ADMIN
 */
export async function POST(request: NextRequest): Promise<NextResponse<SyncResult>> {
  const startTime = Date.now();
  const errors: string[] = [];
  
  try {
    // Проверяем авторизацию
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json(
        { success: false, synced: 0, updated: 0, created: 0, imagesProcessed: 0, errors: ["Не авторизован"], duration: 0 },
        { status: 401 }
      );
    }

    // Проверяем роль (только SUPER_ADMIN)
    if (session.user.role !== "SUPER_ADMIN") {
      return NextResponse.json(
        { success: false, synced: 0, updated: 0, created: 0, imagesProcessed: 0, errors: ["Недостаточно прав"], duration: 0 },
        { status: 403 }
      );
    }

    console.log("[sync-all] Starting full discount sync...");

    // Загружаем все скидки из BestBenefits
    const bbDiscounts = await fetchAllDiscountsFromBB();
    
    let created = 0;
    let updated = 0;
    let imagesProcessed = 0;

    // Синхронизируем категории
    const categoriesMap = new Map<number, { name: string; order: number }>();
    bbDiscounts.forEach((d: any) => {
      (d.categories ?? []).forEach((c: any) => {
        if (c.id && c.name) {
          categoriesMap.set(c.id, { name: c.name, order: c.order ?? 0 });
        }
      });
    });

    console.log(`[sync-all] Syncing ${categoriesMap.size} categories...`);
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
      } catch (error) {
        errors.push(`Failed to sync category ${id}: ${error}`);
      }
    }

    // Синхронизируем скидки
    console.log(`[sync-all] Syncing ${bbDiscounts.length} discounts...`);
    
    for (const bbDiscount of bbDiscounts) {
      try {
        const discountId = bbDiscount.id;
        if (!discountId) continue;

        // Проверяем существующую скидку
        const existing = await prisma.discount.findUnique({
          where: { id: discountId },
        });

        // Обрабатываем изображение
        let imageUrl: string | null = null;
        const originalImage = bbDiscount.image_url || bbDiscount.image;
        
        if (originalImage) {
          // Если уже есть URL (не base64), используем его
          if (originalImage.startsWith("http")) {
            imageUrl = originalImage;
          } else if (originalImage.startsWith("data:image") || /^[A-Za-z0-9+/=]+$/.test(originalImage)) {
            // Это base64, загружаем на CDN
            // Проверяем, не загружали ли мы уже это изображение
            if (!existing?.imageUrl || existing.originalImageUrl !== originalImage.slice(0, 100)) {
              const uploadedUrl = await uploadImageToCDN(originalImage, discountId);
              if (uploadedUrl) {
                imageUrl = uploadedUrl;
                imagesProcessed++;
              }
            } else {
              // Используем существующий URL
              imageUrl = existing.imageUrl;
            }
          }
        }

        const { description: rawDesc, shortDescription: rawShort } =
          coalesceBestBenefitsDescriptions(bbDiscount as Record<string, unknown>);
        const cleanedDescription = cleanDescription(rawDesc);
        const cleanedShortDescription = cleanDescription(rawShort);

        // ===== КОМПЛИМЕНТАРНАЯ СИНХРОНИЗАЦИЯ =====
        // 🔒 СОХРАНЯЕМ (не перезаписываем если уже есть): title, imageUrl
        // 🔄 ОБНОВЛЯЕМ (динамичные данные): description, validUntil, cities, categories
        
        // Данные которые ВСЕГДА обновляем (динамичные)
        const dynamicData = {
          description: cleanedDescription,
          shortDescription: cleanedShortDescription,
          discountValue: bbDiscount.discount_value ?? null,
          partnerUrl: bbDiscount.cta_url ?? null,
          categories: bbDiscount.categories ?? [],
          mainCategoryId: bbDiscount.main_category?.id ?? null,
          mainCategoryName: bbDiscount.main_category?.name ?? null,
          cities: bbDiscount.cities ?? [],
          tags: bbDiscount.tags ?? [],
          options: bbDiscount.options ?? [], // Варианты скидки (например Яндекс Лавка)
          isPremium: Boolean(bbDiscount.isPremium),
          validUntil: bbDiscount.end ? new Date(bbDiscount.end) : null,
          bbUpdatedAt: bbDiscount.updated_at ? new Date(bbDiscount.updated_at) : null,
          lastSyncedAt: new Date(),
          isActive: true,
        };

        if (existing) {
          // ОБНОВЛЕНИЕ: сохраняем title и imageUrl если уже есть
          const updateData = {
            ...dynamicData,
            // Сохраняем существующее название если есть
            title: existing.title || bbDiscount.name || "Без названия",
            // Сохраняем CDN картинку если уже загружена
            imageUrl: existing.imageUrl?.includes("cdn.myunion.pro") 
              ? existing.imageUrl 
              : (imageUrl ?? existing.imageUrl ?? null),
            originalImageUrl: originalImage?.slice(0, 100) ?? existing.originalImageUrl ?? null,
          };
          await prisma.discount.update({ where: { id: discountId }, data: updateData });
          updated++;
        } else {
          // СОЗДАНИЕ: берём всё из BB
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
      } catch (error) {
        errors.push(`Failed to sync discount ${bbDiscount.id}: ${error}`);
      }
    }

    // Помечаем скидки, которых больше нет в BestBenefits, как неактивные
    const bbDiscountIds = bbDiscounts.map((d: any) => d.id).filter(Boolean);
    if (bbDiscountIds.length > 0) {
      const deactivated = await prisma.discount.updateMany({
        where: {
          id: { notIn: bbDiscountIds },
          isActive: true,
        },
        data: {
          isActive: false,
          lastSyncedAt: new Date(),
        },
      });
      
      if (deactivated.count > 0) {
        console.log(`[sync-all] Deactivated ${deactivated.count} discounts no longer in BestBenefits`);
      }
    }

    // Обновляем счетчики категорий
    await updateCategoryCounts();

    const duration = Date.now() - startTime;
    console.log(`[sync-all] Sync completed in ${duration}ms: ${created} created, ${updated} updated, ${imagesProcessed} images processed`);

    // Записываем лог синхронизации
    await prisma.syncLog.create({
      data: {
        type: "DISCOUNTS",
        source: "MANUAL",
        status: errors.length === 0 ? "SUCCESS" : "PARTIAL",
        itemsCreated: created,
        itemsUpdated: updated,
        itemsFailed: errors.length,
        duration,
        errors: errors.length > 0 ? errors.slice(0, 50) : undefined,
      },
    }).catch((e) => console.error("[sync-all] Failed to write sync log:", e));

    return NextResponse.json({
      success: true,
      synced: created + updated,
      updated,
      created,
      imagesProcessed,
      errors,
      duration,
    });
  } catch (error) {
    console.error("[sync-all] Sync failed:", error);
    
    const duration = Date.now() - startTime;
    
    // Записываем лог ошибки
    await prisma.syncLog.create({
      data: {
        type: "DISCOUNTS",
        source: "MANUAL",
        status: "FAILED",
        duration,
        errors: [error instanceof Error ? error.message : String(error)],
      },
    }).catch(() => {});

    return NextResponse.json(
      {
        success: false,
        synced: 0,
        updated: 0,
        created: 0,
        imagesProcessed: 0,
        errors: [error instanceof Error ? error.message : String(error)],
        duration,
      },
      { status: 500 }
    );
  }
}

/**
 * Обновляет счетчики скидок в категориях
 */
async function updateCategoryCounts() {
  try {
    const discounts = await prisma.discount.findMany({
      where: { isActive: true },
      select: { categories: true },
    });

    const counts = new Map<number, number>();
    
    discounts.forEach((d) => {
      const categories = d.categories as any[] || [];
      categories.forEach((cat: any) => {
        if (cat.id) {
          counts.set(cat.id, (counts.get(cat.id) ?? 0) + 1);
        }
      });
    });

    for (const [id, count] of counts.entries()) {
      await prisma.discountCategory.update({
        where: { id },
        data: { discountCount: count },
      }).catch(() => {}); // Игнорируем ошибки для несуществующих категорий
    }

    console.log(`[sync-all] Updated counts for ${counts.size} categories`);
  } catch (error) {
    console.error("[sync-all] Failed to update category counts:", error);
  }
}

/**
 * GET /api/discounts/sync-all
 * Получение статуса последней синхронизации
 */
export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id || session.user.role !== "SUPER_ADMIN") {
      return NextResponse.json({ error: "Недостаточно прав" }, { status: 403 });
    }

    const [totalDiscounts, activeDiscounts, lastSynced, categoriesCount] = await Promise.all([
      prisma.discount.count(),
      prisma.discount.count({ where: { isActive: true } }),
      prisma.discount.findFirst({
        orderBy: { lastSyncedAt: "desc" },
        select: { lastSyncedAt: true },
      }),
      prisma.discountCategory.count(),
    ]);

    return NextResponse.json({
      totalDiscounts,
      activeDiscounts,
      categoriesCount,
      lastSyncedAt: lastSynced?.lastSyncedAt ?? null,
    });
  } catch (error) {
    console.error("[sync-all] GET error:", error);
    return NextResponse.json({ error: "Ошибка получения статуса" }, { status: 500 });
  }
}

