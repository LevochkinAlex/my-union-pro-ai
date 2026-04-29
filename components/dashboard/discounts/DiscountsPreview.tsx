"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import Image from "next/image";
import type { DiscountItem } from "@/types/discounts";

// Компонент скелетона
function DiscountSkeleton() {
  return (
    <div className="flex-none w-[220px] sm:w-[240px]">
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden animate-pulse h-[200px] flex flex-col">
        <div className="w-full h-24 bg-gray-200 dark:bg-gray-700"></div>
        <div className="p-3 flex flex-col flex-1">
          <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-1/4 mb-2"></div>
          <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-3/4 mb-2"></div>
          <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-full"></div>
        </div>
      </div>
    </div>
  );
}

// Мини-карточка скидки
function DiscountMiniCard({ discount }: { discount: DiscountItem }) {
  const [imgError, setImgError] = useState(false);
  
  return (
    <Link href={`/dashboard/discounts?id=${discount.id}`} className="block h-full">
      <article className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden h-full hover:shadow-md hover:border-blue-300 dark:hover:border-blue-600 transition-all duration-200 cursor-pointer flex flex-col">
        {/* Изображение */}
        <div className="relative w-full h-24 overflow-hidden bg-gradient-to-br from-blue-500 to-purple-600">
          {discount.imageUrl && !imgError ? (
            <Image
              src={discount.imageUrl}
              alt={discount.title}
              fill
              sizes="240px"
              className="object-cover"
              loading="lazy"
              quality={60}
              onError={() => setImgError(true)}
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-white font-bold text-lg">
              {discount.discountValue || "🎁"}
            </div>
          )}
          {/* Бейдж скидки */}
          {discount.discountValue && (
            <div className="absolute top-2 left-2 bg-red-500 text-white text-xs font-bold px-2 py-0.5 rounded">
              {discount.discountValue}
            </div>
          )}
        </div>

        <div className="p-3 flex flex-col flex-1">
          {/* Категория */}
          {discount.mainCategory && (
            <span className="text-[10px] text-blue-600 dark:text-blue-400 font-medium mb-1 truncate">
              {discount.mainCategory.name}
            </span>
          )}
          
          {/* Название */}
          <h3 className="font-semibold text-gray-900 dark:text-white text-xs line-clamp-2 leading-snug">
            {discount.title}
          </h3>
        </div>
      </article>
    </Link>
  );
}

export default function DiscountsPreview() {
  const [discounts, setDiscounts] = useState<DiscountItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    const loadDiscounts = async () => {
      try {
        const response = await fetch("/api/discounts?limit=6", {
          cache: "no-store",
        });

        if (!response.ok) {
          console.warn("[DiscountsPreview] HTTP", response.status, response.statusText);
          setDiscounts([]);
          setError(true);
          return;
        }

        const data = await response.json().catch(() => ({}));
        setDiscounts(Array.isArray(data.discounts) ? data.discounts : []);
      } catch (err) {
        console.error("[DiscountsPreview] Error loading discounts:", err);
        setDiscounts([]);
        setError(true);
      } finally {
        setLoading(false);
      }
    };

    loadDiscounts();
  }, []);

  // Показываем скелетоны пока загружается
  if (loading) {
    return (
      <div className="w-full min-w-0 overflow-hidden">
        <div 
          className="flex gap-3 pb-4 overflow-x-auto"
          style={{ 
            scrollbarWidth: 'none', 
            msOverflowStyle: 'none',
            WebkitOverflowScrolling: 'touch'
          }}
        >
          {[1, 2, 3].map((i) => (
            <DiscountSkeleton key={i} />
          ))}
        </div>
      </div>
    );
  }

  // Нет данных или ошибка загрузки — ссылка в каталог, без падения страницы
  if (error || discounts.length === 0) {
    return (
      <div className="space-y-2 py-6 text-center">
        {error && (
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Не удалось загрузить превью скидок. Откройте раздел целиком.
          </p>
        )}
        <Link
          href="/dashboard/discounts"
          className="inline-flex items-center gap-2 text-sm font-medium text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300"
        >
          <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
          </svg>
          Перейти к скидкам и привилегиям
        </Link>
      </div>
    );
  }

  return (
    <div className="w-full min-w-0 overflow-hidden">
      <div 
        className="flex gap-3 pb-4 overflow-x-auto"
        style={{ 
          scrollbarWidth: 'none', 
          msOverflowStyle: 'none',
          WebkitOverflowScrolling: 'touch'
        }}
      >
        {discounts.slice(0, 6).map((discount) => (
          <div key={discount.id} className="flex-none w-[220px] sm:w-[240px]">
            <DiscountMiniCard discount={discount} />
          </div>
        ))}
      </div>
    </div>
  );
}

