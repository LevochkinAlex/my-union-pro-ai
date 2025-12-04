"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import type { DiscountItem } from "@/types/discounts";
import Image from "next/image";
import { generatePromoCard } from "@/lib/promo-card-generator";

export default function MyDiscountsPage() {
  const router = useRouter();
  const { data: session } = useSession();
  const [discounts, setDiscounts] = useState<DiscountItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"claimed" | "favorites">("claimed");
  const [isSyncing, setIsSyncing] = useState(false);
  const [downloading, setDownloading] = useState<number | null>(null);
  const [copiedPromoId, setCopiedPromoId] = useState<number | null>(null);
  const [showPromoCardModal, setShowPromoCardModal] = useState(false);
  const [promoCardData, setPromoCardData] = useState<{ dataUrl: string; blob: Blob; discount: DiscountItem } | null>(null);

  useEffect(() => {
    // Пытаемся восстановить состояние из sessionStorage при возврате на страницу
    if (typeof window !== 'undefined') {
      const savedState = sessionStorage.getItem('myDiscountsState');
      if (savedState) {
        try {
          const parsed = JSON.parse(savedState);
          if (parsed.discounts && Array.isArray(parsed.discounts) && parsed.discounts.length > 0) {
            console.log("[MyDiscounts] Restoring state from sessionStorage");
            setDiscounts(parsed.discounts);
            setActiveTab(parsed.activeTab || "claimed");
            setLoading(false);
            // Очищаем сохраненное состояние после восстановления
            sessionStorage.removeItem('myDiscountsState');
            return; // Не выполняем полную загрузку, если восстановили состояние
          }
        } catch (error) {
          console.warn("[MyDiscounts] Failed to restore state:", error);
          sessionStorage.removeItem('myDiscountsState');
        }
      }
    }
    
    // Синхронизация с BestBenefits при загрузке страницы, затем загрузка скидок
    // Это гарантирует, что промокоды всегда актуальны
    const initPage = async () => {
      try {
        // Синхронизируемся с BestBenefits для получения актуальных промокодов
        await syncWithBestBenefits(false);
        // Загружаем скидки после синхронизации
        await loadMyDiscounts();
      } catch (error) {
        console.error("[MyDiscounts] Error during initialization:", error);
        // В случае ошибки все равно загружаем скидки (с локальными данными)
        await loadMyDiscounts();
      }
    };
    
    initPage();
  }, []);

  useEffect(() => {
    // При смене вкладки просто перезагружаем без синхронизации
    if (activeTab) {
      loadMyDiscounts();
    }
  }, [activeTab]);

  const syncWithBestBenefits = async (force: boolean = false) => {
    if (isSyncing) return;
    
    setIsSyncing(true);
    try {
      console.log("[MyDiscounts] Starting sync with BestBenefits...", { force });
      
      // Используем менеджер синхронизации с кэшированием
      const { syncManager } = await import("@/lib/sync-manager");
      const result = await syncManager.sync(force);
      
      if (result.success && !result.cached) {
        console.log("[MyDiscounts] ✅ Sync completed, reloading discounts...", result);
        // Перезагружаем скидки после успешной синхронизации (не кэшированной)
        await loadMyDiscounts();
      } else if (result.cached) {
        console.log("[MyDiscounts] ⏭️ Using cached result:", result.message);
      } else {
        console.error("[MyDiscounts] ❌ Sync failed:", result.message);
      }
    } catch (error) {
      console.error("[MyDiscounts] ❌ Sync error:", error);
    } finally {
      setIsSyncing(false);
    }
  };

  const loadMyDiscounts = async () => {
    setLoading(true);
    try {
      console.log("[MyDiscounts] Loading preferences...");
      
      // Load user preferences
      const prefsResponse = await fetch("/api/discounts/preferences");
      
      if (!prefsResponse.ok) {
        console.error("[MyDiscounts] Failed to load preferences:", prefsResponse.status);
        throw new Error(`Failed to load preferences: ${prefsResponse.status}`);
      }
      
      const prefsData = await prefsResponse.json();
      console.log("[MyDiscounts] Preferences loaded:", prefsData);
      
      const filters = prefsData.filters || {};
      
      // Extract IDs from claimed (может быть массив объектов или чисел)
      // Надежная обработка разных форматов данных
      const claimedData = Array.isArray(filters.claimed) ? filters.claimed : [];
      
      // Нормализуем формат: преобразуем старый формат (числа) в новый (объекты)
      const normalizedClaimedData = claimedData.map((item: any) => {
        if (typeof item === 'object' && item !== null && item.id) {
          // Уже в правильном формате - убеждаемся, что promoCode есть
          return {
            id: item.id,
            promoCode: item.promoCode || null,
          };
        }
        if (typeof item === 'number') {
          // Старый формат: преобразуем в объект
          return { id: item, promoCode: null };
        }
        return null;
      }).filter(Boolean);
      
      console.log("[MyDiscounts] Normalized claimed data:", normalizedClaimedData);
      
      const claimedIds = normalizedClaimedData.map((item: any) => String(item.id)).filter(Boolean);
      
      const favoriteIds = (filters.favorites || []).map((id: any) => String(id));
      
      console.log("[MyDiscounts] IDs to fetch:", {
        activeTab,
        claimedIds: claimedIds.length,
        favoriteIds: favoriteIds.length,
        claimedIdsList: claimedIds,
        favoriteIdsList: favoriteIds,
      });
      
      // Determine which IDs to fetch
      const idsToFetch = activeTab === "claimed" ? claimedIds : favoriteIds;
      
      if (idsToFetch.length === 0) {
        console.log("[MyDiscounts] No discounts to fetch");
        setDiscounts([]);
        setLoading(false);
        return;
      }

      console.log("[MyDiscounts] Fetching discounts for IDs:", idsToFetch);
      
      // Fetch discounts by IDs
      const discountsResponse = await fetch(`/api/discounts?ids=${idsToFetch.join(",")}`);
      
      if (!discountsResponse.ok) {
        console.error("[MyDiscounts] Failed to fetch discounts:", discountsResponse.status);
        throw new Error(`Failed to fetch discounts: ${discountsResponse.status}`);
      }
      
      const discountsData = await discountsResponse.json();
      console.log("[MyDiscounts] Fetched", discountsData.discounts?.length || 0, "discounts");
      
      // Добавляем промокоды из preferences к данным скидок
      console.log("[MyDiscounts] Raw claimed data:", claimedData);
      console.log("[MyDiscounts] Discounts from API:", discountsData.discounts);
      
      // Надежная обработка промокодов для всех пользователей
      // Промокоды показываем для всех скидок, которые есть в списке полученных
      // ВАЖНО: это работает независимо от активной вкладки (claimed или favorites)
      console.log("[MyDiscounts] Processing discounts for promo codes...");
      console.log("[MyDiscounts] Active tab:", activeTab);
      console.log("[MyDiscounts] Normalized claimed data:", normalizedClaimedData);
      console.log("[MyDiscounts] Discounts from API:", discountsData.discounts?.map((d: any) => ({ id: d.id, title: d.title, promoCode: d.promoCode })));
      
      const discountsWithPromoCodes = (discountsData.discounts || []).map((discount: DiscountItem) => {
        // Проверяем, получена ли скидка (для обеих вкладок)
        // Нормализуем ID к строке для надежного сравнения
        const discountIdStr = String(discount.id);
        const isClaimed = claimedIds.includes(discountIdStr);
        
        // Находим элемент в списке полученных (для получения промокода из preferences)
        const claimedItem = normalizedClaimedData.find((item: any) => {
          return item && String(item.id) === discountIdStr;
        });
        
        console.log(`[MyDiscounts] Processing discount ${discount.id} (${discount.title}): isClaimed=${isClaimed}, activeTab=${activeTab}, hasPromoCodeFromAPI=${!!discount.promoCode}, claimedIds includes: ${claimedIds.includes(discountIdStr)}`);
        
        // Промокоды показываем только если скидка получена (независимо от активной вкладки)
        if (isClaimed) {
          // Приоритет 1: промокод из API (уже обогащен из preferences)
          let promoCode: string | undefined = undefined;
          
          if (discount.promoCode && typeof discount.promoCode === 'string' && discount.promoCode.trim().length > 0) {
            promoCode = discount.promoCode.trim();
            console.log(`[MyDiscounts] ✅ Using promo code from API for discount ${discount.id}:`, promoCode);
          } else if (claimedItem && claimedItem.promoCode) {
            // Приоритет 2: промокод из normalizedClaimedData (fallback)
            // Это особенно важно для вкладки "Избранное", где API может не обогатить промокодом
            console.log(`[MyDiscounts] Found claimed item for discount ${discount.id}:`, claimedItem);
            if (typeof claimedItem.promoCode === 'string' && claimedItem.promoCode.trim().length > 0) {
              promoCode = claimedItem.promoCode.trim();
              console.log(`[MyDiscounts] ✅ Using promo code from preferences for discount ${discount.id}:`, promoCode);
            } else {
              console.log(`[MyDiscounts] ⚠️ Claimed item has invalid promo code:`, claimedItem.promoCode);
            }
          } else {
            // Приоритет 3: пытаемся найти промокод в исходных данных (для старого формата)
            const rawClaimedItem = claimedData.find((item: any) => {
              const itemId = typeof item === 'object' && item !== null ? item.id : item;
              return String(itemId) === String(discount.id);
            });
            
            if (rawClaimedItem && typeof rawClaimedItem === 'object' && rawClaimedItem.promoCode) {
              promoCode = typeof rawClaimedItem.promoCode === 'string' && rawClaimedItem.promoCode.trim().length > 0
                ? rawClaimedItem.promoCode.trim()
                : undefined;
              if (promoCode) {
                console.log(`[MyDiscounts] ✅ Using promo code from raw claimed data for discount ${discount.id}:`, promoCode);
              }
            }
          }
          
          // Возвращаем discount с промокодом
          const result = { ...discount, promoCode };
          console.log(`[MyDiscounts] Final discount ${discount.id}:`, { id: result.id, title: result.title, promoCode: result.promoCode });
          return result;
        }
        
        // Если скидка не получена, возвращаем без промокода
        console.log(`[MyDiscounts] ⚠️ Discount ${discount.id} is not claimed, no promo code`);
        return discount;
      });
      
      console.log("[MyDiscounts] Discounts with promo codes:", discountsWithPromoCodes.map(d => ({ id: d.id, title: d.title, promoCode: d.promoCode })));
      
      // Убеждаемся, что промокоды действительно сохранены в каждом объекте
      const finalDiscounts = discountsWithPromoCodes.map(d => {
        const claimedItem = normalizedClaimedData.find((item: any) => {
          return item && String(item.id) === String(d.id);
        });
        
        // Если скидка получена, но промокод отсутствует, пытаемся восстановить его
        if (claimedItem && !d.promoCode && claimedItem.promoCode) {
          const promoCode = typeof claimedItem.promoCode === 'string' && claimedItem.promoCode.trim().length > 0
            ? claimedItem.promoCode.trim()
            : undefined;
          if (promoCode) {
            console.log(`[MyDiscounts] 🔧 Restoring missing promo code for discount ${d.id}:`, promoCode);
            return { ...d, promoCode };
          }
        }
        return d;
      });
      
      console.log("[MyDiscounts] Final discounts with promo codes:", finalDiscounts.map(d => ({ id: d.id, title: d.title, promoCode: d.promoCode })));
      
      setDiscounts(finalDiscounts);
    } catch (error) {
      console.error("[MyDiscounts] Failed to load my discounts:", error);
      // Показываем пустой список вместо вечной загрузки
      setDiscounts([]);
    } finally {
      setLoading(false);
    }
  };

  const handleCopyPromoCode = async (discount: DiscountItem) => {
    if (!discount.promoCode) return;
    
    try {
      await navigator.clipboard.writeText(discount.promoCode);
      setCopiedPromoId(discount.id);
      setTimeout(() => setCopiedPromoId(null), 2000); // Сброс через 2 секунды
    } catch (error) {
      console.error("Failed to copy promo code:", error);
      alert("Не удалось скопировать промокод");
    }
  };

  const handleDownloadPromoCard = async (discount: DiscountItem) => {
    setDownloading(discount.id);
    
    try {
      console.log("[handleDownloadPromoCard] Starting generation for discount:", discount.id);
      
      // Функция для проверки, что имя не является географическим названием
      const isValidName = (name: string | null | undefined): boolean => {
        if (!name) return false;
        const geographicNames = [
          "татарстан", "башкортостан", "чувашия", "удмуртия", "мордовия",
          "москва", "петербург", "санкт", "новгород", "казань", "екатеринбург",
          "отлично", "хорошо", "плохо", "да", "нет"
        ];
        const lowerName = name.toLowerCase().trim();
        return !geographicNames.some(geo => lowerName.includes(geo));
      };
      
      // Получаем имя пользователя
      let userName = "Пользователь";
      
      // 1. Пробуем использовать имя из сессии
      if (session?.user?.name && isValidName(session.user.name)) {
        userName = session.user.name;
        console.log("[handleDownloadPromoCard] Using name from session:", userName);
      } else {
        // 2. Пробуем получить из профиля
        const userResponse = await fetch("/api/profile");
        if (userResponse.ok) {
          const userData = await userResponse.json();
          const firstName = userData.user?.firstName;
          const lastName = userData.user?.lastName;
          
          // Проверяем валидность имени и фамилии
          if (firstName && lastName && isValidName(firstName) && isValidName(lastName)) {
            userName = `${firstName} ${lastName}`;
            console.log("[handleDownloadPromoCard] Using name from profile:", userName);
          } else if (userData.user?.email) {
            // Используем email как fallback
            userName = userData.user.email.split("@")[0];
            console.log("[handleDownloadPromoCard] Using email as fallback:", userName);
          }
        }
      }

      console.log("[handleDownloadPromoCard] Final user name:", userName);
      console.log("[handleDownloadPromoCard] Discount data:", {
        promoCode: discount.promoCode,
        title: discount.title,
        imageUrl: discount.imageUrl ? discount.imageUrl.substring(0, 100) + '...' : 'null',
      });

      // Генерируем карточку
      const { blob, dataUrl } = await generatePromoCard({
        promoCode: discount.promoCode, // может быть undefined
        userName: userName,
        discountName: discount.title,
        discountDescription: discount.shortDescription,
        imageUrl: discount.imageUrl ?? undefined,
        validUntil: discount.validUntil ? new Date(discount.validUntil) : undefined,
      });

      console.log("[handleDownloadPromoCard] Card generated:", { size: blob.size, type: blob.type });

      // Открываем модалку с превью
      setPromoCardData({ dataUrl, blob, discount });
      setShowPromoCardModal(true);
      
    } catch (error) {
      console.error("[handleDownloadPromoCard] Failed to generate promo card:", error);
      alert(`Не удалось создать карточку: ${error instanceof Error ? error.message : 'Неизвестная ошибка'}`);
    } finally {
      setDownloading(null);
    }
  };

  const handleDownloadFromModal = () => {
    if (!promoCardData) return;
    
    const url = URL.createObjectURL(promoCardData.blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `promo-card-${promoCardData.discount.id}.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleAddToWallet = () => {
    // Определяем платформу
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
    const isAndroid = /Android/.test(navigator.userAgent);
    
    if (isIOS) {
      // Для iOS - добавление в Apple Wallet требует .pkpass файл
      // Это сложный процесс, требующий серверного API
      alert("Функция добавления в Apple Wallet будет доступна в ближайшее время");
    } else if (isAndroid) {
      // Для Android - Google Pay Passes API
      alert("Функция добавления в Google Pay будет доступна в ближайшее время");
    } else {
      // Для десктопа - просто скачиваем
      handleDownloadFromModal();
    }
  };

  const handleViewDiscount = (discountId: number) => {
    // Сохраняем текущее состояние перед навигацией
    const currentState = {
      discounts,
      activeTab,
    };
    
    // Сохраняем в sessionStorage для восстановления при возврате
    if (typeof window !== 'undefined') {
      sessionStorage.setItem('myDiscountsState', JSON.stringify(currentState));
    }
    
    router.push(`/dashboard/discounts/${discountId}`);
  };


  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-center">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-600 border-t-transparent mx-auto"></div>
          <p className="mt-4 text-gray-600 dark:text-gray-400">Загрузка...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white md:text-3xl">
          Мои скидки и льготы
        </h1>
        <p className="mt-2 text-gray-600 dark:text-gray-400">
          Управляйте вашими активированными скидками и избранным
        </p>
      </div>

      {/* Tabs */}
      <div className="mb-6 border-b border-gray-200 dark:border-gray-700">
        <nav className="flex gap-4">
          <button
            onClick={() => setActiveTab("claimed")}
            className={`relative pb-3 text-sm font-medium transition-colors ${
              activeTab === "claimed"
                ? "text-blue-600 dark:text-blue-400"
                : "text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-200"
            }`}
          >
            Полученные
            {activeTab === "claimed" && (
              <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-600 dark:bg-blue-400"></span>
            )}
          </button>
          <button
            onClick={() => setActiveTab("favorites")}
            className={`relative pb-3 text-sm font-medium transition-colors ${
              activeTab === "favorites"
                ? "text-blue-600 dark:text-blue-400"
                : "text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-200"
            }`}
          >
            Избранное
            {activeTab === "favorites" && (
              <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-600 dark:bg-blue-400"></span>
            )}
          </button>
        </nav>
      </div>

      {/* Discounts List */}
      {discounts.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <svg
            className="h-16 w-16 text-gray-400 dark:text-gray-600"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4"
            />
          </svg>
          <h3 className="mt-4 text-lg font-medium text-gray-900 dark:text-white">
            {activeTab === "claimed" ? "Нет полученных скидок" : "Нет избранных скидок"}
          </h3>
          <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
            {activeTab === "claimed"
              ? "Активируйте скидки, чтобы они появились здесь"
              : "Добавьте скидки в избранное для быстрого доступа"}
          </p>
          <button
            onClick={() => router.push("/dashboard/discounts")}
            className="mt-6 rounded-lg bg-blue-600 px-6 py-2.5 text-sm font-medium text-white transition hover:bg-blue-700"
          >
            Перейти к скидкам
          </button>
        </div>
      ) : (
        <div className="space-y-4 pb-20">
          {discounts.map((discount) => (
            <div
              key={discount.id}
              className="overflow-hidden rounded-lg bg-white shadow-md transition hover:shadow-lg dark:bg-gray-800"
            >
              <div className="flex flex-col sm:flex-row">
                {/* Image */}
                {discount.imageUrl && (
                  <div className="w-full flex-shrink-0 bg-gray-100 dark:bg-gray-700 sm:w-1/2 flex items-center justify-center">
                    <img
                      src={discount.imageUrl}
                      alt={discount.title}
                      className="w-full h-auto object-contain"
                      loading="lazy"
                      decoding="async"
                      fetchPriority="low"
                    />
                  </div>
                )}

                {/* Content */}
                <div className="flex flex-1 flex-col justify-between p-6">
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                      {discount.title}
                    </h3>

                    {/* Promo Code */}
                    {/* Показываем промокод для всех полученных скидок, независимо от активной вкладки */}
                    {discount.promoCode && discount.promoCode.trim().length > 0 && (() => {
                      // Проверяем, не является ли промокод специальным случаем
                      const isSpecialCase = discount.promoCode === "Штрихкод в купоне" ||
                        discount.promoCode.toLowerCase().includes("штрихкод") ||
                        discount.promoCode.toLowerCase().includes("barcode");
                      
                      // Если специальный случай, показываем инструкцию
                      if (isSpecialCase) {
                        return (
                          <div className="mt-3 rounded-lg border border-dashed border-gray-300 bg-gray-50 p-3 dark:border-gray-600 dark:bg-gray-700/50">
                            <div className="flex items-center gap-2">
                              <svg className="h-5 w-5 text-gray-500 dark:text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z" />
                              </svg>
                              <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                                Штрихкод в купоне
                              </span>
                            </div>
                          </div>
                        );
                      }
                      
                      return (
                        <div className="mt-3 rounded-lg border border-blue-200 bg-blue-50 p-3 dark:border-blue-700 dark:bg-blue-900/20">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-medium text-gray-600 dark:text-gray-400">
                                Промокод:
                              </span>
                              <span className="font-mono text-sm font-bold text-blue-700 dark:text-blue-300">
                                {discount.promoCode}
                              </span>
                            </div>
                            <button
                              onClick={() => handleCopyPromoCode(discount)}
                              className="text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 transition-colors p-1 rounded hover:bg-blue-100 dark:hover:bg-blue-900/40"
                              title={copiedPromoId === discount.id ? "Скопировано!" : "Скопировать код"}
                              disabled={!discount.promoCode}
                            >
                              {copiedPromoId === discount.id ? (
                                <svg className="h-5 w-5 text-green-600 dark:text-green-400" viewBox="0 0 20 20" fill="currentColor">
                                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                                </svg>
                              ) : (
                                <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                                  <path d="M8 3a1 1 0 011-1h2a1 1 0 110 2H9a1 1 0 01-1-1z" />
                                  <path d="M6 3a2 2 0 00-2 2v11a2 2 0 002 2h8a2 2 0 002-2V5a2 2 0 00-2-2 3 3 0 01-3 3H9a3 3 0 01-3-3z" />
                                </svg>
                              )}
                            </button>
                          </div>
                        </div>
                      );
                    })()}

                    {/* Valid Until */}
                    {discount.validUntil && (
                      <p className="mt-2 text-xs text-gray-600 dark:text-gray-400">
                        Действует до:{" "}
                        {new Date(discount.validUntil).toLocaleDateString("ru-RU")}
                      </p>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="mt-4 flex flex-wrap gap-3">
                    <button
                      onClick={() => handleDownloadPromoCard(discount)}
                      disabled={downloading === discount.id}
                      className="flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
                    >
                      {downloading === discount.id ? (
                        <>
                          <div className="h-4 w-4 animate-spin rounded-full border-2 border-gray-700 border-t-transparent dark:border-gray-300"></div>
                          Создание...
                        </>
                      ) : (
                        <>
                          <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                            <path fillRule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm3.293-7.707a1 1 0 011.414 0L9 10.586V3a1 1 0 112 0v7.586l1.293-1.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z" clipRule="evenodd" />
                          </svg>
                          Скачать
                        </>
                      )}
                    </button>
                    <button
                      onClick={() => handleViewDiscount(discount.id)}
                      className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-700"
                    >
                      <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                        <path d="M11 3a1 1 0 100 2h2.586l-6.293 6.293a1 1 0 101.414 1.414L15 6.414V9a1 1 0 102 0V4a1 1 0 00-1-1h-5z" />
                        <path d="M5 5a2 2 0 00-2 2v8a2 2 0 002 2h8a2 2 0 002-2v-3a1 1 0 10-2 0v3H5V7h3a1 1 0 000-2H5z" />
                      </svg>
                      {activeTab === "claimed" ? "Открыть" : "Смотреть"}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Promo Card Modal */}
      {showPromoCardModal && promoCardData && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 dark:bg-black/70 backdrop-blur-md dark:backdrop-blur-lg p-4">
          <div className="relative max-w-2xl lg:max-w-3xl w-full max-h-[90vh] overflow-auto rounded-xl bg-white shadow-2xl dark:bg-gray-800">
            <div className="sticky top-0 z-10 flex items-center justify-between border-b border-gray-200 bg-white px-6 py-4 dark:border-gray-700 dark:bg-gray-800">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                Промокарта
              </h3>
              <button
                onClick={() => setShowPromoCardModal(false)}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
              >
                <svg className="h-6 w-6" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                </svg>
              </button>
            </div>

            <div className="p-6">
              {/* Preview */}
              <div className="mb-6 overflow-hidden rounded-lg border border-gray-200 dark:border-gray-700">
                <img
                  src={promoCardData.dataUrl}
                  alt="Promo Card Preview"
                  className="w-full h-auto"
                />
              </div>

              {/* Actions */}
              <div className="flex flex-col gap-3 sm:flex-row">
                <button
                  onClick={handleDownloadFromModal}
                  className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-blue-600 px-6 py-3 text-base font-semibold text-white transition hover:bg-blue-700"
                >
                  <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm3.293-7.707a1 1 0 011.414 0L9 10.586V3a1 1 0 112 0v7.586l1.293-1.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z" clipRule="evenodd" />
                  </svg>
                  Скачать
                </button>
                
                {/* Copy Promo Code Button - only if promo code exists and is not special case */}
                {promoCardData.discount.promoCode && (() => {
                  const isSpecialCase = promoCardData.discount.promoCode === "Штрихкод в купоне" ||
                    promoCardData.discount.promoCode.toLowerCase().includes("штрихкод") ||
                    promoCardData.discount.promoCode.toLowerCase().includes("barcode");
                  
                  if (isSpecialCase) {
                    return null; // Не показываем кнопку копирования для специальных случаев
                  }
                  
                  return (
                    <button
                      onClick={() => handleCopyPromoCode(promoCardData.discount)}
                      className={`flex flex-1 items-center justify-center gap-2 rounded-lg px-6 py-3 text-base font-semibold transition ${
                        copiedPromoId === promoCardData.discount.id
                          ? 'bg-green-600 text-white hover:bg-green-700'
                          : 'border-2 border-green-600 bg-white text-green-600 hover:bg-green-50 dark:bg-gray-800 dark:hover:bg-gray-700'
                      }`}
                    >
                    {copiedPromoId === promoCardData.discount.id ? (
                      <>
                        <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                          <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                        </svg>
                        Скопировано!
                      </>
                    ) : (
                      <>
                        <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                          <path d="M8 3a1 1 0 011-1h2a1 1 0 110 2H9a1 1 0 01-1-1z" />
                          <path d="M6 3a2 2 0 00-2 2v11a2 2 0 002 2h8a2 2 0 002-2V5a2 2 0 00-2-2 3 3 0 01-3 3H9a3 3 0 01-3-3z" />
                        </svg>
                        Скопировать промокод
                      </>
                    )}
                  </button>
                  );
                })()}
                
                <button
                  onClick={handleAddToWallet}
                  className="flex flex-1 items-center justify-center gap-2 rounded-lg border-2 border-blue-600 bg-white px-6 py-3 text-base font-semibold text-blue-600 transition hover:bg-blue-50 dark:bg-gray-800 dark:hover:bg-gray-700"
                >
                  <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                    <path d="M4 4a2 2 0 00-2 2v1h16V6a2 2 0 00-2-2H4z" />
                    <path fillRule="evenodd" d="M18 9H2v5a2 2 0 002 2h12a2 2 0 002-2V9zM4 13a1 1 0 011-1h1a1 1 0 110 2H5a1 1 0 01-1-1zm5-1a1 1 0 100 2h1a1 1 0 100-2H9z" clipRule="evenodd" />
                  </svg>
                  Добавить в кошелек
                </button>
              </div>

              <p className="mt-4 text-center text-sm text-gray-600 dark:text-gray-400">
                {/iPad|iPhone|iPod/.test(navigator.userAgent) 
                  ? "Скоро вы сможете добавить эту карту в Apple Wallet" 
                  : /Android/.test(navigator.userAgent)
                  ? "Скоро вы сможете добавить эту карту в Google Pay"
                  : "Скачайте карту и используйте промокод в магазине"}
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

