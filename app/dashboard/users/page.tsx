"use client";

import { useEffect, useState, Suspense, useCallback, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import CreatePost from "@/components/posts/CreatePost";
import { useMembershipAccess } from "@/hooks/useMembershipAccess";
import PostFeed from "@/components/posts/PostFeed";
import SearchForm from "@/components/dashboard/users/SearchForm";
import UsersList from "@/components/dashboard/users/UsersList";
import MobileDrawer from "@/components/dashboard/users/MobileDrawer";
import { MembershipGate } from "@/components/MembershipGate";

interface User {
  id: string;
  firstName: string | null;
  lastName: string | null;
  middleName: string | null;
  email: string;
  avatarUrl: string | null;
  phone: string | null;
  jobTitle: string | null;
  profession: string | null;
  createdAt: Date | string;
  organization: {
    id: string;
    name: string;
  } | null;
}


// Обертка для Suspense и проверки членства
export default function UsersPage() {
  const router = useRouter();
  const { status } = useMembershipAccess();

  // Исключённый: редирект на главную, доступ к Профсети закрыт
  useEffect(() => {
    if (status === "excluded") {
      router.replace("/dashboard");
    }
  }, [status, router]);

  if (status === "excluded") {
    return null;
  }

  return (
    <MembershipGate
      showBlur={true}
      title="Профсеть для членов профсоюза"
      description="Общайтесь с коллегами и находите единомышленников. Станьте членом профсоюза для доступа."
    >
      <Suspense
        fallback={
          <div className="flex items-center justify-center min-h-screen">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
          </div>
        }
      >
        <UsersPageContent />
      </Suspense>
    </MembershipGate>
  );
}

function UsersPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { data: session } = useSession();
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [total, setTotal] = useState(0);
  const [refreshKey, setRefreshKey] = useState(0);
  const [showUsersPanel, setShowUsersPanel] = useState(false);
  const observerTarget = useRef<HTMLDivElement>(null);
  const isLoadingRef = useRef(false);

  // Инициализация из URL параметров
  useEffect(() => {
    const searchParam = searchParams.get("search");
    if (searchParam) setSearch(searchParam);
  }, [searchParams]);

  const handlePostCreated = useCallback(() => {
    setRefreshKey((prev) => prev + 1);
  }, []);

  // Загрузка пользователей
  const loadUsers = useCallback(async (pageNum: number = 1, append: boolean = false) => {
    // Предотвращаем дублирующие запросы
    if (isLoadingRef.current) return;
    
    if (append) {
      setLoadingMore(true);
    } else {
    setLoading(true);
    }
    isLoadingRef.current = true;

    try {
      const params = new URLSearchParams();
      if (search) params.append("search", search);
      params.append("page", pageNum.toString());
      params.append("limit", "10"); // Загружаем по 10 пользователей

      const startTime = performance.now();
      const response = await fetch(`/api/users?${params.toString()}`, {
        cache: "no-store",
      });
      const loadTime = performance.now() - startTime;

      if (loadTime > 1000) {
        console.warn(`[Users] Slow API call: ${loadTime.toFixed(0)}ms`);
      }

      if (!response.ok) {
        throw new Error("Не удалось загрузить пользователей");
      }

      const data = await response.json();
      const newUsers = data.users || [];
      
      if (append) {
        // Добавляем новых пользователей к существующим
        setUsers(prev => [...prev, ...newUsers]);
      } else {
        // Заменяем список пользователей
        setUsers(newUsers);
      }
      
      setTotal(data.total || 0);
      setHasMore(newUsers.length === 10 && (pageNum * 10) < (data.total || 0));

      // Обновляем URL без перезагрузки страницы
      const newParams = new URLSearchParams();
      if (search) newParams.append("search", search);
      router.replace(`/dashboard/users?${newParams.toString()}`, {
        scroll: false,
      });
    } catch (error) {
      console.error("Error loading users:", error);
    } finally {
      setLoading(false);
      setLoadingMore(false);
      isLoadingRef.current = false;
    }
  }, [search, router]);

  // Загружаем пользователей при монтировании и при изменении поиска
  useEffect(() => {
    setPage(1);
    setUsers([]);
    setHasMore(true);
    loadUsers(1, false);
  }, [search]);

  // Infinite scroll observer
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore && !loading && !loadingMore && !isLoadingRef.current) {
          const nextPage = page + 1;
          setPage(nextPage);
          loadUsers(nextPage, true);
        }
      },
      { threshold: 0.1 }
    );

    const currentTarget = observerTarget.current;
    if (currentTarget) {
      observer.observe(currentTarget);
    }

    return () => {
      if (currentTarget) {
        observer.unobserve(currentTarget);
      }
    };
  }, [hasMore, loading, loadingMore, page, loadUsers]);

  const handleSearch = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      setPage(1);
      setUsers([]);
      setHasMore(true);
      loadUsers(1, false);
    },
    [loadUsers]
  );

  const formatUserCount = (count: number) => {
    if (count === 1) return "участник";
    if (count < 5) return "участника";
    return "участников";
  };

  return (
    <div className="space-y-4 lg:space-y-6">
      {/* Мобильная версия: Кнопка для открытия панели коллег */}
      <div className="lg:hidden">
        <button
          onClick={() => setShowUsersPanel(!showUsersPanel)}
          className="w-full flex items-center justify-between bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm p-4 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
        >
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
              <svg
                className="h-5 w-5 text-blue-600 dark:text-blue-400"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z"
                />
              </svg>
            </div>
            <div className="text-left">
              <h2 className="text-base font-semibold text-gray-900 dark:text-white">
                Профсеть
              </h2>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                {total > 0
                  ? `Найдено: ${total} ${formatUserCount(total)}`
                  : "Найти коллег"}
              </p>
            </div>
          </div>
          <svg
            className={`h-5 w-5 text-gray-400 transition-transform ${
              showUsersPanel ? "rotate-180" : ""
            }`}
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
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[32%_68%] gap-4 lg:gap-6">
        {/* Левая колонка: Профсеть */}
        <div
          className={`flex flex-col gap-4 lg:gap-6 w-full h-fit ${
            showUsersPanel ? "flex" : "hidden lg:flex"
          }`}
        >
          {/* Заголовок */}
          <div>
            <h1 className="text-2xl lg:text-3xl font-bold text-gray-900 dark:text-white">
              Коллеги профсоюза
            </h1>
            <p className="mt-1 lg:mt-2 text-sm lg:text-base text-gray-600 dark:text-gray-400">
              Найдите и свяжитесь с другими членами профсоюза
            </p>
          </div>

          {/* Поиск */}
          <SearchForm
            search={search}
            onSearchChange={setSearch}
            total={total}
            onSubmit={handleSearch}
          />

          {/* Список пользователей */}
          <UsersList
            users={users}
            loading={loading}
            loadingMore={loadingMore}
            hasMore={hasMore}
            observerTarget={observerTarget}
          />
        </div>

        {/* Правая колонка: Лента постов */}
        <div className="space-y-4 lg:space-y-6 order-first lg:order-last h-fit flex flex-col">
          {/* Форма создания поста */}
          {session && (
            <div className="w-full max-w-2xl">
              <CreatePost onPostCreated={handlePostCreated} compact={true} />
            </div>
          )}

          {/* Лента постов */}
          <div className="w-full max-w-2xl">
            <h2 className="text-base lg:text-lg font-semibold text-gray-900 dark:text-white mb-4">
              Свежие посты
            </h2>
            <Suspense
              fallback={
                <div className="animate-pulse bg-gray-200 dark:bg-gray-700 rounded-lg h-32"></div>
              }
            >
              <PostFeed key={refreshKey} limit={5} />
            </Suspense>
          </div>
        </div>
      </div>

      {/* Мобильный drawer для панели коллег */}
      <MobileDrawer
        isOpen={showUsersPanel}
        onClose={() => setShowUsersPanel(false)}
        title="Профсеть"
      >
        {/* Поиск */}
        <SearchForm
          search={search}
          onSearchChange={setSearch}
          total={total}
          onSubmit={handleSearch}
          isMobile={true}
        />

        {/* Список пользователей */}
        <UsersList
          users={users}
          loading={loading}
          loadingMore={loadingMore}
          hasMore={hasMore}
          observerTarget={observerTarget}
          isMobile={true}
        />
      </MobileDrawer>
    </div>
  );
}
