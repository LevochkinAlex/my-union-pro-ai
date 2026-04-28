"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import DiscountCard from "./DiscountCard";
import CityFilter from "./CityFilter";
import { mapPartnerVenuesToDiscountItems } from "@/lib/partner-venue-discount-mapper";
import type {
  DiscountItem,
  DiscountPreferenceResponse,
  DiscountSearchResult,
} from "@/types/discounts";
import { requestPushPermission, syncPushSubscription } from "@/lib/firebase-push-notifications";
import { useAutoSyncDiscounts } from "@/hooks/useAutoSyncDiscounts";
import { Card, Tabs, Spinner, EmptyState } from "@/components/ui";
import type { Tab } from "@/components/ui";
import clsx from "clsx";

interface DiscountsClientProps {
  initialData: DiscountSearchResult;
  initialPreference: DiscountPreferenceResponse;
  /** Название города из профиля — для отображения, когда выбран город */
  preferredCityName?: string;
  /** Площадки партнёров с SSR (см. `fetchPartnerVenuesForDiscountCatalog`) */
  initialPartnerVenues?: DiscountItem[];
}

type FilterState = {
  search: string;
  cityId: number | null;
  categoryIds: number[];
  premiumOnly: boolean;
  nearMe: boolean;
  radiusKm: number;
  lat: number | null;
  lng: number | null;
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
  lat: null,
  lng: null,
  page: 1,
  view: "all",
};

export default function DiscountsClient({
  initialData,
  initialPreference,
  preferredCityName,
  initialPartnerVenues,
}: DiscountsClientProps) {
  // Защита от некорректных данных
  const safeInitialData: DiscountSearchResult = initialData || {
    discounts: [],
    categories: [],
    cities: [],
    meta: {
      total: 0,
      page: 1,
      perPage: 20,
      hasMore: false,
    },
    source: "fallback",
    fetchedAt: new Date().toISOString(),
  };

  const safeInitialPreference = initialPreference || {
    pushEnabled: false,
    filters: {},
    geolocation: null,
    updatedAt: null,
  };

  const [filters, setFilters] = useState<FilterState>({
    ...DEFAULT_FILTERS,
    ...(safeInitialPreference.filters && {
      cityId: safeInitialPreference.filters.cityId ?? null,
      categoryIds: safeInitialPreference.filters.categoryIds ?? [],
      premiumOnly: safeInitialPreference.filters.premiumOnly ?? false,
      radiusKm: safeInitialPreference.filters.radiusKm ?? 25,
      view: (safeInitialPreference.filters.view as ViewMode | undefined) ?? "all",
    }),
  });
  const [data, setData] = useState<DiscountSearchResult>(safeInitialData);
  const [allDiscounts, setAllDiscounts] = useState(safeInitialData.discounts || []);
  const [hasMore, setHasMore] = useState(
    safeInitialData.meta?.hasMore ?? 
    (safeInitialData.meta?.total ? (safeInitialData.discounts?.length || 0) < safeInitialData.meta.total : (safeInitialData.discounts?.length || 0) >= 20)
  );
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pushEnabled, setPushEnabled] = useState<boolean>(
    Boolean(safeInitialPreference.pushEnabled)
  );
  const [geoSupport, setGeoSupport] = useState(false);
  const [favorites, setFavorites] = useState<number[]>(() => {
    return ((safeInitialPreference.filters as any)?.favorites as number[] | undefined) ?? [];
  });
  const [claimed, setClaimed] = useState<number[]>(() => {
    const claimedData = (safeInitialPreference.filters as any)?.claimed;
    if (!Array.isArray(claimedData)) return [];
    
    // Extract IDs from objects or numbers
    return claimedData.map((item: any) => 
      typeof item === 'object' && item.id ? item.id : item
    ).filter(Boolean);
  });
  const [isGettingLocation, setIsGettingLocation] = useState(false);
  const [searchInput, setSearchInput] = useState(filters.search);
  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const [partnerVenues, setPartnerVenues] = useState<DiscountItem[]>(
    () => initialPartnerVenues ?? []
  );

  /** Пропускаем дублирующий клиентский fetch, если список уже пришёл с SSR и строка поиска пуста */
  const skipNextPartnerVenuesFetchRef = useRef(
    Boolean(initialPartnerVenues?.length && !filters.search)
  );

  // Синхронизируем searchInput с filters.search (при сбросе фильтров)
  useEffect(() => {
    setSearchInput(filters.search);
  }, [filters.search]);

  // Загрузка площадок партнёров (отдельная БД, не BestBenefits). При SSR `initialPartnerVenues` первый запрос не дублируем.
  useEffect(() => {
    if (skipNextPartnerVenuesFetchRef.current) {
      skipNextPartnerVenuesFetchRef.current = false;
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const params = new URLSearchParams({ limit: "50" });
        if (filters.search) params.set("search", filters.search);
        const res = await fetch(`/api/partner-venues/public?${params}`);
        if (!res.ok || cancelled) return;
        const json = await res.json();
        const venues = mapPartnerVenuesToDiscountItems(json.venues ?? []);
        if (!cancelled) setPartnerVenues(venues);
      } catch (e) {
        console.warn("[DiscountsClient] Failed to load partner venues:", e);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [filters.search]);

  // Автоматическая синхронизация с BestBenefits
  const { isSyncing: isAutoSyncing, forceSync } = useAutoSyncDiscounts({
    autoSyncOnMount: true,
    syncOnFocus: true,
    onSyncComplete: async (result) => {
      console.log("[DiscountsClient] Auto-sync completed:", result);
      
      // Обновляем список claimed после успешной синхронизации
      try {
        const prefsResponse = await fetch("/api/discounts/preferences");
        if (prefsResponse.ok) {
          const prefsData = await prefsResponse.json();
          const claimedItems = (prefsData.filters?.claimed || [])
            .map((item: any) => (typeof item === 'object' ? item.id : item))
            .filter(Boolean);
          setClaimed(claimedItems);
        }
      } catch (error) {
        console.warn("[DiscountsClient] Failed to update claimed after sync:", error);
      }
    },
    onSyncError: (error) => {
      console.warn("[DiscountsClient] Auto-sync error:", error);
    },
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
    async (nextFilters: FilterState = filters, listOverride?: { favorites?: number[]; claimed?: number[] }, append = false) => {
      if (append) {
        setIsLoadingMore(true);
      } else {
        setIsLoading(true);
      }
      setError(null);

      try {
        const params = new URLSearchParams();
        
        // При поиске НЕ добавляем cityId в параметры запроса
        const isSearching = nextFilters.search && nextFilters.search.trim().length > 0;
        
        if (nextFilters.search) params.set("search", nextFilters.search);
        if (!isSearching && nextFilters.cityId) params.set("cityId", String(nextFilters.cityId));
        if (nextFilters.categoryIds.length > 0) params.set("categoryIds", nextFilters.categoryIds.join(","));
        if (nextFilters.premiumOnly) params.set("premiumOnly", "1");
        params.set("page", String(nextFilters.page));
        params.set("limit", "20"); // Загружаем по 20 за раз для бесконечного скролла
        
        // Логируем параметры поиска
        console.log("[DiscountsClient] Поиск с параметрами:", {
          search: nextFilters.search,
          cityId: nextFilters.cityId,
          cityIdInRequest: !isSearching && nextFilters.cityId ? nextFilters.cityId : null,
          isSearching: isSearching,
          categoryIds: nextFilters.categoryIds,
          page: nextFilters.page,
          url: `/api/discounts?${params.toString()}`
        });
        if (nextFilters.view && nextFilters.view !== "all") {
          params.set("view", nextFilters.view);
          const favList = listOverride?.favorites ?? favorites;
          const claimedList = listOverride?.claimed ?? claimed;
          if (nextFilters.view === "favorites") {
            // Если список избранного пустой, не передаем ids (вернется пустой результат)
            if (favList.length > 0) {
              params.set("ids", favList.join(","));
            } else {
              // Если избранное пустое, возвращаем пустой результат сразу
              setAllDiscounts([]);
              setHasMore(false);
              setIsLoading(false);
              setIsLoadingMore(false);
              return;
            }
          }
          if (nextFilters.view === "claimed") {
            // Если список полученных пустой, не передаем ids
            if (claimedList.length > 0) {
              params.set("ids", claimedList.join(","));
            } else {
              // Если полученные пустые, возвращаем пустой результат сразу
              setAllDiscounts([]);
              setHasMore(false);
              setIsLoading(false);
              setIsLoadingMore(false);
              return;
            }
          }
        }
        if (nextFilters.nearMe && nextFilters.cityId === null) {
          params.set("nearMe", "1");
          params.set("radiusKm", String(nextFilters.radiusKm));
          if (nextFilters.lat !== null) params.set("lat", String(nextFilters.lat));
          if (nextFilters.lng !== null) params.set("lng", String(nextFilters.lng));
        }

        const response = await fetch(`/api/discounts?${params.toString()}`);
        if (!response.ok) {
          throw new Error("Не удалось загрузить скидки");
        }

        const payload = (await response.json()) as DiscountSearchResult;
        
        // Логируем полученные результаты
        console.log("[DiscountsClient] Получены результаты:", {
          search: nextFilters.search,
          found: payload.discounts.length,
          total: payload.meta.total,
          hasMore: payload.meta.hasMore,
          page: payload.meta.page,
          source: payload.source,
          cities: payload.cities?.length,
          categories: payload.categories?.length
        });
        
        // Если поиск вернул результаты, но discounts пустой - логируем проблему
        if (nextFilters.search && payload.meta.total > 0 && payload.discounts.length === 0) {
          console.error("[DiscountsClient] Проблема: API вернул total > 0, но discounts пустой!", {
            total: payload.meta.total,
            discounts: payload.discounts,
            meta: payload.meta
          });
        }
        
        // Логируем первую скидку для отладки
        if (payload.discounts.length > 0 && nextFilters.search) {
          console.log("[DiscountsClient] Первая найденная скидка:", {
            id: payload.discounts[0].id,
            title: payload.discounts[0].title,
            cities: payload.discounts[0].cities,
            mainCategory: payload.discounts[0].mainCategory
          });
        }
        
        setData(payload);
        
        if (append) {
          // Добавляем новые скидки к существующим и обновляем hasMore
          setAllDiscounts(prev => {
            const updated = [...prev, ...payload.discounts];
            const totalLoaded = updated.length;
            
            // Используем hasMore из API, если он есть
            if (payload.meta.hasMore !== undefined) {
              setHasMore(payload.meta.hasMore);
            } else if (payload.meta.total !== undefined) {
              // Если есть total, проверяем, загружены ли все
              setHasMore(totalLoaded < payload.meta.total);
            } else {
              // Для избранного и полученных: если мы загрузили все IDs, то больше нет данных
              if (nextFilters.view === "favorites" || nextFilters.view === "claimed") {
                const listToCheck = nextFilters.view === "favorites" 
                  ? (listOverride?.favorites ?? favorites)
                  : (listOverride?.claimed ?? claimed);
                // Если загружено столько же или больше, чем IDs, то больше нет данных
                const newHasMore = totalLoaded < listToCheck.length;
                console.log("[DiscountsClient] Setting hasMore for filtered view:", { view: nextFilters.view, totalLoaded, listLength: listToCheck.length, hasMore: newHasMore });
                setHasMore(newHasMore);
              } else {
                // Для обычного просмотра: проверяем, пришло ли полное количество (20)
                const newHasMore = payload.discounts.length >= 20;
                console.log("[DiscountsClient] Setting hasMore for all view:", { discountsLength: payload.discounts.length, hasMore: newHasMore });
                setHasMore(newHasMore);
              }
            }
            
            return updated;
          });
        } else {
          // Заменяем все скидки и обновляем hasMore
          setAllDiscounts(payload.discounts);
          const totalLoaded = payload.discounts.length;
          
          // Используем hasMore из API, если он есть
          if (payload.meta.hasMore !== undefined) {
            setHasMore(payload.meta.hasMore);
          } else if (payload.meta.total !== undefined) {
            // Если есть total, проверяем, загружены ли все
            setHasMore(totalLoaded < payload.meta.total);
          } else {
            // Для избранного и полученных: если мы загрузили все IDs, то больше нет данных
            if (nextFilters.view === "favorites" || nextFilters.view === "claimed") {
              const listToCheck = nextFilters.view === "favorites" 
                ? (listOverride?.favorites ?? favorites)
                : (listOverride?.claimed ?? claimed);
              // Если загружено столько же, сколько IDs, то больше нет данных
              setHasMore(totalLoaded < listToCheck.length);
            } else {
              // Для обычного просмотра: проверяем, пришло ли полное количество (20)
              setHasMore(payload.discounts.length >= 20);
            }
          }
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Ошибка загрузки");
      } finally {
        setIsLoading(false);
        setIsLoadingMore(false);
      }
    },
    [filters, favorites, claimed]
  );

  // Автоматически применяем фильтр по городу при загрузке, если cityId установлен
  const hasAppliedCityFilterRef = useRef(false);
  useEffect(() => {
    // Применяем фильтр только один раз при загрузке
    if (hasAppliedCityFilterRef.current) return;
    
    // Если cityId установлен в filters (из initialPreference), применяем фильтр
    if (filters.cityId !== null && !filters.search) {
      console.log(`[DiscountsClient] 🏙️ Auto-applying city filter: cityId=${filters.cityId}`);
      hasAppliedCityFilterRef.current = true;
      // Применяем фильтр (вызываем fetchDiscounts)
      fetchDiscounts(filters, undefined, false);
    } else {
      hasAppliedCityFilterRef.current = true; // Помечаем что проверили, даже если фильтр не нужен
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Только при первой загрузке

  // Ref для отслеживания, идет ли уже загрузка (защита от повторных вызовов)
  const isLoadingMoreRef = useRef(false);
  const loadMoreTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  
  // Загрузка следующей страницы для бесконечного скролла
  const loadMore = useCallback(() => {
    // Проверяем все условия, включая ref
    if (isLoadingMoreRef.current || isLoadingMore || !hasMore || isLoading) {
      console.log("[DiscountsClient] loadMore skipped:", { isLoadingMoreRef: isLoadingMoreRef.current, isLoadingMore, hasMore, isLoading });
      return;
    }
    
    // Очищаем предыдущий timeout, если он есть
    if (loadMoreTimeoutRef.current) {
      clearTimeout(loadMoreTimeoutRef.current);
    }
    
    // Debounce: задержка 150ms перед загрузкой (уменьшено для более быстрой загрузки)
    loadMoreTimeoutRef.current = setTimeout(() => {
      // Повторная проверка после debounce
      if (isLoadingMoreRef.current || isLoadingMore || !hasMore || isLoading) {
        console.log("[DiscountsClient] loadMore debounced check failed:", { isLoadingMoreRef: isLoadingMoreRef.current, isLoadingMore, hasMore, isLoading });
        return;
      }
      
      console.log("[DiscountsClient] Starting loadMore, page:", filters.page + 1);
      
      // Сохраняем позицию скролла относительно последнего элемента
      const sentinel = document.getElementById('scroll-sentinel');
      const sentinelTop = sentinel ? sentinel.getBoundingClientRect().top + window.scrollY : 0;
      const scrollPosition = window.scrollY;
      const scrollHeight = document.documentElement.scrollHeight;
      
      // Устанавливаем флаг загрузки
      isLoadingMoreRef.current = true;
      
      const nextPage = filters.page + 1;
      const nextFilters = { ...filters, page: nextPage };
      
      // Обновляем filters сразу, чтобы избежать рассинхронизации
      setFilters(nextFilters);
      
      // Вызываем fetchDiscounts с append=true для добавления к существующим скидкам
      fetchDiscounts(nextFilters, undefined, true).then(() => {
        // Проверяем hasMore перед сбросом флага - может быть обновлен в fetchDiscounts
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            const newScrollHeight = document.documentElement.scrollHeight;
            const heightDiff = newScrollHeight - scrollHeight;
            
            // Восстанавливаем позицию относительно sentinel элемента
            if (sentinel) {
              const newSentinelTop = sentinel.getBoundingClientRect().top + window.scrollY;
              const sentinelDiff = newSentinelTop - sentinelTop;
              
              // Корректируем позицию с учетом смещения sentinel
              window.scrollTo({
                top: scrollPosition + sentinelDiff,
                behavior: 'auto' as ScrollBehavior
              });
            } else if (heightDiff > 0) {
              // Fallback: используем разницу высоты
              window.scrollTo({
                top: scrollPosition + heightDiff,
                behavior: 'auto' as ScrollBehavior
              });
            }
            
            // Сбрасываем флаг после завершения загрузки
            isLoadingMoreRef.current = false;
          });
        });
      }).catch(() => {
        // В случае ошибки тоже сбрасываем флаг
        isLoadingMoreRef.current = false;
      });
    }, 300);
  }, [filters, isLoadingMore, hasMore, isLoading, fetchDiscounts]);

  const updateFilters = (updates: Partial<FilterState>) => {
    // При поиске сбрасываем фильтр по городу, чтобы показать все результаты
    const isSearching = updates.search !== undefined && updates.search.trim().length > 0;
    const next = { 
      ...filters, 
      ...updates, 
      page: 1, // Сбрасываем на первую страницу
      // Сбрасываем cityId при поиске, чтобы не фильтровать результаты
      ...(isSearching ? { cityId: null } : {})
    };
    
    console.log("[updateFilters] Обновление фильтров:", {
      isSearching,
      searchValue: updates.search,
      oldCityId: filters.cityId,
      newCityId: next.cityId,
      willResetCity: isSearching
    });
    
    setFilters(next);
    setAllDiscounts([]); // Очищаем накопленные скидки
    isLoadingMoreRef.current = false; // Сбрасываем флаг загрузки при изменении фильтров
    setIsLoadingMore(false); // Явно сбрасываем state загрузки
    fetchDiscounts(next, undefined, false);
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
      const response = await fetch("/api/discounts/activate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          discountId,
          claimed: nextClaimed,
          favorites,
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (data.demoBlocked) {
        setClaimed(claimed);
        setError(data.message ?? "В демо-режиме активация скидок недоступна.");
        setTimeout(() => setError(null), 5000);
        return;
      }
      if (!response.ok) {
        setClaimed(claimed);
        return;
      }
      if (filters.view === "claimed") {
        fetchDiscounts(filters, { favorites, claimed: nextClaimed });
      }
    } catch (error) {
      console.error("Failed to activate discount", error);
      setClaimed(claimed);
    }
  };

  const handleUseGeolocation = async () => {
    // Проверяем поддержку геолокации
    if (!navigator.geolocation) {
      setError("Ваш браузер не поддерживает геолокацию.");
      setTimeout(() => setError(null), 5000);
      return;
    }

    setIsGettingLocation(true);
    setError(null);

    try {
      console.log("[DiscountsClient] 🗺️ Requesting geolocation...");
      const position = await getCurrentPosition();
      console.log("[DiscountsClient] Geolocation received:", {
        lat: position.coords.latitude,
        lng: position.coords.longitude,
        accuracy: position.coords.accuracy
      });
      
      const nextFilters = {
        ...filters,
        nearMe: true,
        cityId: null,
        page: 1,
        lat: position.coords.latitude,
        lng: position.coords.longitude,
        radiusKm: filters.radiusKm || 25,
      };
      setFilters(nextFilters);
      await fetchDiscounts(nextFilters);
      persistPreference(nextFilters);
    } catch (error: any) {
      // Обрабатываем разные типы ошибок геолокации
      let errorMessage = "Не удалось определить местоположение.";
      
      if (error.code !== undefined) {
        switch (error.code) {
          case 1: // PERMISSION_DENIED
            errorMessage = "Вы запретили доступ к геолокации. Разрешите доступ в настройках браузера и обновите страницу.";
            break;
          case 2: // POSITION_UNAVAILABLE
            errorMessage = "Не удалось определить местоположение. Проверьте подключение к интернету и GPS.";
            break;
          case 3: // TIMEOUT
            errorMessage = "Время ожидания истекло. Попробуйте еще раз.";
            break;
        }
      } else if (error.message) {
        errorMessage = error.message;
      }
      
      console.error("[DiscountsClient] Geolocation error:", {
        code: error.code,
        message: error.message,
        error: error
      });
      
      setError(errorMessage);
      setTimeout(() => setError(null), 8000);
    } finally {
      setIsGettingLocation(false);
    }
  };

  const handleTabChange = async (view: ViewMode) => {
    // Явно сбрасываем флаги загрузки при смене вкладки
    isLoadingMoreRef.current = false;
    setIsLoadingMore(false);
    
    // При переключении вкладок загружаем актуальные preferences
    if (view === "favorites" || view === "claimed") {
      try {
        const prefsResponse = await fetch("/api/discounts/preferences");
        if (prefsResponse.ok) {
          const prefsData = await prefsResponse.json();
          const favList = (prefsData.filters?.favorites || [])
            .map((item: any) => typeof item === 'object' ? item.id : item)
            .filter(Boolean);
          const claimedList = (prefsData.filters?.claimed || [])
            .map((item: any) => typeof item === 'object' ? item.id : item)
            .filter(Boolean);
          
          setFavorites(favList);
          setClaimed(claimedList);
          
          // Обновляем фильтры с актуальными списками
          const nextFilters = { 
            ...filters,
            view, 
            page: 1,
            search: "",
            cityId: null,
            categoryIds: [],
            premiumOnly: false,
            nearMe: false,
          };
          setFilters(nextFilters);
          setAllDiscounts([]);
          await fetchDiscounts(nextFilters, { favorites: favList, claimed: claimedList }, false);
          persistPreference(nextFilters);
          return;
        }
      } catch (error) {
        console.error("Failed to load preferences:", error);
      }
    }
    
    // Если не favorites/claimed или не удалось загрузить preferences, используем стандартное обновление
    updateFilters({ 
      view, 
      page: 1,
      search: "",
      cityId: null,
      categoryIds: [],
      premiumOnly: false,
      nearMe: false,
    });
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

  // IntersectionObserver для бесконечного скролла
  useEffect(() => {
    // Не создаем observer, если уже идет загрузка или нет больше данных
    if (isLoadingMore || isLoading || !hasMore) {
      console.log("[DiscountsClient] Observer not created:", { isLoadingMore, isLoading, hasMore });
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (!entry) return;
        
        // Дополнительная проверка перед вызовом loadMore
        if (
          entry.isIntersecting && 
          hasMore && 
          !isLoadingMore && 
          !isLoading &&
          !isLoadingMoreRef.current
        ) {
          console.log("[DiscountsClient] IntersectionObserver triggered, calling loadMore");
          loadMore();
        } else if (entry.isIntersecting) {
          console.log("[DiscountsClient] IntersectionObserver triggered but conditions not met:", { 
            hasMore, 
            isLoadingMore, 
            isLoading, 
            isLoadingMoreRef: isLoadingMoreRef.current,
            intersectionRatio: entry.intersectionRatio
          });
        }
      },
      { 
        threshold: 0.01, // Уменьшаем threshold для более раннего срабатывания
        rootMargin: '100px' // Увеличиваем rootMargin для более раннего срабатывания
      }
    );

    // Используем setTimeout чтобы убедиться что DOM обновлен
    const timeoutId = setTimeout(() => {
      const sentinel = document.getElementById('scroll-sentinel');
      if (sentinel) {
        console.log("[DiscountsClient] Observer attached to sentinel");
        observer.observe(sentinel);
      } else {
        console.warn("[DiscountsClient] Sentinel element not found!");
      }
    }, 100);

    return () => {
      clearTimeout(timeoutId);
      const sentinel = document.getElementById('scroll-sentinel');
      if (sentinel) {
        observer.unobserve(sentinel);
      }
      // Очищаем timeout при размонтировании
      if (loadMoreTimeoutRef.current) {
        clearTimeout(loadMoreTimeoutRef.current);
      }
    };
  }, [hasMore, isLoadingMore, isLoading, loadMore, allDiscounts.length]);

  const discountTabs: Tab[] = useMemo(() => [
    { id: "all", label: "Все" },
    { id: "claimed", label: "Мои", count: claimed.length },
    { id: "favorites", label: "Избранное", count: favorites.length },
  ], [claimed.length, favorites.length]);

  return (
    <div className="space-y-4">
      {/* Toolbar: tabs + search + city + actions — all in one compact strip */}
      <Card padding="sm" className="sm:p-4">
        {/* Row 1: Tabs + actions (right) */}
        <div className="flex flex-wrap items-center gap-2">
          <Tabs
            tabs={discountTabs}
            activeTab={filters.view}
            onChange={(id) => handleTabChange(id as ViewMode)}
            className="border-0"
          />

          <div className="ml-auto flex items-center gap-2">
            {geoSupport && (
              <button
                onClick={handleUseGeolocation}
                disabled={isGettingLocation || isLoading}
                title="Найти рядом"
                className={clsx(
                  "inline-flex items-center justify-center rounded-lg border p-2 text-sm transition",
                  isGettingLocation || isLoading
                    ? "cursor-not-allowed border-gray-300 bg-gray-100 text-gray-400 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-500"
                    : "border-gray-200 bg-white text-gray-600 hover:bg-gray-50 hover:text-blue-600 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-400 dark:hover:bg-gray-600 dark:hover:text-blue-400"
                )}
              >
                {isGettingLocation ? (
                  <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                ) : (
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                )}
              </button>
            )}

            <label
              title="Уведомления о новых скидках"
              className={clsx(
                "inline-flex cursor-pointer items-center justify-center rounded-lg border p-2 transition",
                pushEnabled
                  ? "border-blue-300 bg-blue-50 text-blue-600 dark:border-blue-600 dark:bg-blue-900/30 dark:text-blue-400"
                  : "border-gray-200 bg-white text-gray-600 hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-400 dark:hover:bg-gray-600"
              )}
            >
              <input
                type="checkbox"
                checked={pushEnabled}
                onChange={handleTogglePush}
                aria-label="Уведомления о новых скидках"
                className="sr-only"
              />
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
              </svg>
            </label>

            {hasActiveFilters && (
              <button
                onClick={handleResetFilters}
                title="Сбросить фильтры"
                className="inline-flex items-center justify-center rounded-lg border border-gray-200 bg-white p-2 text-gray-500 transition hover:bg-gray-50 hover:text-red-500 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-400 dark:hover:bg-gray-600 dark:hover:text-red-400"
              >
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            )}
          </div>
        </div>

        {/* Row 2: Search + City (inline) */}
        <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <input
              type="text"
              placeholder="Поиск по скидкам..."
              value={searchInput}
              onChange={(e) => {
                const value = e.target.value;
                setSearchInput(value);
                if (searchTimeoutRef.current) {
                  clearTimeout(searchTimeoutRef.current);
                }
                searchTimeoutRef.current = setTimeout(() => {
                  updateFilters({ search: value, page: 1 });
                }, 500);
              }}
              className="w-full rounded-lg border border-gray-200 bg-white py-2 pl-9 pr-3 text-sm text-gray-900 placeholder-gray-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:border-gray-600 dark:bg-gray-700 dark:text-white dark:placeholder-gray-400"
            />
            <svg
              className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </div>

          <div className="sm:w-72 lg:w-80">
            <CityFilter
              cities={data.cities || []}
              value={filters.cityId}
              onChange={(cityId) =>
                updateFilters({
                  cityId,
                  nearMe: false,
                  page: 1,
                })
              }
            />
          </div>
        </div>

      </Card>

      {/* Error */}
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-400">
          {error}
        </div>
      )}

      {/* Results */}
      <div>
        {/* Info Bar — compact inline */}
        {(allDiscounts.length > 0 || partnerVenues.length > 0) && (
          <p className="mb-3 text-xs text-gray-500 dark:text-gray-400">
            Показано <span className="font-semibold text-gray-700 dark:text-gray-200">{allDiscounts.length + (filters.view === "all" ? partnerVenues.length : 0)}</span>{hasMore ? ' из доступных' : ''}
          </p>
        )}

        {/* Grid */}
        {isLoading && allDiscounts.length === 0 ? (
          <Spinner size="lg" fullPage />
        ) : (
          <>
            <DiscountGrid
              discounts={filters.view === "all" ? [...partnerVenues, ...allDiscounts] : allDiscounts}
              favorites={favorites}
              claimed={claimed}
              onFavorite={handleFavoriteToggle}
              onClaim={handleClaim}
              selectedCityId={filters.cityId}
            />
            
            {/* Sentinel для бесконечного скролла - ВСЕГДА создаем элемент, даже если hasMore=false, чтобы observer мог работать */}
            <div id="scroll-sentinel" className="flex flex-col items-center justify-center py-8 min-h-[100px]">
              {isLoadingMore && (
                <div className="text-center">
                  <Spinner size="sm" className="mx-auto" />
                  <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">Загрузка ещё...</p>
                </div>
              )}
              {!hasMore && allDiscounts.length > 0 && (
                <p className="text-center text-sm text-gray-400 dark:text-gray-500">
                  Все скидки загружены
                </p>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function DiscountGrid({
  discounts,
  favorites,
  claimed,
  onFavorite,
  onClaim,
  selectedCityId,
}: {
  discounts: any[];
  favorites: number[];
  claimed: number[];
  onFavorite: (id: number) => void;
  onClaim: (id: number) => void;
  selectedCityId?: number | null;
}) {
  if (discounts.length === 0) {
    return (
      <EmptyState
        title="Нет предложений"
        description="Попробуйте изменить фильтры"
        className="min-h-[300px]"
      />
    );
  }

  return (
    <div className="grid grid-cols-1 gap-4 sm:gap-6 md:grid-cols-2 lg:grid-cols-3 pb-20">
      {discounts.map((discount, index) => (
        <DiscountCard
          key={discount.isPartnerVenue ? `pv-${discount.partnerVenueId}` : discount.id}
          discount={discount}
          isFavorite={!discount.isPartnerVenue && favorites.includes(discount.id)}
          isClaimed={!discount.isPartnerVenue && claimed.includes(discount.id)}
          onToggleFavorite={discount.isPartnerVenue ? undefined : onFavorite}
          onClaim={discount.isPartnerVenue ? undefined : onClaim}
          forceShowImage
          selectedCityId={selectedCityId}
          hidePromoCode
          eagerBanner={index < 9}
        />
      ))}
    </div>
  );
}

function getCurrentPosition(): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) => {
    if (!("geolocation" in navigator)) {
      reject(new Error("Геолокация недоступна в вашем браузере"));
      return;
    }
    
    navigator.geolocation.getCurrentPosition(
      (position) => {
        console.log("[getCurrentPosition] Position received:", {
          lat: position.coords.latitude,
          lng: position.coords.longitude,
          accuracy: position.coords.accuracy,
          timestamp: new Date(position.timestamp).toISOString()
        });
        resolve(position);
      },
      (error) => {
        console.error("[getCurrentPosition] Error:", {
          code: error.code,
          message: error.message
        });
        reject(error);
      },
      {
        enableHighAccuracy: true, // Используем высокую точность для лучших результатов
        timeout: 15000, // Увеличиваем timeout до 15 секунд
        maximumAge: 60000, // Кэшируем позицию максимум 1 минуту
      }
    );
  });
}
