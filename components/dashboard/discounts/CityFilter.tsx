"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { DiscountCity } from "@/types/discounts";

interface CityFilterProps {
  cities: DiscountCity[];
  value: number | null;
  onChange: (cityId: number | null) => void;
}

/** Нормализация для сопоставления названия города при вводе (ё/е, регистр). */
function normalizeCityQuery(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ");
}

export default function CityFilter({ cities, value, onChange }: CityFilterProps) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);
  const [query, setQuery] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const [highlightIndex, setHighlightIndex] = useState(-1);

  const sortedCities = useMemo(
    () => [...cities].sort((a, b) => a.name.localeCompare(b.name, "ru-RU")),
    [cities],
  );

  const selectedCity = useMemo(
    () => sortedCities.find((c) => c.id === value) ?? null,
    [sortedCities, value],
  );

  const filtered = useMemo(() => {
    const q = normalizeCityQuery(query);
    if (!q) return sortedCities;
    return sortedCities.filter((c) => normalizeCityQuery(c.name).includes(q));
  }, [sortedCities, query]);

  useEffect(() => {
    setHighlightIndex(-1);
  }, [filtered]);

  useEffect(() => {
    if (!isOpen) return;
    const onClickOutside = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setIsOpen(false);
        setQuery("");
      }
    };
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [isOpen]);

  useEffect(() => {
    if (highlightIndex < 0 || !listRef.current) return;
    const el = listRef.current.children[highlightIndex] as HTMLElement | undefined;
    el?.scrollIntoView({ block: "nearest" });
  }, [highlightIndex]);

  const pick = (city: DiscountCity | null) => {
    onChange(city?.id ?? null);
    setQuery("");
    setIsOpen(false);
    inputRef.current?.blur();
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      setIsOpen(false);
      setQuery("");
      inputRef.current?.blur();
      return;
    }
    if (!isOpen) {
      if (e.key === "ArrowDown" || e.key === "Enter") {
        setIsOpen(true);
        return;
      }
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlightIndex((i) => Math.min(i + 1, filtered.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlightIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (highlightIndex >= 0 && highlightIndex < filtered.length) {
        pick(filtered[highlightIndex]);
      } else if (filtered.length === 1) {
        pick(filtered[0]);
      }
    }
  };

  return (
    <div ref={rootRef} className="relative">
      {selectedCity ? (
        <div className="flex items-center gap-1.5 rounded-lg border border-blue-200 bg-blue-50 py-1.5 pl-3 pr-1.5 dark:border-blue-700 dark:bg-blue-900/30">
          <svg className="h-3.5 w-3.5 shrink-0 text-blue-500 dark:text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
          </svg>
          <span className="flex-1 truncate text-sm font-medium text-blue-800 dark:text-blue-200">
            {selectedCity.name}
          </span>
          <button
            type="button"
            onClick={() => pick(null)}
            title="Сбросить город"
            aria-label="Сбросить город"
            className="rounded-md p-1 text-blue-400 transition hover:bg-blue-100 hover:text-blue-600 dark:hover:bg-blue-800 dark:hover:text-blue-200"
          >
            <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      ) : (
        <div className="relative">
          <svg className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
          </svg>
          <input
            ref={inputRef}
            type="text"
            value={query}
            aria-label="Поиск города"
            placeholder="Город..."
            onFocus={() => setIsOpen(true)}
            onChange={(e) => {
              setQuery(e.target.value);
              setIsOpen(true);
            }}
            onKeyDown={onKeyDown}
            className="w-full rounded-lg border border-gray-200 bg-white py-2 pl-8 pr-3 text-sm text-gray-900 placeholder-gray-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:border-gray-600 dark:bg-gray-700 dark:text-white dark:placeholder-gray-400"
          />
        </div>
      )}

      {isOpen && !selectedCity && (
        <div
          ref={listRef}
          className="absolute z-30 mt-1 max-h-60 w-full overflow-y-auto overscroll-contain rounded-lg border border-gray-200 bg-white shadow-lg dark:border-gray-700 dark:bg-gray-800"
        >
          {filtered.length > 0 ? (
            filtered.map((city, idx) => (
              <button
                key={city.id}
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  pick(city);
                }}
                onMouseEnter={() => setHighlightIndex(idx)}
                className={`block w-full px-3 py-2 text-left text-sm transition ${
                  idx === highlightIndex
                    ? "bg-blue-50 text-blue-700 dark:bg-blue-900/40 dark:text-blue-200"
                    : "text-gray-700 hover-surface dark:text-gray-200"
                }`}
              >
                {city.name}
              </button>
            ))
          ) : (
            <div className="px-3 py-3 text-center text-sm text-gray-400 dark:text-gray-500">
              Ничего не найдено
            </div>
          )}
        </div>
      )}
    </div>
  );
}
