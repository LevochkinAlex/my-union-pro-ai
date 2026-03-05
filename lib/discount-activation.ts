/**
 * Утилиты для работы с активированными скидками
 * 
 * ОСНОВНОЙ ИСТОЧНИК ДАННЫХ: таблица DiscountActivation
 * 
 * Обеспечивает:
 * - Сохранение промокодов в нашей БД (даже если BestBenefits очистит базу)
 * - Проверку срока действия скидок
 * - Автоматическое удаление устаревших скидок
 * - Синхронизацию с BestBenefits с fallback на кэш
 */

import { prisma } from "@/lib/prisma";
import { getUserActivatedDiscounts, activateBestBenefitsDiscount } from "@/lib/best-benefits-activation";

export interface DiscountActivationData {
  discountId: number;
  promoCode?: string | null;
  validUntil?: string | null; // ISO date string
  activatedAt?: Date;
}

/**
 * Получить активированные скидки пользователя из нашей БД (КЭША)
 * Используется как fallback при ошибках API
 */
export async function getUserActivatedDiscountsFromDB(
  userId: string
): Promise<Array<{
  discountId: number;
  promoCode: string | null;
  validUntil: Date | null;
  activatedAt: Date;
  syncedFromBB: boolean;
  lastSyncedAt: Date | null;
}>> {
  const activations = await prisma.discountActivation.findMany({
    where: { userId },
    orderBy: { activatedAt: "desc" },
  });

  return activations.map((a) => ({
    discountId: a.discountId,
    promoCode: a.promoCode,
    validUntil: a.validUntil,
    activatedAt: a.activatedAt,
    syncedFromBB: a.syncedFromBB,
    lastSyncedAt: a.lastSyncedAt,
  }));
}

/**
 * Сохранить или обновить активированную скидку
 */
export async function saveDiscountActivation(
  userId: string,
  data: DiscountActivationData
): Promise<void> {
  const validUntil = data.validUntil ? new Date(data.validUntil) : null;

  await prisma.discountActivation.upsert({
    where: {
      userId_discountId: {
        userId,
        discountId: data.discountId,
      },
    },
    create: {
      userId,
      discountId: data.discountId,
      promoCode: data.promoCode || null,
      validUntil,
      activatedAt: data.activatedAt || new Date(),
      syncedFromBB: false,
    },
    update: {
      // ВАЖНО: Всегда обновляем промокод если он валидный
      promoCode: data.promoCode && data.promoCode.trim().length > 0
        ? data.promoCode.trim()
        : undefined,
      validUntil,
      lastSyncedAt: new Date(),
    },
  });
}

/**
 * Синхронизировать активированные скидки с BestBenefits
 * 
 * УЛУЧШЕННАЯ ЛОГИКА:
 * - ВСЕГДА обновляет промокоды из BB (они могут меняться!)
 * - При ошибке API использует данные из локальной БД (fallback)
 * - Помечает скидки как устаревшие если их нет в BB
 */
export async function syncDiscountsWithBestBenefits(
  userId: string,
  bestBenefitsUserId: string,
  bestBenefitsPassword?: string
): Promise<{
  synced: number;
  expired: number;
  updated: number;
  errors: string[];
  usedFallback: boolean;
}> {
  const errors: string[] = [];
  let synced = 0;
  let expired = 0;
  let updated = 0;
  let usedFallback = false;

  try {
    console.log(`[discount-activation] Syncing discounts for user ${userId}...`);
    
    // Получаем активированные скидки из BestBenefits
    const bbActivated = await getUserActivatedDiscounts(
      bestBenefitsUserId,
      bestBenefitsPassword,
      {
        timeout: 25000, // Увеличен таймаут
        retries: 3,
      }
    );

    console.log(`[discount-activation] Got ${bbActivated.length} discounts from BB`);

    // Если BB вернул пустой массив - это может быть ошибка API
    // Проверяем, есть ли у нас локальные данные
    if (bbActivated.length === 0) {
      const localActivations = await prisma.discountActivation.count({
        where: { userId },
      });
      
      if (localActivations > 0) {
        console.warn(`[discount-activation] ⚠️ BB returned 0 discounts but we have ${localActivations} locally. Keeping local data.`);
        usedFallback = true;
        return { synced: 0, expired: 0, updated: 0, errors: [], usedFallback };
      }
    }

    const now = new Date();
    const bbDiscountIds = new Set(bbActivated.map(d => d.id));

    // Скидки без активного промокода — кандидаты на перевыпуск через POST /api/promo
    const discountsNeedingReissue: number[] = [];

    // Сохраняем каждую активированную скидку в нашу БД
    for (const bbItem of bbActivated) {
      try {
        const existing = await prisma.discountActivation.findUnique({
          where: {
            userId_discountId: {
              userId,
              discountId: bbItem.id,
            },
          },
        });

        const newPromoCode = bbItem.promoCode?.trim() || null;
        const existingPromoCode = existing?.promoCode?.trim() || null;
        
        const promoCodeChanged = newPromoCode !== existingPromoCode;
        
        if (promoCodeChanged && newPromoCode) {
          console.log(`[discount-activation] 🔄 Promo code changed for discount ${bbItem.id}: "${existingPromoCode}" → "${newPromoCode}"`);
        }

        let validUntilDate: Date | null = null;
        if (bbItem.validUntil) {
          try {
            const parsedDate = new Date(bbItem.validUntil);
            if (!isNaN(parsedDate.getTime())) {
              if (parsedDate.getTime() >= now.getTime()) {
                validUntilDate = parsedDate;
              } else {
                // Промокод истёк, но скидка всё ещё в BB — нужен перевыпуск
                discountsNeedingReissue.push(bbItem.id);
              }
            }
          } catch (error) {
            console.warn(`[discount-activation] Failed to parse validUntil for discount ${bbItem.id}:`, error);
          }
        }

        // Если BB вернул скидку без промокода — тоже нужен перевыпуск
        if (!newPromoCode && !discountsNeedingReissue.includes(bbItem.id)) {
          discountsNeedingReissue.push(bbItem.id);
        }

        await prisma.discountActivation.upsert({
          where: {
            userId_discountId: {
              userId,
              discountId: bbItem.id,
            },
          },
          create: {
            userId,
            discountId: bbItem.id,
            promoCode: newPromoCode,
            validUntil: validUntilDate,
            activatedAt: new Date(),
            syncedFromBB: true,
            lastSyncedAt: new Date(),
          },
          update: {
            ...(newPromoCode ? { promoCode: newPromoCode } : {}),
            ...(validUntilDate ? { validUntil: validUntilDate } : {}),
            syncedFromBB: true,
            lastSyncedAt: new Date(),
          },
        });
        
        if (existing) {
          if (promoCodeChanged) updated++;
        } else {
          synced++;
        }
      } catch (error: any) {
        errors.push(`Failed to save discount ${bbItem.id}: ${error.message}`);
      }
    }

    // ---- Автоперевыпуск деактивированных промокодов через POST /api/promo ----
    if (discountsNeedingReissue.length > 0 && bestBenefitsPassword) {
      console.log(`[discount-activation] 🔄 Auto-reissuing ${discountsNeedingReissue.length} expired/missing promo codes...`);
      let reissued = 0;

      for (const discountId of discountsNeedingReissue) {
        try {
          const result = await activateBestBenefitsDiscount({
            userId,
            bestBenefitsUserId: bestBenefitsUserId,
            discountId,
            email: bestBenefitsUserId,
            password: bestBenefitsPassword,
          });

          if (result.success && result.promoCode) {
            let reissueValidUntil: Date | null = null;
            if (result.data?.end_date) {
              const d = new Date(result.data.end_date);
              if (!isNaN(d.getTime()) && d.getTime() >= Date.now()) reissueValidUntil = d;
            }

            await prisma.discountActivation.upsert({
              where: { userId_discountId: { userId, discountId } },
              update: {
                promoCode: result.promoCode,
                ...(reissueValidUntil ? { validUntil: reissueValidUntil } : {}),
                lastSyncedAt: new Date(),
              },
              create: {
                userId,
                discountId,
                promoCode: result.promoCode,
                ...(reissueValidUntil ? { validUntil: reissueValidUntil } : {}),
                activatedAt: new Date(),
                syncedFromBB: true,
                lastSyncedAt: new Date(),
              },
            });

            reissued++;
            updated++;
            console.log(`[discount-activation] ✅ Reissued discount ${discountId}: ${result.promoCode}`);
          } else {
            console.log(`[discount-activation] ⚠️ Could not reissue discount ${discountId}: ${result.message}`);
          }

          // Rate limiting: BB allows ~1 req/sec
          await new Promise(r => setTimeout(r, 1200));
        } catch (error: any) {
          console.warn(`[discount-activation] Failed to reissue discount ${discountId}:`, error.message);
          // 429 — прекращаем попытки перевыпуска
          if (error.message?.includes("429")) break;
        }
      }

      console.log(`[discount-activation] ✅ Reissued ${reissued}/${discountsNeedingReissue.length} promo codes`);
    }

    // Помечаем скидки, которых больше нет в BB (но НЕ удаляем - вдруг это временный сбой API)
    // Удаляем только если они не обновлялись более 7 дней
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    
    const staleDiscounts = await prisma.discountActivation.findMany({
      where: {
        userId,
        discountId: { notIn: Array.from(bbDiscountIds) },
        lastSyncedAt: { lt: sevenDaysAgo },
      },
    });

    if (staleDiscounts.length > 0) {
      console.log(`[discount-activation] Removing ${staleDiscounts.length} stale discounts (not in BB for 7+ days)`);
      
      await prisma.discountActivation.deleteMany({
        where: {
          userId,
          discountId: { in: staleDiscounts.map(d => d.discountId) },
        },
      });
      
      expired = staleDiscounts.length;
    }

    // Удаляем скидки с истёкшим сроком действия
    const expiredResult = await prisma.discountActivation.deleteMany({
      where: {
        userId,
        validUntil: { lt: now },
      },
    });
    expired += expiredResult.count;

    console.log(`[discount-activation] ✅ Sync complete: ${synced} new, ${updated} updated, ${expired} expired`);

  } catch (error: any) {
    console.error(`[discount-activation] ❌ Sync failed:`, error);
    errors.push(`Sync failed: ${error.message}`);
    
    // FALLBACK: при ошибке API возвращаем данные из локальной БД
    const localCount = await prisma.discountActivation.count({ where: { userId } });
    if (localCount > 0) {
      console.log(`[discount-activation] 📦 Using fallback: ${localCount} discounts from local DB`);
      usedFallback = true;
    }
  }

  return { synced, expired, updated, errors, usedFallback };
}

/**
 * Обновить срок действия скидки из информации о скидке
 */
export async function updateDiscountValidity(
  userId: string,
  discountId: number,
  validUntil: string | null
): Promise<void> {
  if (!validUntil) return;

  const validUntilDate = new Date(validUntil);
  const now = new Date();

  // Если срок истек, удаляем скидку
  if (validUntilDate < now) {
    await prisma.discountActivation.deleteMany({
      where: { userId, discountId },
    });
    return;
  }

  // Обновляем срок действия
  await prisma.discountActivation.updateMany({
    where: { userId, discountId },
    data: { validUntil: validUntilDate },
  });
}

/**
 * Удалить устаревшие скидки для всех пользователей
 */
export async function cleanupExpiredDiscounts(): Promise<number> {
  const now = new Date();

  const result = await prisma.discountActivation.deleteMany({
    where: {
      validUntil: { lt: now },
    },
  });

  return result.count;
}

/**
 * Получить активированные скидки пользователя с проверкой срока действия
 * ОСНОВНОЙ МЕТОД для получения скидок пользователя
 * Автоматически удаляет истекшие промокоды
 */
export async function getValidActivatedDiscounts(
  userId: string
): Promise<Array<{
  discountId: number;
  promoCode: string | null;
  lastSyncedAt: Date | null;
}>> {
  const now = new Date();

  // Сначала удаляем все истекшие промокоды
  const expiredResult = await prisma.discountActivation.deleteMany({
    where: {
      userId,
      validUntil: { lt: now },
    },
  });

  if (expiredResult.count > 0) {
    console.log(`[discount-activation] 🗑️ Removed ${expiredResult.count} expired promo codes for user ${userId}`);
  }

  // Затем получаем только валидные
  const activations = await prisma.discountActivation.findMany({
    where: {
      userId,
      OR: [
        { validUntil: null }, // Скидки без срока действия
        { validUntil: { gte: now } }, // Скидки с неистекшим сроком
      ],
    },
    select: {
      discountId: true,
      promoCode: true,
      lastSyncedAt: true,
    },
    orderBy: { activatedAt: "desc" },
  });

  return activations;
}

/**
 * Проверить, активирована ли скидка пользователем
 */
export async function isDiscountActivated(
  userId: string,
  discountId: number
): Promise<boolean> {
  const now = new Date();

  const activation = await prisma.discountActivation.findFirst({
    where: {
      userId,
      discountId,
      OR: [
        { validUntil: null },
        { validUntil: { gte: now } },
      ],
    },
  });

  return !!activation;
}

/**
 * Получить промокод для активированной скидки
 */
export async function getDiscountPromoCode(
  userId: string,
  discountId: number
): Promise<string | null> {
  const now = new Date();

  const activation = await prisma.discountActivation.findFirst({
    where: {
      userId,
      discountId,
      OR: [
        { validUntil: null },
        { validUntil: { gte: now } },
      ],
    },
    select: { promoCode: true },
  });

  return activation?.promoCode || null;
}

/**
 * Получить время последней синхронизации
 */
export async function getLastSyncTime(userId: string): Promise<Date | null> {
  const latest = await prisma.discountActivation.findFirst({
    where: { userId },
    orderBy: { lastSyncedAt: "desc" },
    select: { lastSyncedAt: true },
  });

  return latest?.lastSyncedAt || null;
}

/**
 * Проверить, нужна ли синхронизация (прошло > N минут)
 */
export async function needsSync(userId: string, minutesThreshold: number = 10): Promise<boolean> {
  const lastSync = await getLastSyncTime(userId);
  
  if (!lastSync) return true;
  
  const timeSinceSync = Date.now() - lastSync.getTime();
  const thresholdMs = minutesThreshold * 60 * 1000;
  
  return timeSinceSync >= thresholdMs;
}
