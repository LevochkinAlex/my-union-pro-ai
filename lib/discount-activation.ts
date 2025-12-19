/**
 * Утилиты для работы с активированными скидками
 * 
 * Обеспечивает:
 * - Сохранение промокодов в нашей БД (даже если BestBenefits очистит базу)
 * - Проверку срока действия скидок
 * - Автоматическое удаление устаревших скидок
 * - Синхронизацию с BestBenefits
 */

import { prisma } from "@/lib/prisma";
import { getUserActivatedDiscounts } from "@/lib/best-benefits-activation";
import { decryptPassword } from "@/lib/best-benefits-password";
import type { DiscountItem } from "@/types/discounts";

export interface DiscountActivationData {
  discountId: number;
  promoCode?: string | null;
  validUntil?: string | null; // ISO date string
  activatedAt?: Date;
}

/**
 * Получить активированные скидки пользователя из нашей БД
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
      // Обновляем промокод только если он валидный и не пустой
      promoCode: data.promoCode && data.promoCode.trim().length > 0
        ? data.promoCode.trim()
        : undefined, // Не обновляем, если промокод невалидный
      validUntil,
      lastSyncedAt: new Date(),
    },
  });
}

/**
 * Синхронизировать активированные скидки с BestBenefits
 * Сохраняет промокоды в нашу БД, даже если BestBenefits очистит базу
 */
export async function syncDiscountsWithBestBenefits(
  userId: string,
  bestBenefitsUserId: string,
  bestBenefitsPassword?: string
): Promise<{
  synced: number;
  expired: number;
  errors: string[];
}> {
  const errors: string[] = [];
  let synced = 0;
  let expired = 0;

  try {
    // Получаем активированные скидки из BestBenefits
    const bbActivated = await getUserActivatedDiscounts(
      bestBenefitsUserId,
      bestBenefitsPassword,
      {
        timeout: 20000,
        retries: 3,
      }
    );

    // Получаем информацию о скидках для проверки сроков действия
    // Пока сохраняем то, что получили из BestBenefits
    // В будущем можно добавить запрос к /api/products для получения validUntil

    const now = new Date();

    // Сохраняем каждую активированную скидку в нашу БД
    for (const bbItem of bbActivated) {
      try {
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
            promoCode: bbItem.promoCode || null,
            validUntil: null, // Будет обновлено при следующей синхронизации с информацией о скидке
            activatedAt: new Date(),
            syncedFromBB: true,
            lastSyncedAt: new Date(),
          },
          update: {
            // Обновляем промокод из BestBenefits, но сохраняем локальный, если BestBenefits вернул null
            promoCode: bbItem.promoCode && bbItem.promoCode.trim().length > 0
              ? bbItem.promoCode.trim()
              : undefined, // Не обновляем, если BestBenefits вернул пустой промокод
            syncedFromBB: true,
            lastSyncedAt: new Date(),
          },
        });
        synced++;
      } catch (error: any) {
        errors.push(`Failed to save discount ${bbItem.id}: ${error.message}`);
      }
    }

    // Удаляем устаревшие скидки (validUntil < now)
    const expiredResult = await prisma.discountActivation.deleteMany({
      where: {
        userId,
        validUntil: {
          lt: now,
        },
      },
    });
    expired = expiredResult.count;
  } catch (error: any) {
    errors.push(`Sync failed: ${error.message}`);
  }

  return { synced, expired, errors };
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
      where: {
        userId,
        discountId,
      },
    });
    return;
  }

  // Обновляем срок действия
  await prisma.discountActivation.updateMany({
    where: {
      userId,
      discountId,
    },
    data: {
      validUntil: validUntilDate,
    },
  });
}

/**
 * Удалить устаревшие скидки для всех пользователей
 * Можно запускать по расписанию (например, раз в день)
 */
export async function cleanupExpiredDiscounts(): Promise<number> {
  const now = new Date();

  const result = await prisma.discountActivation.deleteMany({
    where: {
      validUntil: {
        lt: now,
      },
    },
  });

  return result.count;
}

/**
 * Получить активированные скидки пользователя с проверкой срока действия
 */
export async function getValidActivatedDiscounts(
  userId: string
): Promise<Array<{
  discountId: number;
  promoCode: string | null;
}>> {
  const now = new Date();

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
    },
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
    select: {
      promoCode: true,
    },
  });

  return activation?.promoCode || null;
}

