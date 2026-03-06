"use client";

import { useState, useRef, useEffect } from "react";
import type { DiscountCategory } from "@/types/discounts";
import clsx from "clsx";
import {
  Baby,
  BookOpen,
  Briefcase,
  Film,
  Globe,
  Package,
  ShoppingCart,
  UtensilsCrossed,
  type LucideIcon,
} from "lucide-react";

// Иконки для категорий (без emoji)
const categoryIcons: Record<string, LucideIcon> = {
  "Онлайн покупки": ShoppingCart,
  "Рестораны и доставка": UtensilsCrossed,
  "Кино и театр": Film,
  "Экскурсии и квесты": Globe,
  "Активити": Package,
  "Шоу": Film,
  "Профессиональные навыки": Briefcase,
  "Языковые курсы": Globe,
  "Обучение детей": Baby,
  "Дети": Baby,
  "Обучение. Дети": BookOpen,
};

interface CategoryFilterProps {
  categories: DiscountCategory[];
  selectedIds: number[];
  onChange: (ids: number[]) => void;
}

export default function CategoryFilter({
  categories,
  selectedIds,
  onChange,
}: CategoryFilterProps) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Закрытие при клике вне dropdown
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Закрытие при нажатии Escape
  useEffect(() => {
    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsOpen(false);
      }
    }

    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, []);

  const handleToggle = (categoryId: number) => {
    if (selectedIds.includes(categoryId)) {
      onChange(selectedIds.filter((id) => id !== categoryId));
    } else {
      onChange([...selectedIds, categoryId]);
    }
  };

  const handleSelectAll = () => {
    onChange(categories.map((c) => c.id));
  };

  const handleClearAll = () => {
    onChange([]);
  };

  const selectedCount = selectedIds.length;
  const selectedNames = categories
    .filter((c) => selectedIds.includes(c.id))
    .map((c) => c.name)
    .slice(0, 2);

  return (
    <div ref={dropdownRef} className="relative">
      {/* Trigger Button */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className={clsx(
          "flex w-full items-center justify-between gap-2 rounded-lg border px-4 py-2.5 text-left text-sm transition",
          selectedCount > 0
            ? "border-blue-500 bg-blue-50 text-blue-700 dark:border-blue-400 dark:bg-blue-900/20 dark:text-blue-300"
            : "border-gray-200 bg-white text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600"
        )}
      >
        <div className="flex items-center gap-2 min-w-0">
          <svg
            className="h-4 w-4 flex-shrink-0 text-gray-400"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M4 6h16M4 12h16M4 18h7"
            />
          </svg>
          <span className="truncate">
            {selectedCount === 0 ? (
              "Все категории"
            ) : selectedCount === 1 ? (
              selectedNames[0]
            ) : selectedCount === 2 ? (
              selectedNames.join(", ")
            ) : (
              <>
                {selectedNames.join(", ")}
                <span className="ml-1 text-gray-500">+{selectedCount - 2}</span>
              </>
            )}
          </span>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {selectedCount > 0 && (
            <span className="rounded-full bg-blue-600 px-2 py-0.5 text-xs font-medium text-white">
              {selectedCount}
            </span>
          )}
          <svg
            className={clsx(
              "h-4 w-4 text-gray-400 transition-transform",
              isOpen && "rotate-180"
            )}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M19 9l-7 7-7-7"
            />
          </svg>
        </div>
      </button>

      {/* Dropdown */}
      {isOpen && (
        <div className="absolute left-0 right-0 z-50 mt-2 max-h-80 overflow-y-auto rounded-xl border border-gray-200 bg-white shadow-xl dark:border-gray-700 dark:bg-gray-800 sm:right-auto sm:min-w-[320px]">
          {/* Header */}
          <div className="sticky top-0 z-10 flex items-center justify-between border-b border-gray-100 bg-white px-4 py-3 dark:border-gray-700 dark:bg-gray-800">
            <span className="text-sm font-medium text-gray-900 dark:text-white">
              Категории
            </span>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={handleSelectAll}
                className="text-xs text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300"
              >
                Выбрать все
              </button>
              {selectedCount > 0 && (
                <>
                  <span className="text-gray-300 dark:text-gray-600">|</span>
                  <button
                    type="button"
                    onClick={handleClearAll}
                    className="text-xs text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300"
                  >
                    Сбросить
                  </button>
                </>
              )}
            </div>
          </div>

          {/* Categories List */}
          <div className="p-2">
            {categories.length === 0 ? (
              <div className="px-4 py-8 text-center text-sm text-gray-500 dark:text-gray-400">
                Категории не найдены
              </div>
            ) : (
              <div className="space-y-1">
                {categories.map((category) => {
                  const isSelected = selectedIds.includes(category.id);
                  const Icon = categoryIcons[category.name] || Package;

                  return (
                    <label
                      key={category.id}
                      className={clsx(
                        "flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2.5 transition",
                        isSelected
                          ? "bg-blue-50 dark:bg-blue-900/20"
                          : "hover:bg-gray-50 dark:hover:bg-gray-700/50"
                      )}
                    >
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => handleToggle(category.id)}
                        className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-2 focus:ring-blue-500 dark:border-gray-500 dark:bg-gray-600"
                      />
                      <Icon className="h-4 w-4 text-gray-500 dark:text-gray-400" />
                      <span
                        className={clsx(
                          "flex-1 text-sm",
                          isSelected
                            ? "font-medium text-blue-700 dark:text-blue-300"
                            : "text-gray-700 dark:text-gray-300"
                        )}
                      >
                        {category.name}
                      </span>
                      {category.count !== undefined && category.count > 0 && (
                        <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-500 dark:bg-gray-700 dark:text-gray-400">
                          {category.count}
                        </span>
                      )}
                    </label>
                  );
                })}
              </div>
            )}
          </div>

          {/* Footer */}
          {selectedCount > 0 && (
            <div className="sticky bottom-0 border-t border-gray-100 bg-gray-50 px-4 py-3 dark:border-gray-700 dark:bg-gray-800/50">
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="w-full rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-700"
              >
                Применить ({selectedCount})
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

