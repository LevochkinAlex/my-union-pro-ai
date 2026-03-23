import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { fetchBestBenefitsDiscounts } from "@/lib/best-benefits";
import { prisma } from "@/lib/prisma";
import DiscountsPageWrapper from "@/components/dashboard/DiscountsPageWrapper";
import { PageHeader } from "@/components/ui";
import type { DiscountPreferenceResponse } from "@/types/discounts";

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
  
  console.log("[discounts/page] Loading discounts for user:", userId);

  let initialData;
  let preference;
  let user;

  try {
    // Пытаемся загрузить данные с таймаутом
    const fetchPromise = fetchBestBenefitsDiscounts({ limit: 20, page: 1 });
    const timeoutPromise = new Promise((_, reject) => 
      setTimeout(() => reject(new Error("Timeout loading discounts")), 30000)
    );
    
    [initialData, preference, user] = await Promise.all([
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
        // В схеме User нет поля region — только address + preferredDiscountCity
        select: { address: true, preferredDiscountCity: true },
      }).catch((error) => {
        console.error("[discounts] Error fetching user:", error);
        return null;
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
  }

  // Определяем город для фильтра из профиля пользователя
  let autoCityId: number | null = null;
  
  // 1. Приоритет: preferredDiscountCity (явно установленный пользователем)
  if (user?.preferredDiscountCity && initialData.cities?.length) {
    const city = pickBestCityMatch(initialData.cities, user.preferredDiscountCity);
    if (city) {
      autoCityId = city.id;
      console.log(`[discounts] Using preferred city from profile: ${city.name} (ID: ${city.id})`);
    }
  }
  
  // 2. Fallback: пытаемся извлечь из адреса/региона (если preferredDiscountCity не установлен)
  if (!autoCityId && user?.address) {
    const cityName = extractCityFromAddress(user.address, null);
    if (cityName && initialData.cities?.length) {
      const city = pickBestCityMatch(initialData.cities, cityName);
      if (city) {
        autoCityId = city.id;
        console.log(`[discounts] Auto-detected city from address: ${city.name} (ID: ${city.id})`);
      }
    }
  }

  // Приоритет: явный выбор пользователя в фильтрах (включая null = "Все города"),
  // затем fallback к городу из профиля/адреса.
  const savedFilters = (preference?.filters as any) ?? {};
  const hasSavedCityPreference = Object.prototype.hasOwnProperty.call(savedFilters, "cityId");
  const savedCityId: number | null | undefined = hasSavedCityPreference
    ? (savedFilters.cityId ?? null)
    : undefined;
  const finalCityId = savedCityId !== undefined ? savedCityId : autoCityId;
  
  const preferencePayload: DiscountPreferenceResponse = {
    pushEnabled: preference?.pushEnabled ?? false,
    filters: {
      ...(preference?.filters as DiscountPreferenceResponse["filters"]),
      // Приоритет: сохранённый выбор пользователя, затем fallback из профиля
      cityId: finalCityId,
    },
    geolocation: (preference?.geolocation as DiscountPreferenceResponse["geolocation"]) ?? null,
    updatedAt: preference?.updatedAt?.toISOString() ?? null,
  };
  
  // Логируем для отладки
  if (autoCityId) {
    console.log(`[discounts] Auto-selected city ID: ${autoCityId} from preferredDiscountCity: "${user?.preferredDiscountCity}"`);
  }

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
      />
    </div>
  );
}

/**
 * Подбор города из справочника BB по строке из профиля/адреса.
 *
 * Раньше использовался наивный `includes()`: для «Москва» первым совпадением часто оказывался
 * «Климовск (Москва)», т.к. в названии есть подстрока «москва».
 */
function pickBestCityMatch(
  cities: { id: number; name: string }[],
  userCity: string
): { id: number; name: string } | null {
  const u = userCity.trim().toLowerCase();
  if (!u || !cities.length) return null;

  const scoreCity = (cityName: string): number => {
    const n = cityName.trim().toLowerCase();
    if (!n) return 0;
    if (n === u) return 100;

    const base = n.replace(/\s*\([^)]*\)\s*/g, "").trim();
    const parenMatch = n.match(/\(([^)]+)\)/);
    const paren = parenMatch ? parenMatch[1].trim().toLowerCase() : "";

    if (base === u) return 92;
    if (n.startsWith(u + " ") || n.startsWith(u + "(")) return 88;
    if (base.startsWith(u + " ")) return 82;
    // «Зеленоград (Москва)» при запросе «Москва» — только регион в скобках, не основной город
    if (paren === u && base !== u) return 35;
    if (n.includes(u)) return 55;
    if (u.includes(n)) return 48;
    return 0;
  };

  const MIN_SCORE = 50;
  let best: { id: number; name: string } | null = null;
  let bestScore = 0;

  for (const c of cities) {
    const s = scoreCity(c.name);
    if (s < MIN_SCORE) continue;
    if (s > bestScore) {
      bestScore = s;
      best = c;
    } else if (s === bestScore && best) {
      if (c.name.length < best.name.length) best = c;
    }
  }

  return best;
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

