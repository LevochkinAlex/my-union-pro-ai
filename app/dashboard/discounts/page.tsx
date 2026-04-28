import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { fetchBestBenefitsDiscounts } from "@/lib/best-benefits";
import { prisma } from "@/lib/prisma";
import DiscountsPageWrapper from "@/components/dashboard/DiscountsPageWrapper";
import { PageHeader } from "@/components/ui";
import type { DiscountItem, DiscountPreferenceResponse } from "@/types/discounts";
import { fetchPartnerVenuesForDiscountCatalog } from "@/lib/fetch-partner-venues-discount-catalog";
import { isDemoUserId, getDemoDiscounts } from "@/lib/demo";

// Указываем, что страница динамическая (использует getServerSession)
export const dynamic = 'force-dynamic';

export default async function DiscountsPage() {
  const session = await getServerSession(authOptions);
  
  // ИСПРАВЛЕНО: Добавлено логирование
  if (!session?.user?.id) {
    console.log("[discounts/page] No session or user ID, redirecting to /login");
    redirect("/login");
  }

  const userId = session.user.id;

  if (!userId || typeof userId !== 'string') {
    console.log("[discounts/page] Invalid userId type:", typeof userId, "- redirecting to /login");
    redirect("/login");
  }

  if (isDemoUserId(userId)) {
    const { discounts } = getDemoDiscounts();
    const demoData = {
      discounts,
      categories: [],
      cities: [],
      meta: { total: discounts.length, page: 1, limit: 20, hasMore: false },
      source: "demo",
    } as any;
    const demoPreference: DiscountPreferenceResponse = {
      pushEnabled: false,
      filters: { cityId: null, categoryIds: [], premiumOnly: false, claimed: [], favorites: [], view: "all" } as any,
      geolocation: null,
      updatedAt: null,
    };
    return (
      <div className="space-y-6">
        <PageHeader title="Скидки" description="Каталог скидок для членов профсоюза (демо-режим)" />
        <DiscountsPageWrapper initialData={demoData} initialPreference={demoPreference} />
      </div>
    );
  }
  
  console.log("[discounts/page] Loading discounts for user:", userId);

  let initialData;
  let preference;
  let user;
  let initialPartnerVenues: DiscountItem[] = [];

  try {
    // Пытаемся загрузить данные с таймаутом
    const fetchPromise = fetchBestBenefitsDiscounts({ limit: 20, page: 1 });
    const timeoutPromise = new Promise((_, reject) => 
      setTimeout(() => reject(new Error("Timeout loading discounts")), 30000)
    );
    
    [initialData, preference, user, initialPartnerVenues] = await Promise.all([
      Promise.race([fetchPromise, timeoutPromise]).catch((error) => {
        console.error("[discounts/page] Error loading discounts:", error);
        // Возвращаем пустую структуру данных в случае ошибки
        return {
          discounts: [],
          categories: [],
          cities: [],
          meta: {
            total: 0,
            page: 1,
            limit: 20,
            hasMore: false,
          },
          source: "error",
        } as any;
      }),
      getDiscountPreferenceSafe(userId),
      prisma.user.findUnique({
        where: { id: userId },
        select: { preferredDiscountCity: true },
      }).catch((error) => {
        console.error("[discounts] Error fetching user:", error);
        return null;
      }),
      fetchPartnerVenuesForDiscountCatalog({ limit: 50 }).catch((err) => {
        console.warn("[discounts/page] Partner venues (SSR) failed:", err);
        return [] as DiscountItem[];
      }),
    ]);
  } catch (error) {
    console.error("[discounts/page] Critical error loading page:", error);
    // Возвращаем минимальную структуру для отображения страницы
    initialData = {
      discounts: [],
      categories: [],
      cities: [],
      meta: {
        total: 0,
        page: 1,
        limit: 20,
        hasMore: false,
      },
      source: "error",
    } as any;
    preference = null;
    user = null;
    initialPartnerVenues = [];
  }

  // По умолчанию — полный каталог без фильтра по городу.
  // Город применяется только если пользователь явно сохранил выбор в DiscountPreference.
  const savedFilters = (preference?.filters as any) ?? {};
  const hasSavedCityPreference = Object.prototype.hasOwnProperty.call(savedFilters, "cityId");
  const savedCityId: number | null | undefined = hasSavedCityPreference
    ? (savedFilters.cityId ?? null)
    : undefined;
  const finalCityId = savedCityId !== undefined ? savedCityId : null;

  const preferencePayload: DiscountPreferenceResponse = {
    pushEnabled: preference?.pushEnabled ?? false,
    filters: {
      ...(preference?.filters as DiscountPreferenceResponse["filters"]),
      cityId: finalCityId,
    },
    geolocation: (preference?.geolocation as DiscountPreferenceResponse["geolocation"]) ?? null,
    updatedAt: preference?.updatedAt?.toISOString() ?? null,
  };

  return (
    <div className="space-y-4">
      <PageHeader
        title="Скидки от партнёров"
        description="Скидки, бонусы и спецпредложения для членов профсоюзов"
      />

      <DiscountsPageWrapper
        initialData={initialData}
        initialPreference={preferencePayload}
        preferredCityName={user?.preferredDiscountCity ?? undefined}
        initialPartnerVenues={initialPartnerVenues}
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

