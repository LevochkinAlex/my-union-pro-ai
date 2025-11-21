"use client";

import { useState, useMemo } from "react";
import { RUSSIAN_REGIONS, getRegionByCity, getAllRussianCities } from "@/lib/constants/russian-regions";
import type { DiscountCity } from "@/types/discounts";

interface CityFilterProps {
  cities: DiscountCity[];
  value: number | null;
  onChange: (cityId: number | null) => void;
}

export default function CityFilter({ cities, value, onChange }: CityFilterProps) {
  const [selectedCountry, setSelectedCountry] = useState<string>("russia");
  const [selectedRegion, setSelectedRegion] = useState<string>("all");

  // Фильтруем только российские города
  const russianCities = useMemo(() => {
    const allRussianCityNames = getAllRussianCities();
    return cities.filter(city => 
      allRussianCityNames.some(ruCity => ruCity.toLowerCase() === city.name.toLowerCase())
    );
  }, [cities]);

  // Получаем города выбранного региона
  const regionCities = useMemo(() => {
    if (selectedRegion === "all") {
      return russianCities;
    }
    const region = RUSSIAN_REGIONS.find(r => r.id === selectedRegion);
    if (!region) return russianCities;
    
    return russianCities.filter(city =>
      region.cities.some(regionCity => regionCity.toLowerCase() === city.name.toLowerCase())
    );
  }, [russianCities, selectedRegion]);

  // Группируем города по регионам для отображения
  const citiesByRegion = useMemo(() => {
    const grouped = new Map<string, DiscountCity[]>();
    
    russianCities.forEach(city => {
      const region = getRegionByCity(city.name);
      if (region) {
        if (!grouped.has(region.id)) {
          grouped.set(region.id, []);
        }
        grouped.get(region.id)!.push(city);
      }
    });

    // Сортируем города в каждом регионе по алфавиту
    grouped.forEach((cityList, regionId) => {
      cityList.sort((a, b) => a.name.localeCompare(b.name, 'ru-RU'));
    });

    return grouped;
  }, [russianCities]);

  const handleCountryChange = (country: string) => {
    setSelectedCountry(country);
    setSelectedRegion("all");
    onChange(null); // Сбрасываем выбор города при смене страны
  };

  const handleRegionChange = (regionId: string) => {
    setSelectedRegion(regionId);
    onChange(null); // Сбрасываем выбор города при смене региона
  };

  const handleCityChange = (cityId: string) => {
    onChange(cityId ? Number(cityId) : null);
  };

  return (
    <div className="grid gap-3 sm:grid-cols-3">
      {/* Страна */}
      <select
        value={selectedCountry}
        onChange={(e) => handleCountryChange(e.target.value)}
        className="w-full rounded-lg border border-gray-200 bg-white px-4 py-2.5 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
      >
        <option value="russia">Россия</option>
      </select>

      {/* Регион */}
      <select
        value={selectedRegion}
        onChange={(e) => handleRegionChange(e.target.value)}
        className="w-full rounded-lg border border-gray-200 bg-white px-4 py-2.5 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
      >
        <option value="all">Все регионы</option>
        {RUSSIAN_REGIONS.map((region) => (
          <option key={region.id} value={region.id}>
            {region.name}
          </option>
        ))}
      </select>

      {/* Город */}
      <select
        value={value ?? ""}
        onChange={(e) => handleCityChange(e.target.value)}
        className="w-full rounded-lg border border-gray-200 bg-white px-4 py-2.5 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
      >
        <option value="">Все города</option>
        {regionCities
          .sort((a, b) => a.name.localeCompare(b.name, 'ru-RU'))
          .map((city) => (
            <option key={city.id} value={city.id}>
              {city.name}
            </option>
          ))}
      </select>
    </div>
  );
}

