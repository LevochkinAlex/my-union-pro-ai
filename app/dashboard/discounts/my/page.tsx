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

      {/* Promo Card Modal */}
      {showPromoCardModal && promoCardData && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="relative max-w-4xl w-full max-h-[90vh] overflow-auto rounded-xl bg-white shadow-2xl dark:bg-gray-800">
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

