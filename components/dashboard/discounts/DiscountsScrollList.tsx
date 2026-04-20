"use client";

import DiscountCard from "./DiscountCard";
import type { DiscountItem } from "@/types/discounts";

interface DiscountsScrollListProps {
  discounts: DiscountItem[];
}

// Компонент скелетона для скидки
function DiscountSkeleton() {
  return (
    <div className="flex-none w-[280px] sm:w-[320px] lg:w-[360px]">
      <div className="flex h-full min-w-0 flex-col overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-800 animate-pulse">
        {/* Image/Header */}
        <div className="relative w-full h-48 overflow-hidden bg-gray-200 dark:bg-gray-700"></div>
        
        {/* Content */}
        <div className="flex flex-1 flex-col gap-3 sm:gap-4 p-3 sm:p-4">
          <div className="space-y-2">
            <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-1/4"></div>
            <div className="h-5 bg-gray-200 dark:bg-gray-700 rounded w-3/4"></div>
            <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-full"></div>
            <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-5/6"></div>
          </div>
          
          <div className="space-y-2">
            <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-2/3"></div>
            <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-1/2"></div>
          </div>
          
          <div className="mt-auto pt-2">
            <div className="h-10 bg-gray-200 dark:bg-gray-700 rounded-lg w-full"></div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function DiscountsScrollList({ discounts }: DiscountsScrollListProps) {
  // Вычисляем, сколько скелетонов нужно добавить
  const discountsToShow = [...discounts];
  const skeletonsNeeded = discounts.length < 3 ? 3 - discounts.length : 0;
  
  // Добавляем скелетоны, если скидок меньше 3
  for (let i = 0; i < skeletonsNeeded; i++) {
    discountsToShow.push(null as any);
  }

  if (discounts.length === 0) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-8 text-center">
        <p className="text-gray-500 dark:text-gray-400">
          Пока нет доступных скидок
        </p>
      </div>
    );
  }

  return (
    <div className="w-full min-w-0 overflow-hidden">
      {/* Горизонтальный скролл */}
      <div 
        className="flex gap-4 pb-4 overflow-x-auto"
        style={{ 
          scrollbarWidth: 'none', 
          msOverflowStyle: 'none',
          WebkitOverflowScrolling: 'touch'
        }}
      >
        {discountsToShow.map((discount, index) => {
          if (!discount) {
            return <DiscountSkeleton key={`skeleton-${index}`} />;
          }
          
          return (
            <div key={discount.id} className="flex-none w-[280px] sm:w-[320px] lg:w-[360px]">
              <DiscountCard discount={discount} hidePromoCode />
            </div>
          );
        })}
      </div>
    </div>
  );
}

