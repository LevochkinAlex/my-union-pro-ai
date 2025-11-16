"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import DiscountCard from "./DiscountCard";
import type {
  DiscountPreferenceResponse,
  DiscountSearchResult,
  DiscountCategory,
} from "@/types/discounts";
import { requestPushPermission, syncPushSubscription } from "@/lib/firebase-push-notifications";
import clsx from "clsx";

interface DiscountsClientProps {
  initialData: DiscountSearchResult;
  initialPreference: DiscountPreferenceResponse;
}

type FilterState = {
  search: string;
  cityId: number | null;
  categoryIds: number[];
  premiumOnly: boolean;
  nearMe: boolean;
  radiusKm: number;
  page: number;
  view: ViewMode;
};

type ViewMode = "all" | "claimed" | "favorites";

const DEFAULT_FILTERS: FilterState = {
  search: "",
  cityId: null,
  categoryIds: [],
  premiumOnly: false,
  nearMe: false,
  radiusKm: 25,
  page: 1,
  view: "all",
};

export default function DiscountsClient({
  initialData,
  initialPreference,
}: DiscountsClientProps) {
  const [filters, setFilters] = useState<FilterState>({
    ...DEFAULT_FILTERS,
    ...(initialPreference.filters && {
      cityId: initialPreference.filters.cityId ?? null,
      categoryIds: initialPreference.filters.categoryIds ?? [],
      premiumOnly: initialPreference.filters.premiumOnly ?? false,
      radiusKm: initialPreference.filters.radiusKm ?? 25,
      view: (initialPreference.filters.view as ViewMode | undefined) ?? "all",
    }),
  });
  const [data, setData] = useState<DiscountSearchResult>(initialData);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pushEnabled, setPushEnabled] = useState<boolean>(
    Boolean(initialPreference.pushEnabled)
  );
  const [geoSupport, setGeoSupport] = useState(false);
  const [favorites, setFavorites] = useState<number[]>(() => {
    return ((initialPreference.filters as any)?.favorites as number[] | undefined) ?? [];
  });
  const [claimed, setClaimed] = useState<number[]>(() => {
    return ((initialPreference.filters as any)?.claimed as number[] | undefined) ?? [];
  });

  const hasActiveFilters = useMemo(() => {
    return (
      filters.search.trim().length > 0 ||
      filters.cityId !== null ||
      filters.categoryIds.length > 0 ||
      filters.premiumOnly ||
      filters.nearMe ||
      filters.view !== "all"
    );
  }, [filters]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    setGeoSupport("geolocation" in navigator);
  }, []);

  const fetchDiscounts = useCallback(
    async (nextFilters: FilterState = filters, listOverride?: { favorites?: number[]; claimed?: number[] }) => {
      setIsLoading(true);
      setError(null);

      try {
        const params = new URLSearchParams();
        if (nextFilters.search) params.set("search", nextFilters.search);
        if (nextFilters.cityId) params.set("cityId", String(nextFilters.cityId));
        if (nextFilters.categoryIds.length > 0) params.set("categoryIds", nextFilters.categoryIds.join(","));
        if (nextFilters.premiumOnly) params.set("premiumOnly", "1");
        if (nextFilters.page) params.set("page", String(nextFilters.page));
        if (nextFilters.view && nextFilters.view !== "all") {
          params.set("view", nextFilters.view);
          const favList = listOverride?.favorites ?? favorites;
          const claimedList = listOverride?.claimed ?? claimed;
          if (nextFilters.view === "favorites") {
            params.set("ids", favList.join(","));
          }
          if (nextFilters.view === "claimed") {
            params.set("ids", claimedList.join(","));
          }
        }
        if (nextFilters.nearMe && nextFilters.cityId === null) {
          params.set("nearMe", "1");
          params.set("radiusKm", String(nextFilters.radiusKm));
        }

        const response = await fetch(`/api/discounts?${params.toString()}`);
        if (!response.ok) {
          throw new Error("Не удалось загрузить скидки");
        }

        const payload = (await response.json()) as DiscountSearchResult;
        setData(payload);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Ошибка загрузки");
      } finally {
        setIsLoading(false);
      }
    },
    [filters, favorites, claimed]
  );

  const updateFilters = (updates: Partial<FilterState>) => {
    const next = { ...filters, ...updates };
    setFilters(next);
    fetchDiscounts(next);
    persistPreference(next);
  };

  const handleResetFilters = () => {
    const defaults: FilterState = {
      ...DEFAULT_FILTERS,
      view: "all" as ViewMode,
    };
    setFilters(defaults);
    fetchDiscounts(defaults);
  };

  const handleTogglePush = async () => {
    if (!pushEnabled) {
      try {
        const allowed = await requestPushPermission();
        if (allowed) {
          await syncPushSubscription();
          setPushEnabled(true);
          await fetch("/api/discounts/preferences", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ pushEnabled: true }),
          });
        }
      } catch (error) {
        console.error("Failed to enable push", error);
      }
    } else {
      setPushEnabled(false);
      await fetch("/api/discounts/preferences", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pushEnabled: false }),
      });
    }
  };

  const handleFavoriteToggle = async (discountId: number) => {
    const nextFavorites = favorites.includes(discountId)
      ? favorites.filter((id) => id !== discountId)
      : [...favorites, discountId];
    setFavorites(nextFavorites);

    try {
      await fetch("/api/discounts/preferences", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          filters: {
            favorites: nextFavorites,
            claimed,
          },
        }),
      });
      if (filters.view === "favorites") {
        fetchDiscounts(filters, { favorites: nextFavorites, claimed });
      }
    } catch (error) {
      console.error("Failed to update favorites", error);
    }
  };

  const handleClaim = async (discountId: number) => {
    if (claimed.includes(discountId)) return;
    const nextClaimed = [...claimed, discountId];
    setClaimed(nextClaimed);

    try {
      await fetch("/api/discounts/preferences", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          filters: {
            favorites,
            claimed: nextClaimed,
          },
        }),
      });
      if (filters.view === "claimed") {
        fetchDiscounts(filters, { favorites, claimed: nextClaimed });
      }
    } catch (error) {
      console.error("Failed to update claimed", error);
    }
  };

  const handleUseGeolocation = async () => {
    try {
      const position = await getCurrentPosition();
      updateFilters({
        nearMe: true,
        cityId: null,
        page: 1,
      });
    } catch (error) {
      alert("Не удалось определить местоположение");
    }
  };

  const handleTabChange = (view: ViewMode) => {
    updateFilters({ view, page: 1 });
  };

  const persistPreference = useCallback(
    async (nextFilters: FilterState) => {
      try {
        await fetch("/api/discounts/preferences", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            filters: {
              cityId: nextFilters.cityId,
              categoryIds: nextFilters.categoryIds,
              premiumOnly: nextFilters.premiumOnly,
              radiusKm: nextFilters.radiusKm,
              view: nextFilters.view,
              favorites,
              claimed,
            },
          }),
        });
      } catch (err) {
        console.error("[discounts] Failed to persist preference", err);
      }
    },
    [favorites, claimed]
  );

  const totalItems = data.meta?.total ?? data.discounts.length;
  const perPage = data.meta?.perPage ?? (data.discounts.length || 1);
  const totalPages = Math.max(1, Math.ceil(totalItems / perPage));
  const pageStart = (filters.page - 1) * perPage + 1;
  const pageEnd = Math.min(totalItems, pageStart + perPage - 1);

  return (
    <div className="space-y-6">
      {/* Tabs */}
      <Tabs
        view={filters.view}
        onChange={handleTabChange}
        favorites={favorites.length}
        claimed={claimed.length}
      />

      {/* Filters */}
      <div className="space-y-4 rounded-xl border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-800 sm:p-6">
        {/* Row 1: Search + City */}
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="relative">
            <input
              type="text"
              placeholder="Поиск по скидкам..."
              value={filters.search}
              onChange={(e) => updateFilters({ search: e.target.value, page: 1 })}
              className="w-full rounded-lg border border-gray-200 bg-white px-4 py-2.5 pl-10 text-sm text-gray-900 placeholder-gray-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:border-gray-600 dark:bg-gray-700 dark:text-white dark:placeholder-gray-400"
            />
            <svg
              className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </div>

          <select
            value={filters.cityId ?? ""}
            onChange={(e) =>
              updateFilters({
                cityId: e.target.value ? Number(e.target.value) : null,
                nearMe: false,
                page: 1,
              })
            }
            className="w-full rounded-lg border border-gray-200 bg-white px-4 py-2.5 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
          >
            <option value="">Все города</option>
            {data.cities.map((city) => (
              <option key={city.id} value={city.id}>
                {city.name}
              </option>
            ))}
          </select>
        </div>

        {/* Row 2: Categories */}
        {data.categories.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {data.categories.map((cat) => {
              const isActive = filters.categoryIds.includes(cat.id);
              return (
                <button
                  key={cat.id}
                  onClick={() => {
                    const next = isActive
                      ? filters.categoryIds.filter((id) => id !== cat.id)
                      : [...filters.categoryIds, cat.id];
                    updateFilters({ categoryIds: next, page: 1 });
                  }}
                  className={clsx(
                    "inline-flex items-center rounded-full px-3 py-1.5 text-xs font-medium transition",
                    isActive
                      ? "bg-blue-600 text-white"
                      : "bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600"
                  )}
                >
                  {cat.name}
                </button>
              );
            })}
          </div>
        )}

        {/* Row 3: Actions */}
        <div className="flex flex-wrap items-center gap-3">
          {geoSupport && (
            <button
              onClick={handleUseGeolocation}
              className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600"
            >
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              Найти рядом
            </button>
          )}

          <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600">
            <input
              type="checkbox"
              checked={pushEnabled}
              onChange={handleTogglePush}
              className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-2 focus:ring-blue-500 dark:border-gray-500 dark:bg-gray-600"
            />
            Уведомления
          </label>

          {hasActiveFilters && (
            <button
              onClick={handleResetFilters}
              className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600"
            >
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
              Сбросить
            </button>
          )}
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-400">
          {error}
        </div>
      )}

      {/* Results */}
      <div className="space-y-4">
        {/* Pagination Header */}
        <div className="flex items-center justify-between">
          <div className="text-sm text-gray-500 dark:text-gray-400">
            {totalItems > 0 ? `${pageStart}-${pageEnd} из ${totalItems}` : "Нет результатов"}
          </div>
          {totalPages > 1 && (
            <div className="flex items-center gap-2">
              <button
                onClick={() => updateFilters({ page: Math.max(1, filters.page - 1) })}
                disabled={filters.page === 1}
                className="rounded-lg border border-gray-200 p-2 text-gray-500 transition hover:bg-gray-50 disabled:opacity-30 dark:border-gray-600 dark:text-gray-400 dark:hover:bg-gray-700"
              >
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
              </button>
              <span className="text-sm font-medium text-gray-600 dark:text-gray-300">
                {filters.page} / {totalPages}
              </span>
              <button
                onClick={() => updateFilters({ page: Math.min(totalPages, filters.page + 1) })}
                disabled={filters.page >= totalPages}
                className="rounded-lg border border-gray-200 p-2 text-gray-500 transition hover:bg-gray-50 disabled:opacity-30 dark:border-gray-600 dark:text-gray-400 dark:hover:bg-gray-700"
              >
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </button>
            </div>
          )}
        </div>

        {/* Grid */}
        {isLoading ? (
          <div className="flex min-h-[400px] items-center justify-center rounded-lg border border-dashed border-gray-200 bg-gray-50 text-gray-500 dark:border-gray-700 dark:bg-gray-800/50 dark:text-gray-400">
            Загрузка...
          </div>
        ) : (
          <DiscountGrid
            data={data}
            favorites={favorites}
            claimed={claimed}
            onFavorite={handleFavoriteToggle}
            onClaim={handleClaim}
          />
        )}
      </div>
    </div>
  );
}

function Tabs({
  view,
  onChange,
  favorites,
  claimed,
}: {
  view: ViewMode;
  onChange: (view: ViewMode) => void;
  favorites: number;
  claimed: number;
}) {
  const tabs: { id: ViewMode; label: string; count?: number }[] = [
    { id: "all", label: "Все" },
    { id: "claimed", label: "Полученные", count: claimed },
    { id: "favorites", label: "Избранное", count: favorites },
  ];

  return (
    <div className="flex gap-2 overflow-x-auto">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          onClick={() => onChange(tab.id)}
          className={clsx(
            "inline-flex items-center gap-2 whitespace-nowrap rounded-full px-4 py-2 text-sm font-semibold transition",
            view === tab.id
              ? "bg-blue-600 text-white shadow-sm"
              : "bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600"
          )}
        >
          {tab.label}
          {typeof tab.count === "number" && tab.count > 0 && (
            <span className="rounded-full bg-white/20 px-2 py-0.5 text-xs dark:bg-black/20">
              {tab.count}
            </span>
          )}
        </button>
      ))}
    </div>
  );
}

function DiscountGrid({
  data,
  favorites,
  claimed,
  onFavorite,
  onClaim,
}: {
  data: DiscountSearchResult;
  favorites: number[];
  claimed: number[];
  onFavorite: (id: number) => void;
  onClaim: (id: number) => void;
}) {
  if (data.discounts.length === 0) {
    return (
      <div className="flex min-h-[300px] items-center justify-center rounded-lg border border-dashed border-gray-200 bg-gray-50 text-center text-gray-500 dark:border-gray-700 dark:bg-gray-800/50 dark:text-gray-400">
        <div>
          <p className="text-lg font-medium">Нет предложений</p>
          <p className="mt-1 text-sm">Попробуйте изменить фильтры</p>
        </div>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
      {data.discounts.map((discount) => (
        <DiscountCard
          key={discount.id}
          discount={discount}
          isFavorite={favorites.includes(discount.id)}
          isClaimed={claimed.includes(discount.id)}
          onToggleFavorite={onFavorite}
          onClaim={onClaim}
          forceShowImage
        />
      ))}
    </div>
  );
}

function getCurrentPosition(): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) => {
    if (!("geolocation" in navigator)) {
      reject(new Error("Геолокация недоступна"));
      return;
    }
    navigator.geolocation.getCurrentPosition(resolve, reject, {
      enableHighAccuracy: false,
      timeout: 10000,
      maximumAge: 300000,
    });
  });
}
