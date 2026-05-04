"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import clsx from "clsx";
import type { DiscountItem } from "@/types/discounts";
import {
  getPartnerVenueCategoryBadgeBg,
  getPartnerVenueCategoryLabel,
  getPartnerVenueServiceLabels,
} from "@/lib/partner-venue-service-taxonomy";

interface DiscountCardProps {
  discount: DiscountItem;
  isFavorite?: boolean;
  isClaimed?: boolean;
  onToggleFavorite?: (id: number) => void;
  onClaim?: (id: number) => void;
  forceShowImage?: boolean;
  selectedCityId?: number | null; // ID выбранного города для фильтрации отображения
  /** Скрыть блок промокода (список каталога и т.п.) */
  hidePromoCode?: boolean;
  /** Выше порядком в каталоге — eager load баннера, меньше «пустой» превью при lazy loading */
  eagerBanner?: boolean;
}

export default function DiscountCard({
  discount,
  isFavorite = false,
  isClaimed = false,
  onToggleFavorite,
  onClaim,
  forceShowImage = false,
  selectedCityId = null,
  hidePromoCode = false,
  eagerBanner = false,
}: DiscountCardProps) {
  const router = useRouter();
  const [copied, setCopied] = useState(false);
  const [imageError, setImageError] = useState(false);
  /** Партнёр: баннер в шапке не загрузился — пробуем логотип в той же рамке */
  const [partnerBannerHeroFailed, setPartnerBannerHeroFailed] = useState(false);
  const [partnerLogoError, setPartnerLogoError] = useState(false);
  /** Соотношение сторон героя из файла — рамка подстраивается, без полей при object-contain */
  const [heroNaturalAspect, setHeroNaturalAspect] = useState<string | null>(null);
  const heroImgRef = useRef<HTMLImageElement | null>(null);
  const mediaFrameRef = useRef<HTMLDivElement | null>(null);

  const syncHeroNaturalAspectFromEl = useCallback((el: HTMLImageElement | null) => {
    if (!el) return;
    const w = el.naturalWidth;
    const h = el.naturalHeight;
    if (w > 0 && h > 0) {
      setHeroNaturalAspect(`${w} / ${h}`);
    }
  }, []);

  useEffect(() => {
    setPartnerLogoError(false);
  }, [discount.partnerVenueId, discount.partnerLogoUrl]);

  useEffect(() => {
    setImageError(false);
    setPartnerBannerHeroFailed(false);
  }, [discount.imageUrl, discount.id, discount.partnerVenueId, discount.partnerLogoUrl]);

  const partnerVenueBannerUrl =
    discount.isPartnerVenue && discount.imageUrl?.trim()
      ? discount.imageUrl.trim()
      : null;
  const partnerLogoUrlVal =
    discount.isPartnerVenue && discount.partnerLogoUrl?.trim()
      ? discount.partnerLogoUrl.trim()
      : null;

  /** Только баннер площадки; логотип не подставляем в шапку (иначе квадратное лого «заменяет» баннер). */
  const partnerHeroImgSrc =
    discount.isPartnerVenue &&
    partnerVenueBannerUrl &&
    !partnerBannerHeroFailed
      ? partnerVenueBannerUrl
      : null;

  const heroImgSrc =
    discount.isPartnerVenue === true
      ? partnerHeroImgSrc
      : discount.imageUrl ?? null;

  useLayoutEffect(() => {
    if (!heroImgSrc || imageError) {
      setHeroNaturalAspect(null);
      return;
    }
    const el = heroImgRef.current;
    if (!el) return;
    syncHeroNaturalAspectFromEl(el);
    if (el.complete) return;
    const onLoadSync = () => syncHeroNaturalAspectFromEl(el);
    el.addEventListener("load", onLoadSync);
    return () => el.removeEventListener("load", onLoadSync);
  }, [heroImgSrc, imageError, syncHeroNaturalAspectFromEl]);

  useLayoutEffect(() => {
    const frame = mediaFrameRef.current;
    if (!frame) return;
    if (heroNaturalAspect) {
      frame.style.aspectRatio = heroNaturalAspect;
    } else {
      frame.style.removeProperty("aspect-ratio");
    }
  }, [heroNaturalAspect]);

  /** Заголовок на градиенте, если в шапке нет успешно показанного баннера */
  const showHeroPlaceholderTitles =
    discount.isPartnerVenue !== true ||
    imageError ||
    !partnerVenueBannerUrl ||
    partnerBannerHeroFailed;

  const handleHeroImgError = () => {
    if (
      discount.isPartnerVenue &&
      partnerVenueBannerUrl &&
      partnerLogoUrlVal &&
      !partnerBannerHeroFailed
    ) {
      setPartnerBannerHeroFailed(true);
      return;
    }
    setImageError(true);
    setHeroNaturalAspect(null);
  };

  const cities = discount.cities ?? [];
  const categories = discount.categories ?? [];

  // Определяем города для отображения в карточке
  const displayCities = selectedCityId
    ? cities.filter((city) => city.id === selectedCityId)
    : cities;

  const partnerServiceInfo =
    discount.isPartnerVenue
      ? getPartnerVenueServiceLabels(
          discount.partnerServiceCategoryCode,
          discount.partnerServiceCode
        )
      : null;

  const partnerCategoryLabel =
    discount.isPartnerVenue
      ? getPartnerVenueCategoryLabel(discount.partnerServiceCategoryCode)
      : null;

  /** Кикер: только рубрика из кабинета (категория услуг), без юридического имени партнёра */
  const partnerEyebrowText =
    discount.isPartnerVenue
      ? partnerServiceInfo?.category ?? partnerCategoryLabel ?? undefined
      : undefined;
  const partnerEyebrowShowsCategory =
    discount.isPartnerVenue &&
    Boolean(partnerServiceInfo?.category || partnerCategoryLabel);

  const partnerServiceBadgeBg = discount.isPartnerVenue
    ? getPartnerVenueCategoryBadgeBg(discount.partnerServiceCategoryCode)
    : "bg-indigo-600/90";

  const partnerServicePillClass = clsx(
    "inline-flex w-fit max-w-[55%] shrink-0 items-center truncate whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-semibold leading-none text-white shadow",
    partnerServiceBadgeBg
  );

  const citiesLabel = (() => {
    if (displayCities.length > 0) {
      return displayCities.length <= 3
        ? displayCities.map((city) => city.name).join(", ")
        : `${displayCities.slice(0, 3).map((city) => city.name).join(", ")} и ещё ${displayCities.length - 3}`;
    }

    // Глобальная скидка без привязки к конкретному городу
    if (cities.length === 0) {
      return "Все города";
    }

    // Fallback: показываем доступные города скидки, если локальный фильтр дал пусто
    return cities.length <= 3
      ? cities.map((city) => city.name).join(", ")
      : `${cities.slice(0, 3).map((city) => city.name).join(", ")} и ещё ${cities.length - 3}`;
  })();

  const handleCopyPromo = async (e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent card click when copying promo
    
    if (!discount.promoCode || !navigator?.clipboard) {
      return;
    }

    try {
      await navigator.clipboard.writeText(discount.promoCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.warn("Failed to copy promo code", error);
    }
  };

  const handleFavoriteToggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    onToggleFavorite?.(discount.id);
  };

  const handleCardClick = () => {
    if (discount.isPartnerVenue && discount.partnerVenueId) {
      router.push(`/dashboard/discounts/partner/${discount.partnerVenueId}`);
      return;
    }
    const url = selectedCityId 
      ? `/dashboard/discounts/${discount.id}?cityId=${selectedCityId}`
      : `/dashboard/discounts/${discount.id}`;
    router.push(url);
  };

  const goToDetail = (e: React.MouseEvent) => {
    e.stopPropagation();
    handleCardClick();
  };

  /** Пока грузится картинка — 16:9; после onLoad — фактическое соотношение файла (без полей с object-contain) */
  const mediaFrameBaseClass =
    "relative w-full min-h-0 shrink-0 overflow-hidden bg-gradient-to-br from-gray-100 to-gray-200 dark:from-gray-900 dark:to-gray-800";

  return (
    <div 
      onClick={handleCardClick}
      className="flex h-full min-w-0 flex-col overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-md cursor-pointer dark:border-gray-700 dark:bg-gray-800">
      {/* Image/Header */}
      <div
        ref={mediaFrameRef}
        className={clsx(mediaFrameBaseClass, !heroNaturalAspect && "aspect-video")}
      >
        {heroImgSrc && !imageError ? (
          <img
            key={heroImgSrc}
            ref={heroImgRef}
            src={heroImgSrc}
            alt={discount.title}
            className="absolute inset-0 z-10 h-full w-full object-cover object-center"
            loading={eagerBanner ? "eager" : "lazy"}
            decoding={eagerBanner ? "sync" : "async"}
            onLoad={(e) => syncHeroNaturalAspectFromEl(e.currentTarget)}
            onError={
              discount.isPartnerVenue === true
                ? handleHeroImgError
                : () => {
                    setImageError(true);
                    setHeroNaturalAspect(null);
                  }
            }
          />
        ) : (
          <div
            className={`absolute inset-0 flex h-full items-center justify-center px-3 py-4 text-center text-white sm:px-6 ${
              discount.isPartnerVenue
                ? "bg-gradient-to-br from-indigo-500 via-blue-600 to-cyan-500 dark:from-indigo-700 dark:via-blue-700 dark:to-cyan-600"
                : "bg-gradient-to-br from-blue-500 via-purple-500 to-pink-500 dark:from-blue-600 dark:via-purple-600 dark:to-pink-600"
            }`}
          >
            <div className="flex max-w-full flex-col text-left">
              {!discount.isPartnerVenue && (
                <p className="text-[10px] font-semibold uppercase tracking-wide opacity-80 sm:text-xs">
                  Скидки BestBenefits
                </p>
              )}
              {showHeroPlaceholderTitles && (
                <>
                  <p className="mt-0.5 text-sm font-bold leading-snug line-clamp-2 sm:text-base">
                    {discount.title}
                  </p>
                  {discount.isPartnerVenue && (
                    <p className="mt-1 text-[10px] opacity-90 line-clamp-1 sm:text-xs">
                      {partnerEyebrowText || discount.partnerName || "Партнёр"}
                    </p>
                  )}
                </>
              )}
            </div>
          </div>
        )}

        <div className="absolute inset-x-0 top-0 flex items-start justify-between p-2 sm:p-4">
          <div className="flex flex-col gap-1.5 sm:gap-2">
            {discount.isPartnerVenue && (
              <span className="inline-flex w-fit shrink-0 self-start items-center whitespace-nowrap rounded-full bg-indigo-600/90 px-2 py-0.5 text-xs font-semibold leading-none text-white shadow">
                Партнёр
              </span>
            )}
            {discount.discountValue && (
              <span className="inline-flex items-center rounded-full bg-white/90 px-2 sm:px-3 py-0.5 sm:py-1 text-xs font-semibold text-blue-700 shadow dark:bg-gray-900/80 dark:text-blue-300">
                {discount.discountValue}
              </span>
            )}
            {isClaimed && (
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/90 px-2 sm:px-3 py-0.5 sm:py-1 text-xs font-semibold uppercase tracking-wide text-white shadow">
                <svg className="h-3 w-3 sm:h-3.5 sm:w-3.5" viewBox="0 0 20 20" fill="currentColor">
                  <path
                    fillRule="evenodd"
                    d="M16.704 5.29a1 1 0 010 1.414l-7.02 7.02a1 1 0 01-1.414 0L3.296 8.75a1 1 0 111.414-1.414l4.17 4.17 6.313-6.313a1 1 0 011.414 0z"
                    clipRule="evenodd"
                  />
                </svg>
                <span className="hidden sm:inline">Получено</span>
                <span className="sm:hidden">✓</span>
              </span>
            )}
          </div>

          {!discount.isPartnerVenue && <button
            type="button"
            onClick={handleFavoriteToggle}
            aria-label={isFavorite ? "Убрать из избранного" : "Добавить в избранное"}
            className="rounded-full bg-white/90 p-1.5 sm:p-2 text-gray-600 shadow transition hover:text-blue-600 dark:bg-gray-900/80 dark:text-gray-300"
          >
            <svg
              className={clsx("h-4 w-4 transition", {
                "text-rose-500": isFavorite,
              })}
              viewBox="0 0 24 24"
              fill={isFavorite ? "currentColor" : "none"}
              stroke="currentColor"
              strokeWidth={1.6}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 6 4 4 6.5 4A4.5 4.5 0 0112 6.09 4.5 4.5 0 0117.5 4C20 4 22 6 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"
              />
            </svg>
          </button>}
        </div>
      </div>

      {/* Content */}
      <div className="flex flex-1 flex-col gap-3 sm:gap-4 p-3 sm:p-4">
        <div className="space-y-1 sm:space-y-2">
          <div
            className={clsx(
              "min-w-0",
              discount.isPartnerVenue &&
                discount.partnerLogoUrl &&
                !partnerLogoError &&
                "flex items-start gap-3 sm:gap-4"
            )}
          >
            {discount.isPartnerVenue &&
              discount.partnerLogoUrl &&
              !partnerLogoError && (
                <div
                  className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-gray-200 bg-white sm:h-14 sm:w-14 dark:border-gray-600 dark:bg-gray-900"
                  aria-hidden
                >
                  <img
                    src={discount.partnerLogoUrl}
                    alt=""
                    className="max-h-full max-w-full object-contain p-1"
                    loading="lazy"
                    decoding="async"
                    onError={() => setPartnerLogoError(true)}
                  />
                </div>
              )}
            <div className="min-w-0 flex-1 space-y-1 sm:space-y-2">
              {(discount.isPartnerVenue ? partnerEyebrowText : discount.mainCategory?.name) && (
                <p className="truncate text-xs font-semibold uppercase tracking-wide text-blue-600 dark:text-blue-300">
                  {discount.isPartnerVenue ? partnerEyebrowText : discount.mainCategory?.name}
                </p>
              )}
              {discount.isPartnerVenue &&
                partnerEyebrowShowsCategory &&
                discount.partnerName &&
                discount.partnerName !== discount.title && (
                  <p className="truncate text-[11px] font-normal normal-case tracking-normal text-gray-500 dark:text-gray-400 sm:text-xs">
                    {discount.partnerName}
                  </p>
                )}
              <h3 className="text-base sm:text-lg font-semibold text-gray-900 dark:text-white line-clamp-2">
                {discount.title}
              </h3>
            </div>
          </div>
          {discount.shortDescription && (
            <p className="text-xs sm:text-sm text-gray-600 dark:text-gray-400 line-clamp-2">
              {discount.shortDescription}
            </p>
          )}
        </div>

        <div className="space-y-2 text-xs sm:text-sm text-gray-600 dark:text-gray-400">
          <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
            {discount.isPartnerVenue && partnerServiceInfo?.service && (
              <span
                className={partnerServicePillClass}
                title={partnerServiceInfo.service}
              >
                {partnerServiceInfo.service}
              </span>
            )}
            <svg className="h-4 w-4 flex-none text-gray-400 dark:text-gray-500" viewBox="0 0 24 24" fill="none" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 11c1.105 0 2-.672 2-1.5S13.105 8 12 8s-2 .672-2 1.5.895 1.5 2 1.5z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 22s7-4.35 7-11.5S16.418 2 12 2 5 5.35 5 10.5 12 22 12 22z" />
            </svg>
            <span className="min-w-0 flex-1 truncate">{citiesLabel}</span>
            {discount.distanceKm && (
              <span className="text-xs text-gray-400 dark:text-gray-500 flex-none">~{discount.distanceKm} км</span>
            )}
            {discount.updatedAt && (
              <span
                className="ml-auto shrink-0 text-[10px] tabular-nums text-gray-400 dark:text-gray-500 sm:text-[11px]"
                title={`Обновлено ${formatDate(discount.updatedAt)}`}
              >
                обн. {formatShortDate(discount.updatedAt)}
              </span>
            )}
          </div>
          {discount.isPartnerVenue &&
            discount.partnerParticipationMode === "APPLICATION" &&
            discount.partnerApplicationSlotsCapped === true &&
            typeof discount.partnerRemainingApplicationSlots === "number" && (
              <div>
                <span className="inline-flex w-fit shrink-0 items-center whitespace-nowrap rounded-full bg-red-600/90 px-2 py-0.5 text-xs font-semibold leading-none text-white shadow dark:bg-red-700/90">
                  Осталось мест {discount.partnerRemainingApplicationSlots}
                </span>
              </div>
            )}
          {discount.validUntil && (
            <div className="flex items-center gap-2">
              <svg className="h-4 w-4 flex-none text-gray-400 dark:text-gray-500" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              <span className="truncate">До {formatDate(discount.validUntil)}</span>
            </div>
          )}
          {categories.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {categories.slice(0, 2).map((category) => (
                <span
                  key={category.id}
                  className="inline-flex items-center rounded-full border border-blue-100 bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700 dark:border-blue-500/40 dark:bg-blue-500/10 dark:text-blue-200"
                >
                  {category.name}
                </span>
              ))}
              {categories.length > 2 && (
                <span className="inline-flex items-center rounded-full border border-gray-100 bg-gray-50 px-2 py-0.5 text-xs font-medium text-gray-600 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-400">
                  +{categories.length - 2}
                </span>
              )}
            </div>
          )}
        </div>

        {!hidePromoCode &&
          discount.promoCode &&
          (() => {
            // Проверяем, не является ли промокод специальным случаем
            const isSpecialCase =
              discount.promoCode === "Штрихкод в купоне" ||
              discount.promoCode.toLowerCase().includes("штрихкод") ||
              discount.promoCode.toLowerCase().includes("barcode");

            // Если специальный случай, показываем инструкцию
            if (isSpecialCase) {
              return (
                <div className="inline-flex items-center rounded-lg border border-dashed border-gray-300 px-2.5 py-1.5 text-xs sm:text-sm font-medium text-gray-600 dark:border-gray-600 dark:text-gray-400">
                  <span className="truncate">Штрихкод в купоне</span>
                </div>
              );
            }

            return (
              <button
                type="button"
                onClick={handleCopyPromo}
                className={clsx(
                  "inline-flex items-center justify-between rounded-lg border px-2.5 py-1.5 text-xs sm:text-sm font-medium transition",
                  copied
                    ? "border-green-500 bg-green-50 text-green-700 dark:border-green-500/40 dark:bg-green-500/10 dark:text-green-200"
                    : "border-dashed border-gray-300 text-gray-700 hover:border-blue-300 hover:text-blue-700 dark:border-gray-600 dark:text-gray-200"
                )}
              >
                <span className="truncate mr-2">
                  <span className="hidden sm:inline">Промокод: </span>
                  {discount.promoCode}
                </span>
                <svg className="h-4 w-4 flex-none" viewBox="0 0 20 20" fill="currentColor">
                  <path d="M5 7a2 2 0 012-2h6a1 1 0 011 1v8a2 2 0 01-2 2H8a1 1 0 01-1-1V7H5z" />
                  <path d="M9 3a2 2 0 00-2 2h6a2 2 0 012 2v6a2 2 0 001-1.732V5a2 2 0 00-2-2H9z" />
                </svg>
              </button>
            );
          })()}

        <div className="mt-auto space-y-2 pt-2">
          <div className="flex w-full flex-col gap-2">
            {!discount.isPartnerVenue && !isClaimed && onClaim && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onClaim(discount.id);
                }}
                className="flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white shadow transition hover:bg-blue-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 dark:ring-offset-gray-800"
              >
                <span>Получить промокод</span>
                <svg className="h-4 w-4 shrink-0" viewBox="0 0 20 20" fill="currentColor" aria-hidden>
                  <path d="M11 3a1 1 0 100 2h2.586l-6.293 6.293a1 1 0 101.414 1.414L15 6.414V9a1 1 0 102 0V4a1 1 0 00-1-1h-5z" />
                  <path d="M5 5a2 2 0 00-2 2v8a2 2 0 002 2h8a2 2 0 002-2v-3a1 1 0 10-2 0v3H5V7h3a1 1 0 000-2H5z" />
                </svg>
              </button>
            )}
            <button
              type="button"
              onClick={goToDetail}
              className="flex w-full items-center justify-center gap-2 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-semibold text-gray-800 shadow-sm transition hover:border-blue-300 hover:text-blue-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 dark:hover:border-blue-500 dark:hover:text-blue-200 dark:ring-offset-gray-800"
            >
              <span>Подробнее</span>
              <svg className="h-4 w-4 shrink-0" viewBox="0 0 20 20" fill="currentColor" aria-hidden>
                <path
                  fillRule="evenodd"
                  d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z"
                  clipRule="evenodd"
                />
              </svg>
            </button>
            {!discount.isPartnerVenue && discount.partnerUrl ? (
              <a
                href={discount.partnerUrl}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                className="text-center text-xs font-medium text-blue-600 underline-offset-2 hover:underline dark:text-blue-400"
              >
                Сайт партнёра
              </a>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}

function formatDate(dateString?: string | null) {
  if (!dateString) return "неизвестно";
  const date = new Date(dateString);
  return date.toLocaleDateString("ru-RU", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

/** Компактная дата для подписи в строке метаданных */
function formatShortDate(dateString?: string | null) {
  if (!dateString) return "—";
  const date = new Date(dateString);
  return date.toLocaleDateString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
  });
}
