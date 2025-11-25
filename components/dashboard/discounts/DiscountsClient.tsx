"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import DiscountCard from "./DiscountCard";
import CityFilter from "./CityFilter";
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
  const [allDiscounts, setAllDiscounts] = useState(initialData.discounts);
  const [hasMore, setHasMore] = useState(
    initialData.meta.hasMore ?? 
    (initialData.meta.total ? initialData.discounts.length < initialData.meta.total : initialData.discounts.length >= 20)
  );
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pushEnabled, setPushEnabled] = useState<boolean>(
    Boolean(initialPreference.pushEnabled)
  );
  const [geoSupport, setGeoSupport] = useState(false);
  const [favorites, setFavorites] = useState<number[]>(() => {
    return ((initialPreference.filters as any)?.favorites as number[] | undefined) ?? [];
  });
  const [claimed, setClaimed] = useState<number[]>(() => {
    const claimedData = (initialPreference.filters as any)?.claimed;
    if (!Array.isArray(claimedData)) return [];
    
    // Extract IDs from objects or numbers
    return claimedData.map((item: any) => 
      typeof item === 'object' && item.id ? item.id : item
    ).filter(Boolean);
  });
  const [isSyncing, setIsSyncing] = useState(false);
  const [isGettingLocation, setIsGettingLocation] = useState(false);
  const [searchInput, setSearchInput] = useState(filters.search); // Локальное состояние для поля ввода
  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Синхронизируем searchInput с filters.search (при сбросе фильтров)
  useEffect(() => {
    setSearchInput(filters.search);
  }, [filters.search]);

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

  // Синхронизация активированных скидок с BestBenefits при загрузке
  useEffect(() => {
    const syncWithBestBenefits = async () => {
      if (isSyncing) return;
      
      setIsSyncing(true);
      try {
        // Используем менеджер синхронизации с кэшированием
        const { syncManager } = await import("@/lib/sync-manager");
        const result = await syncManager.sync(); // Не форсируем, используем кэш
        
        if (result.success && !result.cached) {
          console.log("[DiscountsClient] Synced with BestBenefits:", result);
          
          // Reload preferences to get updated claimed discounts
          const prefsResponse = await fetch("/api/discounts/preferences");
          if (prefsResponse.ok) {
            const prefsData = await prefsResponse.json();
            const claimedItems = (prefsData.filters?.claimed || [])
              .map((item: any) => (typeof item === 'object' ? item.id : item));
            setClaimed(claimedItems);
          }
        } else if (result.cached) {
          console.log("[DiscountsClient] ⏭️ Using cached sync result");
        }
      } catch (error) {
        console.warn("[DiscountsClient] Failed to sync with BestBenefits:", error);
      } finally {
        setIsSyncing(false);
      }
    };
    
    syncWithBestBenefits();
  }, []); // Run once on mount

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
          console.error("[DiscountsClient] ❌ Проблема: API вернул total > 0, но discounts пустой!", {
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
      // Save to local preferences AND activate on BestBenefits
      await fetch("/api/discounts/activate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          discountId,
          claimed: nextClaimed,
          favorites,
        }),
      });
      
      if (filters.view === "claimed") {
        fetchDiscounts(filters, { favorites, claimed: nextClaimed });
      }
    } catch (error) {
      console.error("Failed to activate discount", error);
      // Don't revert UI - user can still access discount via link
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
      console.log("[DiscountsClient] ✅ Geolocation received:", {
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
      
      console.error("[DiscountsClient] ❌ Geolocation error:", {
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
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        // Дополнительная проверка перед вызовом loadMore
        if (
          entries[0].isIntersecting && 
          hasMore && 
          !isLoadingMore && 
          !isLoading &&
          !isLoadingMoreRef.current
        ) {
          console.log("[DiscountsClient] IntersectionObserver triggered, calling loadMore");
          loadMore();
        } else if (entries[0].isIntersecting) {
          console.log("[DiscountsClient] IntersectionObserver triggered but conditions not met:", { hasMore, isLoadingMore, isLoading, isLoadingMoreRef: isLoadingMoreRef.current });
        }
      },
      { 
        threshold: 0.1, // Увеличиваем threshold чтобы не срабатывать слишком рано
        rootMargin: '200px' // Уменьшаем rootMargin чтобы избежать преждевременных срабатываний
      }
    );

    const sentinel = document.getElementById('scroll-sentinel');
    if (sentinel) {
      observer.observe(sentinel);
    }

    return () => {
      if (sentinel) {
        observer.unobserve(sentinel);
      }
      // Очищаем timeout при размонтировании
      if (loadMoreTimeoutRef.current) {
        clearTimeout(loadMoreTimeoutRef.current);
      }
    };
  }, [hasMore, isLoadingMore, isLoading, loadMore]);

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
        {/* Row 1: Search */}
        <div className="relative">
          <input
            type="text"
            placeholder="Поиск по скидкам..."
            value={searchInput}
            onChange={(e) => {
              const value = e.target.value;
              setSearchInput(value); // Обновляем локальное состояние немедленно
              
              // Отменяем предыдущий таймер
              if (searchTimeoutRef.current) {
                clearTimeout(searchTimeoutRef.current);
              }
              
              // Устанавливаем новый таймер для debounce (500ms)
              searchTimeoutRef.current = setTimeout(() => {
                updateFilters({ search: value, page: 1 });
              }, 500);
            }}
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

        {/* Row 2: City Filter (Country → Region → City) */}
        <CityFilter
          cities={data.cities}
          value={filters.cityId}
          onChange={(cityId) =>
            updateFilters({
              cityId,
              nearMe: false,
              page: 1,
            })
          }
        />

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
              disabled={isGettingLocation || isLoading}
              className={clsx(
                "inline-flex items-center gap-2 rounded-lg border px-4 py-2 text-sm font-medium transition",
                isGettingLocation || isLoading
                  ? "cursor-not-allowed border-gray-300 bg-gray-100 text-gray-400 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-500"
                  : "border-gray-200 bg-white text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600"
              )}
            >
              {isGettingLocation ? (
                <>
                  <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Определение...
                </>
              ) : (
                <>
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                  Найти рядом
                </>
              )}
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
        {/* Info Bar */}
        {allDiscounts.length > 0 && (
          <div className="flex items-center justify-between text-sm text-gray-600 dark:text-gray-400">
            <p>
              Показано <span className="font-semibold text-gray-900 dark:text-white">{allDiscounts.length}</span> {hasMore && 'из доступных'}
            </p>
          </div>
        )}

        {/* Grid */}
        {isLoading && allDiscounts.length === 0 ? (
          <div className="flex min-h-[400px] items-center justify-center rounded-lg border border-dashed border-gray-200 bg-gray-50 text-gray-500 dark:border-gray-700 dark:bg-gray-800/50 dark:text-gray-400">
            Загрузка...
          </div>
        ) : (
          <>
            <DiscountGrid
              discounts={allDiscounts}
              favorites={favorites}
              claimed={claimed}
              onFavorite={handleFavoriteToggle}
              onClaim={handleClaim}
              selectedCityId={filters.cityId}
            />
            
            {/* Sentinel для бесконечного скролла */}
            {hasMore && (
              <div id="scroll-sentinel" className="flex justify-center py-8">
                {isLoadingMore && (
                  <div className="text-center text-gray-500 dark:text-gray-400">
                    <div className="inline-block h-6 w-6 animate-spin rounded-full border-2 border-solid border-blue-500 border-r-transparent"></div>
                    <p className="mt-2 text-sm">Загрузка ещё...</p>
                  </div>
                )}
              </div>
            )}
          </>
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
      <div className="flex min-h-[300px] items-center justify-center rounded-lg border border-dashed border-gray-200 bg-gray-50 text-center text-gray-500 dark:border-gray-700 dark:bg-gray-800/50 dark:text-gray-400">
        <div>
          <p className="text-lg font-medium">Нет предложений</p>
          <p className="mt-1 text-sm">Попробуйте изменить фильтры</p>
        </div>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-4 sm:gap-6 md:grid-cols-2 lg:grid-cols-3 pb-20">
      {discounts.map((discount) => (
        <DiscountCard
          key={discount.id}
          discount={discount}
          isFavorite={favorites.includes(discount.id)}
          isClaimed={claimed.includes(discount.id)}
          onToggleFavorite={onFavorite}
          onClaim={onClaim}
          forceShowImage
          selectedCityId={selectedCityId}
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
        console.log("[getCurrentPosition] ✅ Position received:", {
          lat: position.coords.latitude,
          lng: position.coords.longitude,
          accuracy: position.coords.accuracy,
          timestamp: new Date(position.timestamp).toISOString()
        });
        resolve(position);
      },
      (error) => {
        console.error("[getCurrentPosition] ❌ Error:", {
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
