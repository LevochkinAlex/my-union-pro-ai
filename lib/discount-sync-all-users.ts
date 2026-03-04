/**
 * Массовая синхронизация скидок всех пользователей с BestBenefits
 *
 * Единый модуль для:
 * - Cron API (GET /api/cron/sync-user-discounts)
 * - CLI скрипта (pnpm sync:all-users-discounts)
 *
 * Источник истины: DiscountActivation
 * DiscountPreference обновляется для обратной совместимости
 */

import { prisma } from "@/lib/prisma";
import { decryptPassword } from "@/lib/best-benefits-password";
import {
  syncDiscountsWithBestBenefits,
  getValidActivatedDiscounts,
  updateDiscountValidity,
} from "@/lib/discount-activation";
import { fetchBestBenefitsDiscounts } from "@/lib/best-benefits";

const DELAY_BETWEEN_USERS_MS = 500;

export interface SyncAllUsersResult {
  successCount: number;
  errorCount: number;
  totalSynced: number;
  totalUpdated: number;
  usersProcessed: number;
  errors: string[];
}

export async function runSyncAllUsersDiscounts(options?: {
  onProgress?: (current: number, total: number, label: string, success: boolean) => void;
}): Promise<SyncAllUsersResult> {
  const result: SyncAllUsersResult = {
    successCount: 0,
    errorCount: 0,
    totalSynced: 0,
    totalUpdated: 0,
    usersProcessed: 0,
    errors: [],
  };

  const users = await prisma.user.findMany({
    where: { bestBenefitsUserId: { not: null } },
    select: {
      id: true,
      email: true,
      phone: true,
      bestBenefitsUserId: true,
      bestBenefitsPassword: true,
    },
  });

  for (let i = 0; i < users.length; i++) {
    const user = users[i];
    if (!user.bestBenefitsUserId) continue;

    const label = user.email || user.phone || user.id;

    try {
      let userPassword: string | undefined;
      if (user.bestBenefitsPassword) {
        try {
          userPassword = decryptPassword(user.bestBenefitsPassword);
        } catch (e) {
          result.errorCount++;
          result.errors.push(`${label}: ошибка расшифровки пароля`);
          options?.onProgress?.(i + 1, users.length, label, false);
          continue;
        }
      }

      const syncResult = await syncDiscountsWithBestBenefits(
        user.id,
        user.bestBenefitsUserId,
        userPassword
      );

      result.totalSynced += syncResult.synced;
      result.totalUpdated += syncResult.updated;

      const validActivations = await getValidActivatedDiscounts(user.id);
      if (validActivations.length > 0) {
        try {
          const batchSize = 50;
          for (let j = 0; j < validActivations.length; j += batchSize) {
            const batch = validActivations.slice(j, j + batchSize);
            const idsParam = batch.map((a) => a.discountId).join(",");
            const discountsData = await fetchBestBenefitsDiscounts({
              ids: idsParam,
              limit: batchSize,
            });
            for (const discount of discountsData.discounts) {
              if (discount.validUntil) {
                await updateDiscountValidity(
                  user.id,
                  discount.id,
                  discount.validUntil
                );
              }
            }
          }
        } catch {
          // не критично
        }
      }

      const finalActivations = await getValidActivatedDiscounts(user.id);

      const existingPrefs = await prisma.discountPreference.findUnique({
        where: { userId: user.id },
      });
      const existingFilters = (existingPrefs?.filters as Record<string, unknown>) || {};
      const existingFavorites = Array.isArray(existingFilters.favorites)
        ? existingFilters.favorites
        : [];
      const claimed = finalActivations.map((a) => ({
        id: a.discountId,
        promoCode: a.promoCode,
      }));

      await prisma.discountPreference.upsert({
        where: { userId: user.id },
        create: {
          userId: user.id,
          pushEnabled: false,
          filters: { claimed, favorites: existingFavorites },
        },
        update: {
          filters: { claimed, favorites: existingFavorites },
        },
      });

      result.successCount++;
      result.usersProcessed++;
      options?.onProgress?.(i + 1, users.length, label, true);
    } catch (error) {
      result.errorCount++;
      result.errors.push(`${label}: ${(error as Error).message}`);
      options?.onProgress?.(i + 1, users.length, label, false);
    }

    await new Promise((r) => setTimeout(r, DELAY_BETWEEN_USERS_MS));
  }

  return result;
}
