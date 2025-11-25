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

  if (!userId || typeof userId !== 'string') {
    redirect("/login");
  }

  const [initialData, preference, user] = await Promise.all([
    fetchBestBenefitsDiscounts({ limit: 20, page: 1 }), // Загружаем первую страницу, остальное через пагинацию
    getDiscountPreferenceSafe(userId),
    prisma.user.findUnique({
      where: { id: userId },
      select: { address: true, region: true, preferredDiscountCity: true }
    }).catch((error) => {
      console.error("[discounts] Error fetching user:", error);
      return null;
    }),
  ]);

  // Определяем город для фильтра из профиля пользователя
  let autoCityId: number | null = null;
  
  // 1. Приоритет: preferredDiscountCity (явно установленный пользователем)
  if (user?.preferredDiscountCity) {
    const city = initialData.cities?.find(c => 
      c.name.toLowerCase().includes(user.preferredDiscountCity!.toLowerCase()) ||
      user.preferredDiscountCity!.toLowerCase().includes(c.name.toLowerCase())
    );
    if (city) {
      autoCityId = city.id;
      console.log(`[discounts] Using preferred city from profile: ${city.name} (ID: ${city.id})`);
    }
  }
  
  // 2. Fallback: пытаемся извлечь из адреса/региона (если preferredDiscountCity не установлен)
  if (!autoCityId && (user?.address || user?.region)) {
    const cityName = extractCityFromAddress(user.address, user.region);
    if (cityName && initialData.cities) {
      const city = initialData.cities.find(c => 
        c.name.toLowerCase().includes(cityName.toLowerCase()) ||
        cityName.toLowerCase().includes(c.name.toLowerCase())
      );
      if (city) {
        autoCityId = city.id;
        console.log(`[discounts] Auto-detected city from address: ${city.name} (ID: ${city.id})`);
      }
    }
  }

  // Если в профиле есть preferredDiscountCity, принудительно используем его
  // (даже если в preference уже был сохранен другой город)
  const finalCityId = autoCityId ?? (preference?.filters as any)?.cityId ?? null;
  
  const preferencePayload: DiscountPreferenceResponse = {
    pushEnabled: preference?.pushEnabled ?? false,
    filters: {
      ...(preference?.filters as DiscountPreferenceResponse["filters"]),
      // Приоритет: город из профиля (preferredDiscountCity)
      cityId: finalCityId,
    },
    geolocation: (preference?.geolocation as DiscountPreferenceResponse["geolocation"]) ?? null,
    updatedAt: preference?.updatedAt?.toISOString() ?? null,
  };
  
  // Логируем для отладки
  if (autoCityId) {
    console.log(`[discounts] ✅ Auto-selected city ID: ${autoCityId} from preferredDiscountCity: "${user?.preferredDiscountCity}"`);
  }

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

/**
 * Извлекает название города из адреса или региона
 */
function extractCityFromAddress(address: string | null, region: string | null): string | null {
  if (!address && !region) return null;
  
  const text = (address || region || '').toLowerCase();
  
  // Паттерны для извлечения города
  const patterns = [
    /г\.?\s*([а-яё\-]+)/i,           // г. Казань, г.Москва
    /город\s+([а-яё\-]+)/i,          // город Казань
    /([а-яё\-]+)\s+г\.?$/i,          // Казань г.
    /^([а-яё\-]+)\s*,/i,             // Казань, ...
    /,\s*([а-яё\-]+)\s*,/i,          // ..., Казань, ...
  ];
  
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match && match[1]) {
      const city = match[1].trim();
      // Фильтруем служебные слова
      if (!['область', 'республика', 'край', 'район', 'улица', 'проспект', 'дом'].includes(city)) {
        return city.charAt(0).toUpperCase() + city.slice(1); // Capitalize
      }
    }
  }
  
  // Если не нашли через паттерны, пробуем использовать регион напрямую
  if (region) {
    // Убираем "область", "республика" и т.д.
    const cleanRegion = region
      .replace(/область|республика|край|округ/gi, '')
      .trim();
    if (cleanRegion) {
      return cleanRegion.charAt(0).toUpperCase() + cleanRegion.slice(1);
    }
  }
  
  return null;
}

