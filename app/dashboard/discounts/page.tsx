import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { fetchBestBenefitsDiscounts } from "@/lib/best-benefits";
import { prisma } from "@/lib/prisma";
import DiscountsClient from "@/components/dashboard/discounts/DiscountsClient";
import type { DiscountPreferenceResponse } from "@/types/discounts";

export default async function DiscountsPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    redirect("/login");
  }

  const userId = session.user.id;

  const [initialData, preference] = await Promise.all([
    fetchBestBenefitsDiscounts({ limit: 100 }),
    getDiscountPreferenceSafe(userId),
  ]);

  const preferencePayload: DiscountPreferenceResponse = {
    pushEnabled: preference?.pushEnabled ?? false,
    filters: (preference?.filters as DiscountPreferenceResponse["filters"]) ?? null,
    geolocation: (preference?.geolocation as DiscountPreferenceResponse["geolocation"]) ?? null,
    updatedAt: preference?.updatedAt?.toISOString() ?? null,
  };

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm font-semibold uppercase tracking-wider text-blue-600 dark:text-blue-400">
          Партнёрские программы
        </p>
        <h1 className="mt-2 text-3xl font-bold text-gray-900 dark:text-white">
          Скидки от BestBenefits
        </h1>
        <p className="mt-2 max-w-2xl text-gray-600 dark:text-gray-400">
          Подборка скидок, бонусов и специальных предложений для членов профсоюзов.
          Используйте фильтры, чтобы подобрать актуальные предложения в вашем городе и включите уведомления,
          чтобы не пропустить новые акции.
        </p>
      </div>

      <DiscountsClient
        initialData={initialData}
        initialPreference={preferencePayload}
      />
    </div>
  );
}

async function getDiscountPreferenceSafe(userId: string) {
  try {
    return await (prisma as any).discountPreference.findUnique({
      where: { userId },
    });
  } catch (error: any) {
    if (error?.code === "P2021" || error?.code === "P2010") {
      console.warn("[discounts] DiscountPreference table not available yet:", error.code);
      return null;
    }
    throw error;
  }
}

