import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getValidActivatedDiscounts } from "@/lib/discount-activation";

const preferenceSchema = z.object({
  pushEnabled: z.boolean().optional(),
  filters: z
    .object({
      cityId: z.number().nullable().optional(),
      categoryIds: z.array(z.number()).optional(),
      premiumOnly: z.boolean().optional(),
      radiusKm: z.number().min(1).max(500).nullable().optional(),
      claimed: z.array(z.union([
        z.number(),
        z.object({
          id: z.number(),
          promoCode: z.string().nullable().optional(),
        }),
      ])).optional(),
      favorites: z.array(z.number()).optional(),
      view: z.string().optional(),
    })
    .passthrough() // Разрешаем дополнительные поля (claimed, favorites и т.д.)
    .optional(),
  geolocation: z
    .object({
      lat: z.number(),
      lng: z.number(),
      accuracy: z.number().nullable().optional(),
      cityId: z.number().nullable().optional(),
    })
    .nullable()
    .optional(),
});

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }

    const preference = await prisma.discountPreference.findUnique({
      where: { userId: session.user.id },
    });

    // Получаем активированные скидки из DiscountActivation (основной источник)
    const activations = await getValidActivatedDiscounts(session.user.id);
    const claimed = activations.map(a => ({
      id: a.discountId,
      promoCode: a.promoCode,
    }));

    if (!preference) {
      return NextResponse.json({
        pushEnabled: false,
        filters: {
          claimed,
          favorites: [],
        },
        geolocation: null,
        updatedAt: null,
      });
    }

    // Мерджим с DiscountPreference для обратной совместимости
    const filters = (preference.filters as any) || {};
    const favorites = Array.isArray(filters.favorites) ? filters.favorites : [];

    return NextResponse.json({
      pushEnabled: preference.pushEnabled,
      filters: {
        ...filters,
        claimed, // Используем данные из DiscountActivation
        favorites,
      },
      geolocation: preference.geolocation,
      updatedAt: preference.updatedAt,
    });
  } catch (error) {
    console.error("[api/discounts/preferences] Failed to read preference:", error);
    return NextResponse.json(
      { error: "Не удалось загрузить настройки уведомлений" },
      { status: 500 }
    );
  }
}

async function updatePreferences(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }

    const body = await request.json();
    
    // Получаем существующие preferences для мерджа
    const existingPreference = await prisma.discountPreference.findUnique({
      where: { userId: session.user.id },
    });

    const existingFilters = (existingPreference?.filters as any) || {};
    
    // Мерджим filters из запроса с существующими, но сохраняем массивы favorites и claimed
    // ВАЖНО: НЕ используем простой spread для claimed, чтобы не потерять промокоды!
    let updatedFilters = body.filters 
      ? { ...existingFilters, ...body.filters }
      : existingFilters;
    
    // Если favorites переданы, мерджим их правильно (объединяем массивы и убираем дубликаты)
    if (body.filters?.favorites && Array.isArray(body.filters.favorites)) {
      const existingFavorites = Array.isArray(existingFilters.favorites) 
        ? existingFilters.favorites 
        : [];
      // Объединяем и убираем дубликаты
      const mergedFavorites = [...new Set([...existingFavorites, ...body.filters.favorites])];
      updatedFilters = { ...updatedFilters, favorites: mergedFavorites };
    } else if (body.filters && 'favorites' in body.filters && body.filters.favorites === null) {
      // Если явно передано null, очищаем favorites
      updatedFilters = { ...updatedFilters, favorites: [] };
    } else if (!updatedFilters.favorites && existingFilters.favorites) {
      // Сохраняем существующие favorites, если они не были переданы
      updatedFilters = { ...updatedFilters, favorites: existingFilters.favorites };
    }
    
    // ВАЖНО: Мерджим claimed с сохранением промокодов
    // Если claimed переданы, мерджим их правильно с сохранением промокодов
    if (body.filters?.claimed && Array.isArray(body.filters.claimed)) {
      const existingClaimed = Array.isArray(existingFilters.claimed) 
        ? existingFilters.claimed 
        : [];
      
      // Создаем Map существующих промокодов для быстрого поиска
      const existingPromoCodesMap = new Map<string, string>();
      existingClaimed.forEach((item: any) => {
        if (typeof item === 'object' && item !== null && item.id && item.promoCode) {
          const discountId = String(item.id);
          const promoCode = typeof item.promoCode === 'string' 
            ? item.promoCode.trim() 
            : String(item.promoCode).trim();
          if (promoCode && promoCode.length > 0 && promoCode.toLowerCase() !== 'null' && promoCode.toLowerCase() !== 'undefined') {
            existingPromoCodesMap.set(discountId, promoCode);
          }
        }
      });
      
      // Мерджим claimed: приоритет у новых, но сохраняем промокоды из существующих
      const mergedClaimed = [...body.filters.claimed];
      
      // Для каждого нового элемента проверяем, есть ли промокод в существующих
      mergedClaimed.forEach((newItem: any, index: number) => {
        if (typeof newItem === 'object' && newItem !== null && newItem.id) {
          const discountId = String(newItem.id);
          const newPromoCode = newItem.promoCode 
            ? (typeof newItem.promoCode === 'string' ? newItem.promoCode.trim() : String(newItem.promoCode).trim())
            : null;
          
          // Валидируем новый промокод
          const validNewPromoCode = newPromoCode && 
            newPromoCode.length > 0 && 
            newPromoCode.toLowerCase() !== 'null' && 
            newPromoCode.toLowerCase() !== 'undefined'
            ? newPromoCode
            : null;
          
          // Если нового промокода нет, но есть существующий - используем его
          if (!validNewPromoCode) {
            const existingPromoCode = existingPromoCodesMap.get(discountId);
            if (existingPromoCode) {
              mergedClaimed[index] = {
                ...newItem,
                promoCode: existingPromoCode,
              };
              console.log(`[preferences] Preserved existing promo code for discount ${discountId}:`, existingPromoCode);
            }
          }
        }
      });
      
      // Добавляем существующие claimed, которых нет в новых (с их промокодами)
      const newIdsSet = new Set(mergedClaimed.map((item: any) => 
        typeof item === 'object' && item !== null ? String(item.id) : String(item)
      ));
      
      existingClaimed.forEach((existingItem: any) => {
        const discountId = typeof existingItem === 'object' && existingItem !== null 
          ? String(existingItem.id) 
          : String(existingItem);
        
        if (!newIdsSet.has(discountId)) {
          // Сохраняем существующий элемент с промокодом
          if (typeof existingItem === 'object' && existingItem !== null && existingItem.promoCode) {
            const promoCode = typeof existingItem.promoCode === 'string' 
              ? existingItem.promoCode.trim() 
              : String(existingItem.promoCode).trim();
            if (promoCode && promoCode.length > 0 && promoCode.toLowerCase() !== 'null' && promoCode.toLowerCase() !== 'undefined') {
              mergedClaimed.push(existingItem);
              console.log(`[preferences] Kept existing claimed discount ${discountId} with promo code`);
            }
          } else {
            mergedClaimed.push(existingItem);
          }
        }
      });
      
      updatedFilters = { ...updatedFilters, claimed: mergedClaimed };
      console.log(`[preferences] Merged claimed discounts: ${mergedClaimed.length} total, ${mergedClaimed.filter((item: any) => typeof item === 'object' && item.promoCode).length} with promo codes`);
    } else if (body.filters && 'claimed' in body.filters && body.filters.claimed === null) {
      // Если явно передано null, очищаем claimed
      updatedFilters = { ...updatedFilters, claimed: [] };
    } else if (!updatedFilters.claimed && existingFilters.claimed) {
      // Сохраняем существующие claimed, если они не были переданы
      updatedFilters = { ...updatedFilters, claimed: existingFilters.claimed };
    }

    // Валидируем только pushEnabled и geolocation через схему
    const parsed = preferenceSchema.partial().safeParse({
      pushEnabled: body.pushEnabled,
      geolocation: body.geolocation,
    });

    const updateData: any = {
      filters: updatedFilters,
    };

    if (parsed.success) {
      if (parsed.data.pushEnabled !== undefined) {
        updateData.pushEnabled = parsed.data.pushEnabled;
      }
      if (parsed.data.geolocation !== undefined) {
        updateData.geolocation = parsed.data.geolocation;
      }
    } else if (body.pushEnabled !== undefined) {
      updateData.pushEnabled = body.pushEnabled;
    }

    const preference = await prisma.discountPreference.upsert({
      where: { userId: session.user.id },
      update: updateData,
      create: {
        userId: session.user.id,
        pushEnabled: updateData.pushEnabled ?? false,
        filters: updateData.filters ?? null,
        geolocation: updateData.geolocation ?? null,
      },
    });
    
    // Проверяем, что промокоды действительно сохранились (если обновлялись claimed)
    if (body.filters?.claimed && Array.isArray(body.filters.claimed)) {
      const savedPrefs = await prisma.discountPreference.findUnique({
        where: { userId: session.user.id },
      });
      const savedClaimed = (savedPrefs?.filters as any)?.claimed || [];
      const savedPromoCodesCount = savedClaimed.filter((d: any) => 
        typeof d === 'object' && d.promoCode && 
        d.promoCode.trim().length > 0 && 
        d.promoCode.toLowerCase() !== 'null' && 
        d.promoCode.toLowerCase() !== 'undefined'
      ).length;
      
      console.log("[preferences] ✅ Verified saved promo codes in database:", {
        totalClaimed: savedClaimed.length,
        withPromoCodes: savedPromoCodesCount,
      });
    }

    console.log("[api/discounts/preferences] Updated preferences:", {
      userId: session.user.id,
      filters: preference.filters,
    });

    return NextResponse.json({
      pushEnabled: preference.pushEnabled,
      filters: preference.filters,
      geolocation: preference.geolocation,
      updatedAt: preference.updatedAt,
    });
  } catch (error) {
    console.error("[api/discounts/preferences] Failed to update preference:", error);
    return NextResponse.json(
      { error: "Не удалось сохранить настройки" },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest) {
  return updatePreferences(request);
}

export async function POST(request: NextRequest) {
  return updatePreferences(request);
}

