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
          if (nextFilters.view === "favorites") {
              const favoriteIds = listOverride?.favorites ?? favorites;
              params.set("ids", favoriteIds.join(","));
          }
          if (nextFilters.view === "claimed") {
            const claimedIds = listOverride?.claimed ?? claimed;
            params.set("ids", claimedIds.join(","));
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

  const handleFilterChange = (updates: Partial<FilterState>) => {
    setFilters((prev) => {
      const next = { ...prev, ...updates };
      fetchDiscounts(next);
      return next;
    });
  };

  const handleResetFilters = () => {
    const defaults = { ...DEFAULT_FILTERS, view: filters.view };
    setFilters(defaults);
    fetchDiscounts(defaults);
  };

  const handlePushToggle = async () => {
    try {
      setError(null);
      if (!pushEnabled) {
        const granted = await requestPushPermission();
        if (!granted) {
          setError("Разрешите отправку уведомлений в браузере");
          return;
        }
        await syncPushSubscription();
      }

      const response = await fetch("/api/discounts/preferences", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          pushEnabled: !pushEnabled,
          filters: {
            cityId: filters.cityId,
            categoryIds: filters.categoryIds,
            premiumOnly: filters.premiumOnly,
            radiusKm: filters.radiusKm,
          },
        }),
      });

      if (!response.ok) {
        throw new Error("Не удалось обновить настройки");
      }

      setPushEnabled(!pushEnabled);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка включения уведомлений");
    }
  };

  const handleUseGeolocation = async () => {
    if (!geoSupport) {
      setError("Ваш браузер не поддерживает геолокацию.");
      return;
    }

    try {
      setIsLoading(true);
      const position = await getCurrentPosition();
      const response = await fetch("/api/discounts?nearMe=1&radiusKm=" + filters.radiusKm + `&lat=${position.coords.latitude}&lng=${position.coords.longitude}`);
      if (!response.ok) {
        throw new Error("Не удалось получить ближайшие скидки");
      }
      const payload = (await response.json()) as DiscountSearchResult;
      setData(payload);
      setFilters((prev) => ({
        ...prev,
        nearMe: true,
        search: "",
        cityId: null,
      }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось получить геолокацию");
    } finally {
      setIsLoading(false);
    }
  };

  const handleTabChange = (view: ViewMode) => {
    handleFilterChange({ view, page: 1 });
  };

  const handleFavoriteToggle = (id: number) => {
    setFavorites((prev) => {
      const next = prev.includes(id) ? prev.filter((fav) => fav !== id) : [...prev, id];
      persistPreference({ favorites: next });
      if (filters.view === "favorites") {
        fetchDiscounts({ ...filters, page: 1 }, { favorites: next });
      }
      return next;
    });
  };

  const handleClaim = (id: number) => {
    setClaimed((prev) => {
      if (prev.includes(id)) return prev;
      const next = [...prev, id];
      persistPreference({ claimed: next });
      if (filters.view === "claimed") {
        fetchDiscounts({ ...filters, page: 1 }, { claimed: next });
      }
      return next;
    });
  };

  const persistPreference = useCallback(
    async (overrides: Partial<Record<"favorites" | "claimed", number[]>>) => {
      try {
        await fetch("/api/discounts/preferences", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            pushEnabled,
            filters: {
              ...filters,
              favorites: overrides.favorites ?? favorites,
              claimed: overrides.claimed ?? claimed,
            },
          }),
        });
      } catch (err) {
        console.error("[discounts] Failed to persist preference", err);
      }
    },
    [filters, favorites, claimed, pushEnabled]
  );

  const totalItems = data.meta?.total ?? data.discounts.length;
  const perPage = data.meta?.perPage ?? (data.discounts.length || 1);
  const totalPages = Math.max(1, Math.ceil(totalItems / perPage));
  const pageStart = (filters.page - 1) * perPage + 1;
  const pageEnd = Math.min(totalItems, pageStart + perPage - 1);

  return (
    <div className="space-y-6 overflow-hidden">
      <div className="rounded-xl border border-gray-200 bg-white p-4 sm:p-6 shadow-sm dark:border-gray-800 dark:bg-gray-900 overflow-hidden">
        <div className="grid gap-4 lg:grid-cols-[1fr,auto,auto] overflow-hidden">
          <div className="rounded-2xl border border-gray-100 bg-gray-50/70 p-4 dark:border-gray-800/50 dark:bg-gray-800/40">
            <p className="text-sm font-semibold uppercase tracking-wide text-blue-600 dark:text-blue-300">
              Фильтры и уведомления
            </p>
            <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
              Сохраняйте подборки, подписывайтесь на уведомления и не пропускайте новые предложения.
            </p>
          </div>
          <label className="flex items-center gap-3 rounded-2xl border border-gray-100 bg-gray-50/70 px-4 py-3 text-sm font-medium text-gray-700 dark:border-gray-800/50 dark:bg-gray-800/40 dark:text-gray-300">
            <input
              type="checkbox"
              checked={pushEnabled}
              onChange={handlePushToggle}
              className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            />
            Уведомлять о новых скидках
          </label>
          <button
            type="button"
            onClick={handleResetFilters}
            disabled={!hasActiveFilters}
            className="inline-flex items-center justify-center gap-2 rounded-2xl border border-gray-200 bg-white px-5 py-3 text-sm font-semibold text-blue-600 shadow-sm transition hover:border-blue-300 hover:text-blue-700 disabled:border-gray-200 disabled:text-gray-400 dark:border-gray-700 dark:bg-gray-900"
          >
            <svg className="h-4 w-4" viewBox="0 0 20 20" fill="none" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 4l12 12M16 4L4 16" />
            </svg>
            Сбросить фильтры
          </button>
        </div>

        <Tabs view={filters.view} onChange={handleTabChange} favorites={favorites.length} claimed={claimed.length} />

        <div className="mt-4 space-y-4">
          <div className="grid gap-4 lg:grid-cols-2">
            <SearchPanel filters={filters} onChange={handleFilterChange} />
            <CityPanel
              filters={filters}
              cities={data.cities}
              geoAvailable={geoSupport}
              onLocate={handleUseGeolocation}
              onChange={handleFilterChange}
            />
          </div>
          <CategoryPanel
            categories={data.categories}
            selected={filters.categoryIds}
            onChange={(categoryIds) => handleFilterChange({ categoryIds, page: 1 })}
          />
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-200">
          {error}
        </div>
      )}

      <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-800 dark:bg-gray-900">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div className="text-sm text-gray-500 dark:text-gray-400">
            {pageStart}-{pageEnd} из {totalItems}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => handleFilterChange({ page: Math.max(1, filters.page - 1) })}
              disabled={filters.page === 1}
              className="rounded-full border border-gray-200 p-2 text-gray-500 transition hover:text-blue-600 disabled:opacity-50 dark:border-gray-700 dark:text-gray-400"
            >
              <svg className="h-4 w-4" viewBox="0 0 20 20" fill="none" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 15L7 10l5-5" />
              </svg>
            </button>
            <span className="text-sm font-medium text-gray-600 dark:text-gray-300">{filters.page} / {totalPages}</span>
            <button
              onClick={() => handleFilterChange({ page: Math.min(totalPages, filters.page + 1) })}
              disabled={filters.page >= totalPages}
              className="rounded-full border border-gray-200 p-2 text-gray-500 transition hover:text-blue-600 disabled:opacity-50 dark:border-gray-700 dark:text-gray-400"
            >
              <svg className="h-4 w-4" viewBox="0 0 20 20" fill="none" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 5l5 5-5 5" />
              </svg>
            </button>
          </div>
        </div>

        {isLoading ? (
          <div className="grid place-items-center rounded-2xl border border-dashed border-gray-200 p-12 text-gray-500 dark:border-gray-800 dark:text-gray-400">
            Загрузка актуальных предложений…
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

function SearchPanel({ filters, onChange }: { filters: FilterState; onChange: (updates: Partial<FilterState>) => void }) {
  return (
    <div className="rounded-2xl border border-gray-100 bg-gray-50/70 p-4 dark:border-gray-800/50 dark:bg-gray-800/40">
      <label className="text-sm font-semibold text-gray-700 dark:text-gray-300">Поиск</label>
      <input
        type="text"
        value={filters.search}
        onChange={(event) => onChange({ search: event.target.value, page: 1 })}
        placeholder="Например, доставка еды или Skyeng"
        className="mt-2 w-full rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm text-gray-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-blue-500 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
      />
    </div>
  );
}

function CityPanel({
  filters,
  cities,
  geoAvailable,
  onLocate,
  onChange,
}: {
  filters: FilterState;
  cities: DiscountSearchResult["cities"];
  geoAvailable: boolean;
  onLocate: () => void;
  onChange: (updates: Partial<FilterState>) => void;
}) {
  return (
    <div className="rounded-lg border border-gray-100 bg-gray-50/70 p-4 dark:border-gray-800/50 dark:bg-gray-800/40">
      <label className="text-sm font-semibold text-gray-700 dark:text-gray-300">Город</label>
      <select
        value={filters.cityId ?? ""}
        onChange={(event) =>
          onChange({
            cityId: event.target.value ? Number(event.target.value) : null,
            nearMe: false,
            page: 1,
          })
        }
        className="mt-2 w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-blue-500 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
      >
        <option value="">Все города</option>
        {cities.map((city) => (
          <option key={city.id} value={city.id}>
            {city.name} {city.count ? `(${city.count})` : ""}
          </option>
        ))}
      </select>
      <button
        type="button"
        onClick={onLocate}
        disabled={!geoAvailable}
        className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-blue-300 bg-white px-3 py-2 text-sm font-medium text-blue-600 transition hover:border-blue-400 hover:text-blue-700 disabled:border-gray-200 disabled:text-gray-400 dark:bg-gray-900"
      >
        <svg className="h-4 w-4" viewBox="0 0 20 20" fill="none" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M10 2.5v1.8M10 15.7v1.8M3.5 10h1.8m9.4 0h1.8M5.6 5.6l1.3 1.3m6.2 6.2l1.3 1.3M5.6 14.4l1.3-1.3m6.2-6.2l1.3-1.3" />
          <circle cx="10" cy="10" r="3.5" strokeWidth={1.5} />
        </svg>
        {geoAvailable ? "Найти рядом" : "Геолокация недоступна"}
      </button>
    </div>
  );
}

function CategoryPanel({
  categories,
  selected,
  onChange,
}: {
  categories: DiscountSearchResult["categories"];
  selected: number[];
  onChange: (categoryIds: number[]) => void;
}) {
  const [scrollPos, setScrollPos] = useState(0);
  const containerId = "discount-categories-scroll";

  useEffect(() => {
    const el = document.getElementById(containerId);
    if (!el) return;
    const handleScroll = () => {
      setScrollPos(el.scrollLeft);
    };
    el.addEventListener("scroll", handleScroll);
    return () => el.removeEventListener("scroll", handleScroll);
  }, []);

  const scrollBy = (delta: number) => {
    const el = document.getElementById(containerId);
    if (!el) return;
    el.scrollBy({ left: delta, behavior: "smooth" });
  };

  const isActive = (id: number) => selected.includes(id);

  return (
    <div className="rounded-lg border border-gray-100 bg-gray-50/70 p-4 dark:border-gray-800/50 dark:bg-gray-800/40">
      <label className="text-sm font-semibold text-gray-700 dark:text-gray-300">Категории</label>
      <div className="relative mt-3">
        {scrollPos > 8 && (
          <button
            type="button"
            onClick={() => scrollBy(-200)}
            className="absolute left-0 top-1/2 z-10 -translate-y-1/2 rounded-full bg-white/90 p-1.5 shadow hover:bg-white dark:bg-gray-900/90"
          >
            <svg className="h-3 w-3 text-gray-600" viewBox="0 0 20 20" fill="none" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 15L7 10l5-5" />
            </svg>
          </button>
        )}
        <div
          id={containerId}
          className="flex gap-2 overflow-x-auto scroll-smooth pr-3 pl-8"
        >
          {categories.map((category) => (
            <button
              key={category.id}
              type="button"
              onClick={() => {
                const nextCategories = isActive(category.id)
                  ? selected.filter((id) => id !== category.id)
                  : [...selected, category.id];
                onChange(nextCategories);
              }}
              className={clsx(
                "shrink-0 rounded-full border px-4 py-2 text-xs font-semibold transition",
                isActive(category.id)
                  ? "border-blue-500 bg-blue-50 text-blue-700 dark:border-blue-400 dark:bg-blue-500/10 dark:text-blue-200"
                  : "border-gray-200 bg-white text-gray-600 hover:border-blue-300 hover:text-blue-700 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300"
              )}
            >
              {category.name}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={() => scrollBy(200)}
          className="absolute right-0 top-1/2 z-10 -translate-y-1/2 rounded-full bg-white/90 p-1.5 shadow hover:bg-white dark:bg-gray-900/90"
        >
          <svg className="h-3 w-3 text-gray-600" viewBox="0 0 20 20" fill="none" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 5l5 5-5 5" />
          </svg>
        </button>
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
    <div className="mt-6 flex gap-2 overflow-x-auto">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          onClick={() => onChange(tab.id)}
          className={clsx(
            "inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold transition shadow-sm",
            view === tab.id
              ? "bg-blue-600 text-white"
              : "bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
          )}
        >
          {tab.label}
          {typeof tab.count === "number" && (
            <span className="rounded-full bg-white/20 px-2 py-0.5 text-xs text-white dark:bg-gray-900/40">
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
      <div className="rounded-2xl border border-dashed border-gray-200 bg-white p-10 text-center text-gray-500 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-400">
        К сожалению, по выбранным фильтрам пока нет предложений. Попробуйте расширить поиск.
      </div>
    );
  }

  return (
    <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-2 overflow-hidden">
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

