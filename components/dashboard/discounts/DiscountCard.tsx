"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import clsx from "clsx";
import type { DiscountItem } from "@/types/discounts";

interface DiscountCardProps {
  discount: DiscountItem;
  isFavorite?: boolean;
  isClaimed?: boolean;
  onToggleFavorite?: (id: number) => void;
  onClaim?: (id: number) => void;
  forceShowImage?: boolean;
  selectedCityId?: number | null; // ID выбранного города для фильтрации отображения
}

export default function DiscountCard({
  discount,
  isFavorite = false,
  isClaimed = false,
  onToggleFavorite,
  onClaim,
  forceShowImage = false,
  selectedCityId = null,
}: DiscountCardProps) {
  const router = useRouter();
  const [copied, setCopied] = useState(false);
  const [imageError, setImageError] = useState(false);
  
  // Определяем города для отображения
  const displayCities = selectedCityId
    ? discount.cities.filter(city => city.id === selectedCityId)
    : discount.cities;

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

  const handleClaim = (e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent card click when clicking button
    onClaim?.(discount.id);
    // Link will naturally open in new tab (target="_blank")
  };

  const handleCardClick = () => {
    // Передаем выбранный город через query параметр
    const url = selectedCityId 
      ? `/dashboard/discounts/${discount.id}?cityId=${selectedCityId}`
      : `/dashboard/discounts/${discount.id}`;
    router.push(url);
  };

  return (
    <div 
      onClick={handleCardClick}
      className="flex h-full min-w-0 flex-col overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-md cursor-pointer dark:border-gray-700 dark:bg-gray-800">
      {/* Image/Header - оптимизировано с Next.js Image */}
      <div className="relative w-full h-48 overflow-hidden bg-gradient-to-br from-gray-100 to-gray-200 dark:from-gray-900 dark:to-gray-800 flex items-center justify-center">
        {discount.imageUrl && !imageError ? (
          <Image
            src={discount.imageUrl}
            alt={discount.title}
            fill
            sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 300px"
            className="object-contain"
            loading="lazy"
            quality={75}
            onError={() => setImageError(true)}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-blue-500 via-purple-500 to-pink-500 p-3 sm:p-6 text-center text-white dark:from-blue-600 dark:via-purple-600 dark:to-pink-600">
            <div className="max-w-full px-2">
              <p className="text-xs sm:text-sm font-semibold uppercase tracking-wide opacity-80 truncate">Скидки BestBenefits</p>
              <p className="mt-1 sm:mt-2 text-sm sm:text-lg font-bold line-clamp-2">{discount.title}</p>
            </div>
          </div>
        )}

        <div className="absolute inset-x-0 top-0 flex items-start justify-between p-2 sm:p-4">
          <div className="flex flex-col gap-1.5 sm:gap-2">
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

          <button
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
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex flex-1 flex-col gap-3 sm:gap-4 p-3 sm:p-4">
        <div className="space-y-1 sm:space-y-2">
          {discount.mainCategory?.name && (
            <p className="text-xs font-semibold uppercase tracking-wide text-blue-600 dark:text-blue-300 truncate">
              {discount.mainCategory.name}
            </p>
          )}
          <h3 className="text-base sm:text-lg font-semibold text-gray-900 dark:text-white line-clamp-2">
            {discount.title}
          </h3>
          {discount.shortDescription && (
            <p className="text-xs sm:text-sm text-gray-600 dark:text-gray-400 line-clamp-2">
              {discount.shortDescription}
            </p>
          )}
        </div>

        <div className="space-y-2 text-xs sm:text-sm text-gray-600 dark:text-gray-400">
          <div className="flex items-center gap-2">
            <svg className="h-4 w-4 flex-none text-gray-400 dark:text-gray-500" viewBox="0 0 24 24" fill="none" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 11c1.105 0 2-.672 2-1.5S13.105 8 12 8s-2 .672-2 1.5.895 1.5 2 1.5z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 22s7-4.35 7-11.5S16.418 2 12 2 5 5.35 5 10.5 12 22 12 22z" />
            </svg>
            <span className="truncate flex-1">
              {displayCities.length <= 3 
                ? displayCities.map((city) => city.name).join(", ")
                : `${displayCities.slice(0, 3).map((city) => city.name).join(", ")} и ещё ${displayCities.length - 3}`
              }
            </span>
            {discount.distanceKm && (
              <span className="text-xs text-gray-400 dark:text-gray-500 flex-none">~{discount.distanceKm} км</span>
            )}
          </div>
          {discount.validUntil && (
            <div className="flex items-center gap-2">
              <svg className="h-4 w-4 flex-none text-gray-400 dark:text-gray-500" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              <span className="truncate">До {formatDate(discount.validUntil)}</span>
            </div>
          )}
          {discount.categories.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {discount.categories.slice(0, 2).map((category) => (
                <span
                  key={category.id}
                  className="inline-flex items-center rounded-full border border-blue-100 bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700 dark:border-blue-500/40 dark:bg-blue-500/10 dark:text-blue-200"
                >
                  {category.name}
                </span>
              ))}
              {discount.categories.length > 2 && (
                <span className="inline-flex items-center rounded-full border border-gray-100 bg-gray-50 px-2 py-0.5 text-xs font-medium text-gray-600 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-400">
                  +{discount.categories.length - 2}
                </span>
              )}
            </div>
          )}
        </div>

        {discount.promoCode && (() => {
          // Проверяем, не является ли промокод специальным случаем
          const isSpecialCase = discount.promoCode === "Штрихкод в купоне" ||
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
          {discount.partnerUrl && (
            <a
              href={discount.partnerUrl}
              target="_blank"
              rel="noopener noreferrer"
              onClick={handleClaim}
              className={clsx(
                "flex w-full items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold text-white shadow transition focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 dark:ring-offset-gray-800",
                isClaimed 
                  ? "bg-emerald-600 hover:bg-emerald-700" 
                  : "bg-blue-600 hover:bg-blue-700"
              )}
            >
              <span>{isClaimed ? "Открыть на BestBenefits" : "Использовать скидку"}</span>
              <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                <path d="M11 3a1 1 0 100 2h2.586l-6.293 6.293a1 1 0 101.414 1.414L15 6.414V9a1 1 0 102 0V4a1 1 0 00-1-1h-5z" />
                <path d="M5 5a2 2 0 00-2 2v8a2 2 0 002 2h8a2 2 0 002-2v-3a1 1 0 10-2 0v3H5V7h3a1 1 0 000-2H5z" />
              </svg>
            </a>
          )}
          <div className="flex items-center justify-center">
            <span className="text-xs text-gray-400 dark:text-gray-500 truncate">
              {formatRelative(discount.updatedAt)}
            </span>
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

function formatRelative(dateString?: string | null) {
  if (!dateString) return "недавно";

  const date = new Date(dateString);
  const diffMs = Date.now() - date.getTime();
  const diffMinutes = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMinutes / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMinutes < 60) {
    return `${diffMinutes || 1} мин назад`;
  }

  if (diffHours < 24) {
    return `${diffHours} ч назад`;
  }

  if (diffDays < 7) {
    return `${diffDays} дн назад`;
  }

  return formatDate(dateString);
}
