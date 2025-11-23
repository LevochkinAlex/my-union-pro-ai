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
  const [regenerating, setRegenerating] = useState<number | null>(null);

  useEffect(() => {
    // Синхронизация с BestBenefits при загрузке страницы, затем загрузка скидок
    const initPage = async () => {
      await syncWithBestBenefits(false); // Ждем синхронизацию
      await loadMyDiscounts(); // Затем загружаем скидки
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
      // Load user preferences
      const prefsResponse = await fetch("/api/discounts/preferences");
      const prefsData = await prefsResponse.json();
      const filters = prefsData.filters || {};
      
      // Extract IDs from claimed (может быть массив объектов или чисел)
      const claimedData = filters.claimed || [];
      const claimedIds = claimedData.map((item: any) => 
        typeof item === 'object' && item.id ? item.id : item
      ).filter(Boolean);
      
      const favoriteIds = filters.favorites || [];
      
      // Determine which IDs to fetch
      const idsToFetch = activeTab === "claimed" ? claimedIds : favoriteIds;
      
      if (idsToFetch.length === 0) {
        setDiscounts([]);
        setLoading(false);
        return;
      }

      // Fetch discounts by IDs
      const discountsResponse = await fetch(`/api/discounts?ids=${idsToFetch.join(",")}`);
      const discountsData = await discountsResponse.json();
      
      // Добавляем промокоды из preferences к данным скидок
      console.log("[MyDiscounts] Raw claimed data:", claimedData);
      console.log("[MyDiscounts] Discounts from API:", discountsData.discounts);
      
      const discountsWithPromoCodes = (discountsData.discounts || []).map((discount: DiscountItem) => {
        if (activeTab === "claimed") {
          const claimedItem = claimedData.find((item: any) => {
            const itemId = typeof item === 'object' && item.id ? item.id : item;
            return itemId === discount.id;
          });
          
          console.log(`[MyDiscounts] Discount ${discount.id}:`, { 
            title: discount.title, 
            claimedItem, 
            hasPromoCode: claimedItem && typeof claimedItem === 'object' && !!claimedItem.promoCode 
          });
          
          if (claimedItem && typeof claimedItem === 'object' && claimedItem.promoCode) {
            return { ...discount, promoCode: claimedItem.promoCode };
          }
        }
        return discount;
      });
      
      console.log("[MyDiscounts] Discounts with promo codes:", discountsWithPromoCodes.map(d => ({ id: d.id, title: d.title, promoCode: d.promoCode })));
      
      setDiscounts(discountsWithPromoCodes);
    } catch (error) {
      console.error("Failed to load my discounts:", error);
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

  const handleRegeneratePromoCode = async (discountId: number) => {
    setRegenerating(discountId);
    
    try {
      // Генерируем новый промокод (можно использовать любую логику)
      const newPromoCode = `bb${Date.now().toString(36).toUpperCase()}${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
      
      console.log("[handleRegeneratePromoCode] Generating new promo code:", newPromoCode);
      
      // Обновляем промокод в preferences
      const prefsResponse = await fetch("/api/discounts/preferences");
      const prefsData = await prefsResponse.json();
      const currentFilters = prefsData.filters || {};
      const claimedData = currentFilters.claimed || [];
      
      // Обновляем промокод для этой скидки
      const updatedClaimed = claimedData.map((item: any) => {
        const itemId = typeof item === 'object' && item.id ? item.id : item;
        if (itemId === discountId) {
          return { id: discountId, promoCode: newPromoCode };
        }
        return item;
      });
      
      // Сохраняем обновленные preferences
      await fetch("/api/discounts/preferences", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          filters: {
            ...currentFilters,
            claimed: updatedClaimed,
          },
        }),
      });
      
      // Обновляем локальное состояние
      setDiscounts(prev => prev.map(d => 
        d.id === discountId ? { ...d, promoCode: newPromoCode } : d
      ));
      
      console.log("[handleRegeneratePromoCode] Promo code regenerated successfully");
      
      // Показываем уведомление
      alert(`Новый промокод: ${newPromoCode}`);
    } catch (error) {
      console.error("[handleRegeneratePromoCode] Failed to regenerate promo code:", error);
      alert("Не удалось перегенерировать промокод. Попробуйте еще раз.");
    } finally {
      setRegenerating(null);
    }
  };

  const handleDownloadPromoCard = async (discount: DiscountItem) => {
    setDownloading(discount.id);
    
    try {
      console.log("[handleDownloadPromoCard] Starting generation for discount:", discount.id);
      
      // Получаем данные пользователя
      const userResponse = await fetch("/api/profile");
      if (!userResponse.ok) {
        throw new Error(`Failed to fetch user profile: ${userResponse.status}`);
      }
      const userData = await userResponse.json();
      const userName = userData.user?.firstName && userData.user?.lastName
        ? `${userData.user.firstName} ${userData.user.lastName}`
        : userData.user?.email || "Пользователь";

      console.log("[handleDownloadPromoCard] User data:", { userName });
      console.log("[handleDownloadPromoCard] Discount data:", {
        promoCode: discount.promoCode,
        title: discount.title,
        imageUrl: discount.imageUrl ? discount.imageUrl.substring(0, 100) + '...' : 'null',
      });

      // Генерируем карточку
      const blob = await generatePromoCard({
        promoCode: discount.promoCode, // может быть undefined
        userName: userName,
        discountName: discount.title,
        discountDescription: discount.shortDescription,
        imageUrl: discount.imageUrl ?? undefined,
        validUntil: discount.validUntil ? new Date(discount.validUntil) : undefined,
      });

      console.log("[handleDownloadPromoCard] Blob generated:", { size: blob.size, type: blob.type });

      // Скачиваем файл
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `promo-card-${discount.id}.png`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      
      console.log("[handleDownloadPromoCard] Download triggered successfully");
    } catch (error) {
      console.error("[handleDownloadPromoCard] Failed to generate promo card:", error);
      alert(`Не удалось создать карточку: ${error instanceof Error ? error.message : 'Неизвестная ошибка'}`);
    } finally {
      setDownloading(null);
    }
  };

  const handleViewDiscount = (discountId: number) => {
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
      <div className="mb-6 flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white md:text-3xl">
            Мои скидки и льготы
          </h1>
          <p className="mt-2 text-gray-600 dark:text-gray-400">
            Управляйте вашими активированными скидками и избранным
          </p>
        </div>
        <button
          onClick={() => syncWithBestBenefits(true)} // true = форсировать синхронизацию
          disabled={isSyncing}
          className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
          title="Синхронизировать с BestBenefits"
        >
          {isSyncing ? (
            <>
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent"></div>
              <span>Синхронизация...</span>
            </>
          ) : (
            <>
              <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M4 2a1 1 0 011 1v2.101a7.002 7.002 0 0111.601 2.566 1 1 0 11-1.885.666A5.002 5.002 0 005.999 7H9a1 1 0 010 2H4a1 1 0 01-1-1V3a1 1 0 011-1zm.008 9.057a1 1 0 011.276.61A5.002 5.002 0 0014.001 13H11a1 1 0 110-2h5a1 1 0 011 1v5a1 1 0 11-2 0v-2.101a7.002 7.002 0 01-11.601-2.566 1 1 0 01.61-1.276z" clipRule="evenodd" />
              </svg>
              <span>Синхронизировать</span>
            </>
          )}
        </button>
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
                    {discount.promoCode && activeTab === "claimed" && (
                      <div className="mt-2">
                        <span className="text-xs font-medium text-gray-500 dark:text-gray-400">
                          Код:
                        </span>
                        <div className="mt-1 flex items-center gap-2">
                          <span className="font-mono text-sm font-bold text-blue-600 dark:text-blue-400">
                            {discount.promoCode}
                          </span>
                          <button
                            onClick={() => handleCopyPromoCode(discount)}
                            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
                            title={copiedPromoId === discount.id ? "Скопировано!" : "Скопировать код"}
                            disabled={!discount.promoCode}
                          >
                            {copiedPromoId === discount.id ? (
                              <svg className="h-4 w-4 text-green-500" viewBox="0 0 20 20" fill="currentColor">
                                <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                              </svg>
                            ) : (
                              <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                                <path d="M8 3a1 1 0 011-1h2a1 1 0 110 2H9a1 1 0 01-1-1z" />
                                <path d="M6 3a2 2 0 00-2 2v11a2 2 0 002 2h8a2 2 0 002-2V5a2 2 0 00-2-2 3 3 0 01-3 3H9a3 3 0 01-3-3z" />
                              </svg>
                            )}
                          </button>
                          <button
                            onClick={() => handleRegeneratePromoCode(discount.id)}
                            disabled={regenerating === discount.id}
                            className="text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                            title="Перегенерировать промокод"
                          >
                            {regenerating === discount.id ? (
                              <div className="h-4 w-4 animate-spin rounded-full border-2 border-gray-400 border-t-transparent"></div>
                            ) : (
                              <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                                <path fillRule="evenodd" d="M4 2a1 1 0 011 1v2.101a7.002 7.002 0 0111.601 2.566 1 1 0 11-1.885.666A5.002 5.002 0 005.999 7H9a1 1 0 010 2H4a1 1 0 01-1-1V3a1 1 0 011-1zm.008 9.057a1 1 0 011.276.61A5.002 5.002 0 0014.001 13H11a1 1 0 110-2h5a1 1 0 011 1v5a1 1 0 11-2 0v-2.101a7.002 7.002 0 01-11.601-2.566 1 1 0 01.61-1.276z" clipRule="evenodd" />
                              </svg>
                            )}
                          </button>
                        </div>
                      </div>
                    )}

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
    </div>
  );
}

