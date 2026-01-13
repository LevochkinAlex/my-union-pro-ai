"use client";

import { useMemo } from "react";
import type { DiscountCity } from "@/types/discounts";

interface CityFilterProps {
  cities: DiscountCity[];
  value: number | null;
  onChange: (cityId: number | null) => void;
}

export default function CityFilter({ cities, value, onChange }: CityFilterProps) {
  // Сортируем города по алфавиту
  const sortedCities = useMemo(() => {
    return [...cities].sort((a, b) => a.name.localeCompare(b.name, 'ru-RU'));
  }, [cities]);

  const handleCityChange = (cityId: string) => {
    onChange(cityId ? Number(cityId) : null);
  };

  return (
    <div>
      {/* Город - единственный фильтр */}
      <select
        value={value ?? ""}
        onChange={(e) => handleCityChange(e.target.value)}
        className="w-full rounded-lg border border-gray-200 bg-white px-4 py-2.5 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
      >
        <option value="">Все города</option>
        {sortedCities.map((city) => (
          <option key={city.id} value={city.id}>
            {city.name}
          </option>
        ))}
      </select>
    </div>
  );
}

