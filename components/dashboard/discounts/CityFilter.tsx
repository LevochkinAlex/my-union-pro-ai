"use client";

import { useState, useMemo } from "react";
import { RUSSIAN_REGIONS, getRegionByCity } from "@/lib/constants/russian-regions";
import type { DiscountCity } from "@/types/discounts";

interface CityFilterProps {
  cities: DiscountCity[];
  value: number | null;
  onChange: (cityId: number | null) => void;
}

export default function CityFilter({ cities, value, onChange }: CityFilterProps) {
  const [selectedCountry, setSelectedCountry] = useState<string>("russia"); // Дефолт: Россия
  const [selectedRegion, setSelectedRegion] = useState<string>("all");

  // Группируем ВСЕ города по регионам для анализа
  const citiesAnalysis = useMemo(() => {
    const russianCities: DiscountCity[] = [];
    const otherCities: DiscountCity[] = [];
    const regionMap = new Map<string, DiscountCity[]>();

    cities.forEach(city => {
      const region = getRegionByCity(city.name);
      if (region) {
        // Российский город - добавляем в его регион
        russianCities.push(city);
        if (!regionMap.has(region.id)) {
          regionMap.set(region.id, []);
        }
        regionMap.get(region.id)!.push(city);
      } else {
        // Неизвестный город - возможно из другой страны
        otherCities.push(city);
      }
    });

    // Сортируем города в каждом регионе
    regionMap.forEach((cityList) => {
      cityList.sort((a, b) => a.name.localeCompare(b.name, 'ru-RU'));
    });
    otherCities.sort((a, b) => a.name.localeCompare(b.name, 'ru-RU'));

    return {
      russianCities,
      otherCities,
      regionMap,
      hasOtherCountries: otherCities.length > 0
    };
  }, [cities]);

  // Получаем регионы, в которых есть города
  const availableRegions = useMemo(() => {
    return RUSSIAN_REGIONS.filter(region => 
      citiesAnalysis.regionMap.has(region.id)
    );
  }, [citiesAnalysis]);

  // Фильтруем города по выбранной стране и региону
  const filteredCities = useMemo(() => {
    // Фильтр по стране
    let citiesByCountry: DiscountCity[];
    if (selectedCountry === "russia") {
      citiesByCountry = citiesAnalysis.russianCities;
    } else if (selectedCountry === "other") {
      citiesByCountry = citiesAnalysis.otherCities;
    } else {
      // "all" - все города
      citiesByCountry = cities;
    }

    // Фильтр по региону (только для России)
    if (selectedCountry === "russia" && selectedRegion !== "all") {
      return citiesAnalysis.regionMap.get(selectedRegion) || [];
    }

    return citiesByCountry;
  }, [selectedCountry, selectedRegion, citiesAnalysis, cities]);

  const handleCountryChange = (country: string) => {
    setSelectedCountry(country);
    setSelectedRegion("all");
    onChange(null);
  };

  const handleRegionChange = (regionId: string) => {
    setSelectedRegion(regionId);
    onChange(null);
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
        <option value="all">Все страны ({cities.length})</option>
        <option value="russia">Россия ({citiesAnalysis.russianCities.length})</option>
        {citiesAnalysis.hasOtherCountries && (
          <option value="other">Другие страны ({citiesAnalysis.otherCities.length})</option>
        )}
      </select>

      {/* Регион (показываем только для России) */}
      <select
        value={selectedRegion}
        onChange={(e) => handleRegionChange(e.target.value)}
        disabled={selectedCountry !== "russia"}
        className="w-full rounded-lg border border-gray-200 bg-white px-4 py-2.5 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
      >
        <option value="all">
          {selectedCountry === "russia" ? `Все регионы` : "Выберите Россию"}
        </option>
        {selectedCountry === "russia" && availableRegions.map((region) => {
          const cityCount = citiesAnalysis.regionMap.get(region.id)?.length || 0;
          return (
            <option key={region.id} value={region.id}>
              {region.name} ({cityCount})
            </option>
          );
        })}
      </select>

      {/* Город */}
      <select
        value={value ?? ""}
        onChange={(e) => handleCityChange(e.target.value)}
        className="w-full rounded-lg border border-gray-200 bg-white px-4 py-2.5 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
      >
        <option value="">Все города</option>
        {filteredCities.map((city) => (
          <option key={city.id} value={city.id}>
            {city.name}
          </option>
        ))}
      </select>
    </div>
  );
}

