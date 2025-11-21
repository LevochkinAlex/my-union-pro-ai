"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { DiscountItem } from "@/types/discounts";
import Image from "next/image";

// Санитизация и улучшение HTML описания
function sanitizeDescription(html: string): string {
  if (!html) return "";
  
  // Если это уже HTML, очищаем от встроенных стилей и атрибутов
  if (html.includes('<') && html.includes('>')) {
    let cleaned = html
      // Убираем все style атрибуты
      .replace(/\s*style="[^"]*"/gi, '')
      .replace(/\s*style='[^']*'/gi, '')
      // Убираем все class атрибуты
      .replace(/\s*class="[^"]*"/gi, '')
      .replace(/\s*class='[^']*'/gi, '')
      // Убираем background, color и другие inline стили
      .replace(/\s*background[^=]*="[^"]*"/gi, '')
      .replace(/\s*color[^=]*="[^"]*"/gi, '')
      // Убираем пустые span и div теги
      .replace(/<span[^>]*>(.*?)<\/span>/gi, '$1')
      .replace(/<div[^>]*>(.*?)<\/div>/gi, '$1')
      // Убираем лишние пробелы
      .trim();
    
    return cleaned;
  }
  
  // Если это обычный текст, форматируем
  let formatted = html
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n');
  
  // Заменяем маркированные списки
  formatted = formatted.replace(/(?:^|\n)([-•]\s+[^\n]+(?:\n[-•]\s+[^\n]+)*)/gm, (match) => {
    const items = match.trim().split(/\n/).filter(Boolean);
    const listItems = items.map(item => {
      const content = item.replace(/^[-•]\s+/, '').trim();
      return `<li>${content}</li>`;
    }).join('');
    return `<ul>${listItems}</ul>`;
  });
  
  // Заменяем нумерованные списки
  formatted = formatted.replace(/(?:^|\n)(\d+[\.\)]\s+[^\n]+(?:\n\d+[\.\)]\s+[^\n]+)*)/gm, (match) => {
    const items = match.trim().split(/\n/).filter(Boolean);
    const listItems = items.map(item => {
      const content = item.replace(/^\d+[\.\)]\s+/, '').trim();
      return `<li>${content}</li>`;
    }).join('');
    return `<ol>${listItems}</ol>`;
  });
  
  // Заменяем двойные переносы на параграфы
  formatted = formatted.replace(/\n\n+/g, '</p><p>');
  
  // Заменяем одиночные переносы на <br>
  formatted = formatted.replace(/\n/g, '<br>');
  
  // Оборачиваем в параграф
  if (!formatted.startsWith('<')) {
    formatted = `<p>${formatted}</p>`;
  }
  
  return formatted;
}

export default function DiscountDetailPage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const discountId = params.id as string;
  const selectedCityId = searchParams.get('cityId') ? parseInt(searchParams.get('cityId')!) : null;
  
  const [discount, setDiscount] = useState<DiscountItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [isClaimed, setIsClaimed] = useState(false);
  const [isFavorite, setIsFavorite] = useState(false);
  const [copied, setCopied] = useState(false);
  const [showPromoModal, setShowPromoModal] = useState(false);
  const [activatedPromoCode, setActivatedPromoCode] = useState<string | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [hasSynced, setHasSynced] = useState(false);
  const [isMapExpanded, setIsMapExpanded] = useState(!!selectedCityId); // Открыт если выбран город

  useEffect(() => {
    // Сбрасываем флаги при смене скидки
    setHasSynced(false);
    setIsSyncing(false);
    setActivatedPromoCode(null);
    loadDiscount();
    loadPreferences();
  }, [discountId]);

  // Обновляем промокод после загрузки discount
  useEffect(() => {
    if (discount && isClaimed && !activatedPromoCode) {
      // Проверяем промокод из discount, если его нет в preferences
      if (discount.promoCode && discount.promoCode.trim().length > 0) {
        console.log("✅ Setting promo code from discount after load:", discount.promoCode);
        setActivatedPromoCode(discount.promoCode);
      }
    }
  }, [discount, isClaimed, activatedPromoCode]);

  const loadDiscount = async () => {
    try {
      const response = await fetch(`/api/discounts?ids=${discountId}`);
      const data = await response.json();
      
      if (data.discounts && data.discounts.length > 0) {
        const disc = data.discounts[0];
        console.log("📦 FULL DISCOUNT DATA:", disc);
        console.log("🎫 Promo Code:", disc.promoCode, "Type:", typeof disc.promoCode);
        console.log("📝 Short Description:", disc.shortDescription, "Type:", typeof disc.shortDescription);
        console.log("📄 Description:", disc.description?.substring(0, 200));
        console.log("🔗 Partner URL:", disc.partnerUrl, "Type:", typeof disc.partnerUrl);
        setDiscount(disc);
      } else {
        console.error("❌ No discounts in response:", data);
      }
    } catch (error) {
      console.error("Failed to load discount:", error);
    } finally {
      setLoading(false);
    }
  };

  const syncWithBestBenefits = async () => {
    // Защита от бесконечного цикла и повторных вызовов
    if (isSyncing || hasSynced) {
      console.log("⏭️ Sync already in progress or completed, skipping");
      return;
    }

    try {
      setIsSyncing(true);
      console.log("🔄 Starting sync with BestBenefits...");
      
      // Используем менеджер синхронизации с кэшированием
      const { syncManager } = await import("@/lib/sync-manager");
      const result = await syncManager.sync(); // Не форсируем, используем кэш
      
      if (result.success) {
        console.log("✅ Sync result:", result);
        setHasSynced(true);
        
        if (!result.cached) {
          // Перезагружаем preferences только если была реальная синхронизация
          await loadPreferences();
        } else {
          console.log("⏭️ Using cached sync result, preferences already up to date");
        }
      } else {
        console.error("❌ Sync failed:", result.message);
        setHasSynced(true); // Помечаем как выполненную, чтобы не повторять
      }
    } catch (error) {
      console.error("❌ Sync error:", error);
      setHasSynced(true); // Помечаем как выполненную даже при ошибке
    } finally {
      setIsSyncing(false);
    }
  };

  const loadPreferences = async () => {
    try {
      const response = await fetch("/api/discounts/preferences");
      const data = await response.json();
      const filters = data.filters || {};
      
      console.log("📋 LOADED PREFERENCES:", filters);
      
      // Проверяем, есть ли эта скидка в claimed
      const claimedItem = filters.claimed?.find((item: any) => {
        const itemId = typeof item === 'object' && item.id ? item.id : item;
        return itemId === parseInt(discountId);
      });
      const isClaimed = !!claimedItem;
      
      setIsClaimed(isClaimed);
      setIsFavorite(filters.favorites?.includes(parseInt(discountId)) || false);
      
      // Если скидка claimed и есть промокод, устанавливаем его
      if (claimedItem) {
        const promoCode = typeof claimedItem === 'object' ? claimedItem.promoCode : null;
        if (promoCode && promoCode.trim().length > 0) {
          console.log("✅ Found promo code in preferences:", promoCode);
          setActivatedPromoCode(promoCode);
        } else {
          console.log("⚠️ Claimed item found but no promo code:", claimedItem);
          // Если промокода нет, но скидка claimed - синхронизируемся с BestBenefits
          // Но только один раз, чтобы избежать бесконечного цикла
          if (!hasSynced && !isSyncing) {
            console.log("🔄 Syncing with BestBenefits to get promo code...");
            syncWithBestBenefits();
          } else {
            console.log("⏭️ Sync already attempted, skipping");
          }
        }
      } else {
        console.log("⚠️ Discount not found in claimed list");
      }
    } catch (error) {
      console.error("Failed to load preferences:", error);
    }
  };

  const handleClaim = async () => {
    if (!discount) return;
    
    console.log("🔘 HANDLE CLAIM START:", {
      isClaimed,
      hasPromoCode: !!discount.promoCode,
      promoCode: discount.promoCode,
    });
    
    // Если ещё не активирована, активируем и получаем промокод
    if (!isClaimed) {
      setIsClaimed(true);
      
      try {
        const response = await fetch("/api/discounts/activate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            discountId: discount.id,
            promoCode: discount.promoCode || null, // Передаем промокод из discount
            claimed: [discount.id],
            favorites: isFavorite ? [discount.id] : [],
          }),
        });
        
        const result = await response.json();
        console.log("🎯 ACTIVATION API RESPONSE:", result);
        
        // Перезагружаем preferences чтобы получить сохраненный промокод
        await loadPreferences();
        
        // Определяем промокод для отображения
        const finalPromoCode = result.promoCode || discount.promoCode || activatedPromoCode;
        
        if (finalPromoCode && finalPromoCode.trim().length > 0) {
          console.log("✅ Setting promo code for display:", finalPromoCode);
          setActivatedPromoCode(finalPromoCode);
          setDiscount({
            ...discount,
            promoCode: finalPromoCode,
          });
        } else {
          console.log("⚠️ No promo code available after activation");
        }
        
        // Показываем модальное окно
        setShowPromoModal(true);
      } catch (error) {
        console.error("❌ Failed to activate:", error);
        // Показываем модальное окно даже при ошибке
        setShowPromoModal(true);
      }
    } else {
      // Если уже активирована, просто показываем модальное окно
      console.log("⏩ Already claimed, showing modal with promo code:", discount.promoCode || activatedPromoCode);
      setShowPromoModal(true);
    }
  };

  const handleOpenPartner = () => {
    console.log("🔗 Opening partner URL:", discount?.partnerUrl);
    if (discount?.partnerUrl) {
      console.log("✅ Opening partner site in new tab:", discount.partnerUrl);
      window.open(discount.partnerUrl, "_blank");
    } else {
      console.log("📱 No partner URL, opening My Discounts page");
      router.push("/dashboard/discounts/my");
    }
    setShowPromoModal(false);
  };

  const handleCopyPromo = async () => {
    const promoToCopy = activatedPromoCode || discount?.promoCode;
    console.log("🎫 Copying promo code:", promoToCopy);
    if (!promoToCopy || !navigator?.clipboard) return;

    try {
      await navigator.clipboard.writeText(promoToCopy);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.warn("Failed to copy promo code", error);
    }
  };

  const handleToggleFavorite = async () => {
    const nextFavorite = !isFavorite;
    setIsFavorite(nextFavorite);

    try {
      await fetch("/api/discounts/preferences", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          filters: {
            favorites: nextFavorite ? [parseInt(discountId)] : [],
            claimed: isClaimed ? [parseInt(discountId)] : [],
          },
        }),
      });
    } catch (error) {
      console.error("Failed to update favorite:", error);
      setIsFavorite(!nextFavorite);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-600 border-t-transparent"></div>
          <p className="mt-4 text-gray-600 dark:text-gray-400">Загрузка...</p>
        </div>
      </div>
    );
  }

  if (!discount) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Скидка не найдена</h2>
          <button
            onClick={() => router.push("/dashboard/discounts")}
            className="mt-4 text-blue-600 hover:underline"
          >
            ← Вернуться к скидкам
          </button>
        </div>
      </div>
    );
  }

  // Вычисляем displayPromoCode каждый раз при рендере, чтобы он обновлялся после активации
  const displayPromoCode = activatedPromoCode || discount?.promoCode;
  const hasPartnerUrl = !!discount?.partnerUrl;
  
  // Логируем только когда модалка открыта
  if (showPromoModal) {
    console.log("🎫 MODAL DISPLAYED WITH:", {
      activatedPromoCode,
      discountPromoCode: discount?.promoCode,
      displayPromoCode,
      displayPromoCodeExists: !!displayPromoCode,
      displayPromoCodeTrimmed: displayPromoCode?.trim(),
      hasShortDescription: !!discount?.shortDescription,
      hasPartnerUrl,
    });
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-20 dark:bg-gray-900">
      <div className="mx-auto max-w-4xl px-4 py-4 pb-20 sm:px-6 sm:py-8">
        {/* Back Button */}
        <button
          onClick={() => router.back()}
          className="mb-6 flex items-center gap-2 text-gray-600 transition hover:text-gray-900 dark:text-gray-400 dark:hover:text-white"
        >
          <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
            <path
              fillRule="evenodd"
              d="M9.707 16.707a1 1 0 01-1.414 0l-6-6a1 1 0 010-1.414l6-6a1 1 0 011.414 1.414L5.414 9H17a1 1 0 110 2H5.414l4.293 4.293a1 1 0 010 1.414z"
              clipRule="evenodd"
            />
          </svg>
          Назад к скидкам
        </button>

        {/* Main Content */}
        <div className="overflow-hidden rounded-xl bg-white shadow-lg dark:bg-gray-800">
          {/* Image */}
          {discount.imageUrl && (
            <div className="relative w-full bg-gray-100 dark:bg-gray-700 flex items-center justify-center">
              <img
                src={discount.imageUrl}
                alt={discount.title}
                className="w-full h-auto max-h-96 object-contain"
              />
              {/* Badges */}
              <div className="absolute right-2 top-2 flex flex-col gap-2 sm:right-4 sm:top-4">
                {discount.isPremium && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-amber-500 px-3 py-1 text-xs font-semibold uppercase text-white shadow">
                    <svg className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor">
                      <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                    </svg>
                    Premium
                  </span>
                )}
                {isClaimed && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500 px-3 py-1 text-xs font-semibold uppercase text-white shadow">
                    <svg className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor">
                      <path
                        fillRule="evenodd"
                        d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                        clipRule="evenodd"
                      />
                    </svg>
                    Получено
                  </span>
                )}
              </div>
            </div>
          )}

          {/* Content */}
          <div className="p-4 sm:p-6 md:p-8">
            {/* Title & Favorite */}
            <div className="flex items-start justify-between gap-2 sm:gap-4">
              <h1 className="text-xl font-bold text-gray-900 dark:text-white sm:text-2xl md:text-3xl">
                {discount.title}
              </h1>
              <button
                onClick={handleToggleFavorite}
                className="flex-shrink-0 rounded-full p-2 transition hover:bg-gray-100 dark:hover:bg-gray-700"
                aria-label={isFavorite ? "Убрать из избранного" : "Добавить в избранное"}
              >
                <svg
                  className={`h-6 w-6 ${
                    isFavorite ? "fill-red-500 text-red-500" : "text-gray-400"
                  }`}
                  viewBox="0 0 20 20"
                  fill={isFavorite ? "currentColor" : "none"}
                  stroke="currentColor"
                >
                  <path
                    fillRule="evenodd"
                    d="M3.172 5.172a4 4 0 015.656 0L10 6.343l1.172-1.171a4 4 0 115.656 5.656L10 17.657l-6.828-6.829a4 4 0 010-5.656z"
                    clipRule="evenodd"
                  />
                </svg>
              </button>
            </div>

            {/* Category & Cities */}
            <div className="mt-3 flex flex-wrap items-center gap-2 sm:mt-4 sm:gap-4">
              {discount.mainCategory && (
                <span className="rounded-full bg-blue-100 px-3 py-1 text-sm font-medium text-blue-800 dark:bg-blue-900/30 dark:text-blue-300">
                  {discount.mainCategory.name}
                </span>
              )}
              {discount.cities && discount.cities.length > 0 && (
                <div className="flex items-center gap-1.5 text-sm text-gray-600 dark:text-gray-400">
                  <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                    <path
                      fillRule="evenodd"
                      d="M5.05 4.05a7 7 0 119.9 9.9L10 18.9l-4.95-4.95a7 7 0 010-9.9zM10 11a2 2 0 100-4 2 2 0 000 4z"
                      clipRule="evenodd"
                    />
                  </svg>
                  <span>
                    {discount.cities.length <= 5
                      ? discount.cities.map((c) => c.name).join(", ")
                      : `${discount.cities.slice(0, 5).map((c) => c.name).join(", ")} и ещё ${discount.cities.length - 5}`
                    }
                  </span>
                </div>
              )}
            </div>

            {/* Short Description - краткое описание вверху */}
            {discount.shortDescription && discount.shortDescription.trim().length > 0 && (
              <div className="mt-4 sm:mt-6">
                <div className="rounded-lg bg-gray-50 p-4 dark:bg-gray-700/50">
                  <div 
                    className="text-sm leading-relaxed text-gray-700 dark:text-gray-300 sm:text-base"
                    dangerouslySetInnerHTML={{ __html: sanitizeDescription(discount.shortDescription) }}
                  />
                </div>
              </div>
            )}

            {/* Promo Code */}
            {discount.promoCode && (
              <div className="mt-4 sm:mt-6">
                <h3 className="mb-3 text-sm font-semibold text-gray-900 dark:text-white">Промокод</h3>
                <div className="rounded-xl border-2 border-blue-200 bg-gradient-to-br from-blue-50 to-blue-100 p-4 shadow-sm dark:border-blue-700 dark:from-blue-900/30 dark:to-blue-900/20 sm:p-5">
                  {/* Промокод с буквами в квадратах */}
                  <div className="mb-3 flex flex-wrap justify-center gap-1.5 sm:gap-2">
                    {discount.promoCode.split('').map((char, idx) => (
                      <div
                        key={idx}
                        className="flex h-10 w-8 items-center justify-center rounded-lg border-2 border-blue-300 bg-white font-mono text-lg font-bold text-blue-700 shadow-sm dark:border-blue-700 dark:bg-gray-800 dark:text-blue-300 sm:h-12 sm:w-10 sm:text-xl"
                      >
                        {char}
                      </div>
                    ))}
                  </div>
                  <button
                    onClick={handleCopyPromo}
                    className="flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-md transition hover:bg-blue-700 hover:shadow-lg active:scale-95 sm:text-base"
                  >
                    {copied ? (
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
                        Скопировать код
                      </>
                    )}
                  </button>
                </div>
              </div>
            )}

            {/* Valid Until */}
            {discount.validUntil && (
              <div className="mt-4 flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
                <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                  <path
                    fillRule="evenodd"
                    d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z"
                    clipRule="evenodd"
                  />
                </svg>
                <span>Действует до: {new Date(discount.validUntil).toLocaleDateString("ru-RU")}</span>
              </div>
            )}

            {/* Full Description - полное описание внизу */}
            {discount.description && discount.description.trim().length > 0 && (
              <div className="mt-6 sm:mt-8">
                <h2 className="mb-4 text-lg font-semibold text-gray-900 dark:text-white sm:text-xl">
                  Условия использования
                </h2>
                <div className="overflow-hidden rounded-lg border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-700 dark:bg-gray-800 sm:p-8">
                  <div 
                    className="text-sm leading-relaxed text-gray-700 dark:text-gray-300 sm:text-base
                      [&_p]:mb-4 [&_p]:last:mb-0
                      [&_ul]:my-4 [&_ul]:ml-6 [&_ul]:list-disc [&_ul]:space-y-2
                      [&_ol]:my-4 [&_ol]:ml-6 [&_ol]:list-decimal [&_ol]:space-y-2
                      [&_li]:leading-relaxed
                      [&_strong]:font-semibold [&_strong]:text-gray-900 [&_strong]:dark:text-white
                      [&_a]:font-medium [&_a]:text-blue-600 [&_a]:underline [&_a]:transition-colors
                      [&_a:hover]:text-blue-700
                      [&_a]:dark:text-blue-400 [&_a:hover]:dark:text-blue-300"
                    dangerouslySetInnerHTML={{ 
                      __html: sanitizeDescription(discount.description)
                    }}
                  />
                </div>
              </div>
            )}

            {/* Locations Map - адреса на карте */}
            {(() => {
              // Фильтруем города по выбранному городу из фильтров
              const citiesToShow = selectedCityId
                ? discount.cities.filter(city => city.id === selectedCityId)
                : discount.cities;
              
              const showMap = citiesToShow && citiesToShow.length > 0 && citiesToShow[0].name !== "Онлайн";
              
              return showMap ? (
                <div className="mt-6 sm:mt-8">
                  {/* Заголовок-аккордеон */}
                  <button
                    onClick={() => setIsMapExpanded(!isMapExpanded)}
                    className="mb-4 flex w-full items-center justify-between text-left"
                  >
                    <h2 className="text-lg font-semibold text-gray-900 dark:text-white sm:text-xl">
                      На карте
                      {!selectedCityId && citiesToShow.length > 0 && (
                        <span className="ml-2 text-sm font-normal text-gray-500 dark:text-gray-400">
                          ({citiesToShow.length} {citiesToShow.length === 1 ? 'город' : citiesToShow.length < 5 ? 'города' : 'городов'})
                        </span>
                      )}
                    </h2>
                    <svg
                      className={`h-5 w-5 text-gray-500 transition-transform dark:text-gray-400 ${isMapExpanded ? 'rotate-180' : ''}`}
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>

                  {/* Контент аккордеона */}
                  {isMapExpanded && (
                    <>
                      {citiesToShow.length === 0 && selectedCityId ? (
                        <div className="rounded-lg border border-gray-200 bg-gray-50 p-6 text-center dark:border-gray-700 dark:bg-gray-800">
                          <p className="text-sm text-gray-600 dark:text-gray-400">
                            В выбранном городе эта скидка недоступна
                          </p>
                        </div>
                      ) : (
                        <div className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-800">
                          <div className="divide-y divide-gray-200 dark:divide-gray-700">
                            {citiesToShow.map((city) => (
                              <div key={city.id} className="p-4 sm:p-6">
                                <div className="flex items-start gap-3">
                                  <div className="flex-shrink-0 rounded-full bg-blue-100 p-2 dark:bg-blue-900/30">
                                    <svg className="h-5 w-5 text-blue-600 dark:text-blue-400" viewBox="0 0 20 20" fill="currentColor">
                                      <path
                                        fillRule="evenodd"
                                        d="M5.05 4.05a7 7 0 119.9 9.9L10 18.9l-4.95-4.95a7 7 0 010-9.9zM10 11a2 2 0 100-4 2 2 0 000 4z"
                                        clipRule="evenodd"
                                      />
                                    </svg>
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    <h3 className="text-base font-semibold text-gray-900 dark:text-white">
                                      {city.name}
                                    </h3>
                                    {city.coordinates && (
                                      <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                                        Координаты: {city.coordinates.lat.toFixed(4)}, {city.coordinates.lng.toFixed(4)}
                                      </p>
                                    )}
                                  </div>
                                  {city.coordinates && (
                                    <a
                                      href={`https://yandex.ru/maps/?ll=${city.coordinates.lng},${city.coordinates.lat}&z=14&pt=${city.coordinates.lng},${city.coordinates.lat},pm2rdm`}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="flex-shrink-0 rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white transition hover:bg-blue-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 dark:ring-offset-gray-800"
                                    >
                                      Открыть карту
                                    </a>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </>
                  )}
                </div>
              ) : null;
            })()}

            {/* Action Button */}
            <div className="mt-6 sm:mt-8">
              <button
                onClick={handleClaim}
                className={`flex w-full items-center justify-center gap-2 rounded-lg px-4 py-3 text-base font-semibold text-white shadow-lg transition focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 dark:ring-offset-gray-800 sm:px-6 sm:py-4 sm:text-lg ${
                  isClaimed
                    ? "bg-emerald-600 hover:bg-emerald-700"
                    : "bg-blue-600 hover:bg-blue-700"
                }`}
              >
                <span>{isClaimed ? "Открыть" : "Использовать"}</span>
                <svg className="h-4 w-4 sm:h-5 sm:w-5" viewBox="0 0 20 20" fill="currentColor">
                  <path d="M11 3a1 1 0 100 2h2.586l-6.293 6.293a1 1 0 101.414 1.414L15 6.414V9a1 1 0 102 0V4a1 1 0 00-1-1h-5z" />
                  <path d="M5 5a2 2 0 00-2 2v8a2 2 0 002 2h8a2 2 0 002-2v-3a1 1 0 10-2 0v3H5V7h3a1 1 0 000-2H5z" />
                </svg>
              </button>
              <p className="mt-2 text-center text-xs text-gray-500 dark:text-gray-400 sm:mt-3 sm:text-sm">
                {isClaimed
                  ? "Скидка уже активирована. Нажмите чтобы открыть сайт партнера."
                  : "При нажатии скидка будет активирована и откроется сайт партнера"}
              </p>
            </div>
          </div>
        </div>

        {/* Promo Code Modal */}
        {showPromoModal && discount && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
            <div className="relative w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl dark:bg-gray-800">
              {/* Close button */}
              <button
                onClick={() => setShowPromoModal(false)}
                className="absolute right-4 top-4 rounded-full p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-700 dark:hover:text-gray-300"
              >
                <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>

              {/* Icon */}
              <div className="mb-4 flex justify-center">
                <div className="text-6xl">👍</div>
              </div>

              {/* Title */}
              <h2 className="mb-6 text-center text-2xl font-bold text-gray-900 dark:text-white">
                {displayPromoCode && displayPromoCode.trim().length > 0 
                  ? "Промокод получен!" 
                  : "Скидка активирована!"}
              </h2>

              {/* Promo Code or Instructions */}
              {displayPromoCode && displayPromoCode.trim().length > 0 ? (
                <div className="mb-6">
                  <div className="text-center mb-3">
                    <span className="text-sm font-medium text-gray-600 dark:text-gray-400">
                      Ваш промокод
                    </span>
                  </div>
                  <div className="relative rounded-xl border-2 border-blue-300 bg-gradient-to-br from-blue-50 to-blue-100 p-6 text-center shadow-inner dark:border-blue-600 dark:from-blue-900/30 dark:to-blue-900/20">
                    {/* Промокод с эффектом одноразового пароля */}
                    <div className="mb-4 flex justify-center gap-1.5">
                      {displayPromoCode.split('').map((char, idx) => (
                        <div
                          key={idx}
                          className="flex h-12 w-10 items-center justify-center rounded-lg border-2 border-blue-300 bg-white font-mono text-2xl font-bold text-blue-700 shadow-sm dark:border-blue-700 dark:bg-gray-800 dark:text-blue-300"
                        >
                          {char}
                        </div>
                      ))}
                    </div>
                    <button
                      onClick={handleCopyPromo}
                      className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white shadow-md transition hover:bg-blue-700 hover:shadow-lg active:scale-95"
                    >
                      {copied ? (
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
                          Скопировать код
                        </>
                      )}
                    </button>
                  </div>
                </div>
              ) : discount.shortDescription ? (
                <div className="mb-6">
                  <div className="rounded-lg bg-gray-50 p-4 dark:bg-gray-700/50">
                    <div 
                      className="text-sm leading-relaxed text-gray-700 dark:text-gray-300 break-words"
                      dangerouslySetInnerHTML={{ 
                        __html: sanitizeDescription(discount.shortDescription)
                      }}
                    />
                  </div>
                </div>
              ) : discount.description ? (
                <div className="mb-6">
                  <div className="max-h-48 overflow-y-auto rounded-lg bg-gray-50 p-4 dark:bg-gray-700/50">
                    <div 
                      className="text-sm leading-relaxed text-gray-700 dark:text-gray-300 break-words
                        [&_ul]:space-y-1 [&_ul]:ml-4 [&_ul]:list-disc
                        [&_ol]:space-y-1 [&_ol]:ml-4 [&_ol]:list-decimal
                        [&_li]:break-words [&_li]:leading-relaxed"
                      dangerouslySetInnerHTML={{ 
                        __html: sanitizeDescription(
                          discount.description.length > 500 
                            ? discount.description.substring(0, 500) + '...' 
                            : discount.description
                        )
                      }}
                    />
                  </div>
                  <p className="mt-2 text-center text-xs text-gray-500 dark:text-gray-400">
                    Подробнее читайте в разделе "Условия использования"
                  </p>
                </div>
              ) : (
                <div className="mb-6">
                  <div className="rounded-lg bg-gray-50 p-4 text-center dark:bg-gray-700/50">
                    <p className="text-sm leading-relaxed text-gray-700 dark:text-gray-300">
                      Представьте при оплате или покажите эту страницу
                    </p>
                  </div>
                </div>
              )}

              {/* Open Partner Button */}
              <button
                onClick={handleOpenPartner}
                className="w-full rounded-lg bg-emerald-600 px-6 py-3.5 font-semibold text-white shadow-lg transition hover:bg-emerald-700"
              >
                {discount.partnerUrl ? "Перейти на сайт партнера" : "Открыть мои скидки"}
              </button>

              <p className="mt-4 text-center text-sm text-gray-600 dark:text-gray-400">
                {discount.promoCode 
                  ? "Используйте промокод при оформлении заказа"
                  : "Предъявите при оплате или покажите эту страницу"
                }
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

