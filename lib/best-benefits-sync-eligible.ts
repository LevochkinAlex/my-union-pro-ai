/**
 * Единая точка: создать пользователя в BestBenefits, когда это возможно.
 * Условия: USE_REAL_BB_API=true, email подтверждён, есть имя и фамилия, bestBenefitsUserId ещё нет.
 *
 * Сценарии: подтвердили email до заполнения ФИО — первая попытка sync не шла;
 * после сохранения профиля вызываем снова.
 */

import crypto from "crypto";
import { prisma } from "@/lib/prisma";
import { syncUserToBestBenefits } from "@/lib/best-benefits-users";
import { decryptPassword, encryptPassword } from "@/lib/best-benefits-password";
import { clearBestBenefitsUserTokenCache } from "@/lib/best-benefits-user-auth";

const LOG = "[best-benefits-sync-eligible]";

export function scheduleSyncBestBenefitsIfEligible(userId: string, context = "unknown"): void {
  void syncBestBenefitsIfEligible(userId, context).catch((e) => {
    console.error(`${LOG} unhandled (${context}):`, e);
  });
}

/** @returns true если синхронизация прошла успешно */
export async function syncBestBenefitsIfEligible(userId: string, context = "unknown"): Promise<boolean> {
  if (process.env.USE_REAL_BB_API !== "true") {
    return false;
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      emailVerified: true,
      firstName: true,
      lastName: true,
      bestBenefitsUserId: true,
      bestBenefitsPassword: true,
    },
  });

  if (!user?.email?.trim()) {
    console.log(`${LOG} skip (${context}): no email`);
    return false;
  }
  if (!user.emailVerified) {
    console.log(`${LOG} skip (${context}): email not verified`);
    return false;
  }
  if (!user.firstName?.trim() || !user.lastName?.trim()) {
    console.log(`${LOG} skip (${context}): first/last name missing`);
    return false;
  }
  if (user.bestBenefitsUserId) {
    return false;
  }

  console.log(`${LOG} syncing (${context}) user=${userId}`);

  try {
    let bbPassword: string;
    if (user.bestBenefitsPassword) {
      try {
        bbPassword = decryptPassword(user.bestBenefitsPassword);
      } catch {
        bbPassword = crypto.randomBytes(12).toString("base64").slice(0, 12);
        await prisma.user.update({
          where: { id: userId },
          data: { bestBenefitsPassword: encryptPassword(bbPassword) },
        });
      }
    } else {
      bbPassword = crypto.randomBytes(12).toString("base64").slice(0, 12);
      await prisma.user.update({
        where: { id: userId },
        data: { bestBenefitsPassword: encryptPassword(bbPassword) },
      });
    }

    const bbData = await syncUserToBestBenefits({
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      password: bbPassword,
      city_id: null,
    });

    await prisma.user.update({
      where: { id: userId },
      data: {
        bestBenefitsUserId: bbData.bestBenefitsUserId,
        bestBenefitsStatus: bbData.status,
        bestBenefitsCreatedAt: new Date(),
      },
    });

    clearBestBenefitsUserTokenCache(user.email);
    if (bbData.bestBenefitsUserId && bbData.bestBenefitsUserId !== user.email) {
      clearBestBenefitsUserTokenCache(bbData.bestBenefitsUserId);
    }

    console.log(`${LOG} OK (${context}) bestBenefitsUserId=${bbData.bestBenefitsUserId}`);
    return true;
  } catch (error) {
    console.error(`${LOG} failed (${context}):`, error);
    return false;
  }
}
