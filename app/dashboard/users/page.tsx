"use client";

import { useEffect, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { useSession } from "next-auth/react";
import dynamic from "next/dynamic";
import CreatePost from "@/components/posts/CreatePost";
import PostFeed from "@/components/posts/PostFeed";

const UserCard = dynamic(() => import("@/components/dashboard/users/UserCard"), {
  ssr: false,
  loading: () => <div className="animate-pulse bg-gray-200 dark:bg-gray-700 rounded-lg h-32"></div>,
});

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
  createdAt: Date;
  organization: {
    id: string;
    name: string;
  } | null;
}

interface Organization {
  id: string;
  name: string;
}

// Обертка для Suspense
export default function UsersPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center min-h-screen"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div></div>}>
      <UsersPageContent />
    </Suspense>
  );
}

function UsersPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { data: session } = useSession();
  const [users, setUsers] = useState<User[]>([]);
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [selectedOrg, setSelectedOrg] = useState("");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [refreshKey, setRefreshKey] = useState(0);
  
  // Initialize from URL params on client side only
  useEffect(() => {
    const searchParam = searchParams.get("search");
    const orgParam = searchParams.get("organizationId");
    if (searchParam) setSearch(searchParam);
    if (orgParam) setSelectedOrg(orgParam);
  }, []); // Run once on mount
  const [showUsersPanel, setShowUsersPanel] = useState(false); // Для мобильной версии

  // Блокируем скролл body при открытом drawer
  useEffect(() => {
    if (showUsersPanel) {
      const originalStyle = window.getComputedStyle(document.body).overflow;
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = originalStyle;
      };
    }
  }, [showUsersPanel]);

  const handlePostCreated = () => {
    // Обновляем ключ для перезагрузки ленты
    setRefreshKey((prev) => prev + 1);
  };

  useEffect(() => {
    loadUsers();
  }, [page, search, selectedOrg]);

  const loadUsers = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (search) params.append("search", search);
      if (selectedOrg) params.append("organizationId", selectedOrg);
      params.append("page", page.toString());
      params.append("limit", "20");

      // Добавляем timestamp для предотвращения кеширования браузером
      params.append("_t", Date.now().toString());

      const startTime = performance.now();
      const response = await fetch(`/api/users?${params.toString()}`, {
        cache: "no-store", // Отключаем кеширование браузера
      });
      const loadTime = performance.now() - startTime;
      
      if (loadTime > 1000) {
        console.warn(`[Users] Slow API call: ${loadTime.toFixed(0)}ms`);
      }

      if (!response.ok) {
        throw new Error("Не удалось загрузить пользователей");
      }

      const data = await response.json();
      // Преобразуем createdAt из строки в Date
      const usersWithDates = (data.users || []).map((user: any) => ({
        ...user,
        createdAt: user.createdAt ? new Date(user.createdAt) : new Date(),
      }));
      setUsers(usersWithDates);
      setOrganizations(data.organizations || []);
      setTotalPages(data.totalPages || 1);
      setTotal(data.total || 0);

      // Обновляем URL без перезагрузки страницы
      const newParams = new URLSearchParams();
      if (search) newParams.append("search", search);
      if (selectedOrg) newParams.append("organizationId", selectedOrg);
      router.replace(`/dashboard/users?${newParams.toString()}`, { scroll: false });
    } catch (error) {
      console.error("Error loading users:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    loadUsers();
  };

  const handleOrgChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setSelectedOrg(e.target.value);
    setPage(1);
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
              <svg className="h-5 w-5 text-blue-600 dark:text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
              </svg>
            </div>
            <div className="text-left">
              <h2 className="text-base font-semibold text-gray-900 dark:text-white">
                Профсеть
              </h2>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                {total > 0 ? `Найдено: ${total} ${total === 1 ? "участник" : total < 5 ? "участника" : "участников"}` : "Найти коллег"}
              </p>
            </div>
          </div>
          <svg
            className={`h-5 w-5 text-gray-400 transition-transform ${showUsersPanel ? "rotate-180" : ""}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 lg:gap-6">
        {/* Левая колонка: Профсеть (50% ширины) - скрыта на мобильных, показывается в модальном окне */}
        <div className={`space-y-4 lg:space-y-6 ${showUsersPanel ? "block" : "hidden lg:block"}`}>
        {/* Заголовок */}
        <div>
          <h1 className="text-2xl lg:text-3xl font-bold text-gray-900 dark:text-white">
            Коллеги профсоюза
          </h1>
          <p className="mt-1 lg:mt-2 text-sm lg:text-base text-gray-600 dark:text-gray-400">
            Найдите и свяжитесь с другими членами профсоюза
          </p>
        </div>

        {/* Поиск и фильтры */}
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm p-4 lg:p-6">
          <form onSubmit={handleSearch} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {/* Поиск */}
              <div className="sm:col-span-2">
                <label htmlFor="search" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Поиск по имени, email или телефону
                </label>
                <div className="relative">
                  <input
                    type="text"
                    id="search"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Введите имя, email или телефон..."
                    className="w-full px-4 py-2 pl-10 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                  <svg
                    className="absolute left-3 top-2.5 h-5 w-5 text-gray-400"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                </div>
              </div>

              {/* Фильтр по организации */}
              <div>
                <label htmlFor="organization" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Организация
                </label>
                <select
                  id="organization"
                  value={selectedOrg}
                  onChange={handleOrgChange}
                  className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  <option value="">Все организации</option>
                  {organizations.map((org) => (
                    <option key={org.id} value={org.id}>
                      {org.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="flex items-center justify-between">
              <button
                type="submit"
                className="px-6 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-colors"
              >
                Найти
              </button>
              {total > 0 && (
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Найдено: {total} {total === 1 ? "участник" : total < 5 ? "участника" : "участников"}
                </p>
              )}
            </div>
          </form>
        </div>

        {/* Список пользователей */}
        {loading ? (
          <div className="space-y-4">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4 animate-pulse">
                <div className="flex items-center gap-4">
                  <div className="h-14 w-14 rounded-full bg-gray-200 dark:bg-gray-700 flex-shrink-0"></div>
                  <div className="flex-1 space-y-2">
                    <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-3/4"></div>
                    <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-1/2"></div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : users.length > 0 ? (
          <>
            <div className="space-y-4">
              {users.map((user) => (
                <UserCard key={user.id} user={user} />
              ))}
            </div>

            {/* Пагинация */}
            {totalPages > 1 && (
              <div className="flex items-center justify-center gap-2">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50 dark:hover:bg-gray-700"
                >
                  Назад
                </button>
                <span className="px-4 py-2 text-gray-700 dark:text-gray-300">
                  Страница {page} из {totalPages}
                </span>
                <button
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                  className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50 dark:hover:bg-gray-700"
                >
                  Вперед
                </button>
              </div>
            )}
          </>
        ) : (
          <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm p-12 text-center">
            <div className="flex flex-col items-center">
              <div className="h-16 w-16 rounded-full bg-gray-100 dark:bg-gray-700 flex items-center justify-center mb-4">
                <svg
                  className="h-8 w-8 text-gray-400"
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
              <p className="text-gray-500 dark:text-gray-400 font-medium">
                Пользователи не найдены
              </p>
              <p className="text-sm text-gray-400 dark:text-gray-500 mt-2">
                Попробуйте изменить параметры поиска
              </p>
            </div>
          </div>
        )}
        </div>

        {/* Правая колонка: Лента постов (50% ширины) - на мобильных показывается первой */}
        <div className="space-y-4 lg:space-y-6 order-first lg:order-last">
          {/* Форма создания поста */}
          {session && (
            <CreatePost onPostCreated={handlePostCreated} compact={true} />
          )}

          {/* Лента постов - ленивая загрузка */}
          <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm p-4 lg:p-6">
            <h2 className="text-base lg:text-lg font-semibold text-gray-900 dark:text-white mb-4">
              Свежие посты
            </h2>
            <Suspense fallback={<div className="animate-pulse bg-gray-200 dark:bg-gray-700 rounded-lg h-32"></div>}>
              <PostFeed key={refreshKey} limit={5} />
            </Suspense>
          </div>
        </div>
      </div>

      {/* Мобильный drawer для панели коллег */}
      {showUsersPanel && (
        <div className="lg:hidden fixed inset-0 z-[100] pointer-events-none">
          {/* Overlay */}
          <div 
            className="fixed inset-0 bg-black/50 backdrop-blur-sm transition-opacity duration-300 pointer-events-auto"
            onClick={() => setShowUsersPanel(false)}
          />
          
          {/* Drawer */}
          <div 
            className="fixed top-0 right-0 bottom-0 w-full max-w-sm bg-white dark:bg-gray-800 shadow-2xl overflow-hidden flex flex-col pointer-events-auto"
            onClick={(e) => e.stopPropagation()}
            style={{ 
              transform: showUsersPanel ? 'translateX(0)' : 'translateX(100%)',
              transition: 'transform 0.3s ease-out',
            }}
          >
            {/* Заголовок с кнопкой закрытия */}
            <div className="flex-shrink-0 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-4 py-4 flex items-center justify-between shadow-sm">
              <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
                Профсеть
              </h2>
              <button
                onClick={() => setShowUsersPanel(false)}
                className="p-2 -mr-2 rounded-lg active:bg-gray-100 dark:active:bg-gray-700 transition-colors touch-manipulation"
                aria-label="Закрыть"
              >
                <svg className="h-6 w-6 text-gray-500 dark:text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            
            {/* Контент с прокруткой */}
            <div className="flex-1 overflow-y-auto overscroll-contain px-4 py-4 space-y-4" style={{ WebkitOverflowScrolling: 'touch' }}>
              {/* Поиск и фильтры */}
              <div className="bg-gray-50 dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
                <form onSubmit={handleSearch} className="space-y-4">
                  <div>
                    <label htmlFor="mobile-search" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      Поиск по имени, email или телефону
                    </label>
                    <div className="relative">
                      <input
                        type="text"
                        id="mobile-search"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder="Введите имя, email или телефон..."
                        className="w-full px-4 py-3 pl-10 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent text-base"
                        autoComplete="off"
                      />
                      <svg
                        className="absolute left-3 top-3.5 h-5 w-5 text-gray-400 pointer-events-none"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                      </svg>
                    </div>
                  </div>

                  <div>
                    <label htmlFor="mobile-organization" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      Организация
                    </label>
                    <select
                      id="mobile-organization"
                      value={selectedOrg}
                      onChange={handleOrgChange}
                      className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent text-base touch-manipulation"
                    >
                      <option value="">Все организации</option>
                      {organizations.map((org) => (
                        <option key={org.id} value={org.id}>
                          {org.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
                    <button
                      type="submit"
                      className="w-full sm:w-auto px-6 py-3 bg-blue-600 text-white rounded-lg font-medium active:bg-blue-700 transition-colors touch-manipulation text-base"
                    >
                      Найти
                    </button>
                    {total > 0 && (
                      <p className="text-sm text-gray-600 dark:text-gray-400 text-center sm:text-right whitespace-nowrap">
                        Найдено: {total} {total === 1 ? "участник" : total < 5 ? "участника" : "участников"}
                      </p>
                    )}
                  </div>
                </form>
              </div>

              {/* Список пользователей */}
              {loading ? (
                <div className="space-y-4">
                  {[...Array(4)].map((_, i) => (
                    <div key={i} className="bg-gray-50 dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 p-4 animate-pulse">
                      <div className="flex items-center gap-4">
                        <div className="h-14 w-14 rounded-full bg-gray-200 dark:bg-gray-700 flex-shrink-0"></div>
                        <div className="flex-1 space-y-2">
                          <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-3/4"></div>
                          <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-1/2"></div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : users.length > 0 ? (
                <>
                  <div className="space-y-4">
                    {users.map((user) => (
                      <UserCard key={user.id} user={user} />
                    ))}
                  </div>

                  {/* Пагинация */}
                  {totalPages > 1 && (
                    <div className="flex items-center justify-center gap-2 pt-4 pb-4">
                      <button
                        onClick={() => setPage((p) => Math.max(1, p - 1))}
                        disabled={page === 1}
                        className="px-4 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 disabled:opacity-50 disabled:cursor-not-allowed active:bg-gray-50 dark:active:bg-gray-700 touch-manipulation text-base min-w-[80px]"
                      >
                        Назад
                      </button>
                      <span className="px-4 py-2.5 text-gray-700 dark:text-gray-300 text-sm">
                        Страница {page} из {totalPages}
                      </span>
                      <button
                        onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                        disabled={page === totalPages}
                        className="px-4 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 disabled:opacity-50 disabled:cursor-not-allowed active:bg-gray-50 dark:active:bg-gray-700 touch-manipulation text-base min-w-[80px]"
                      >
                        Вперед
                      </button>
                    </div>
                  )}
                </>
              ) : (
                <div className="bg-gray-50 dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm p-8 text-center">
                  <div className="flex flex-col items-center">
                    <div className="h-12 w-12 rounded-full bg-gray-100 dark:bg-gray-700 flex items-center justify-center mb-3">
                      <svg
                        className="h-6 w-6 text-gray-400"
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
                    <p className="text-gray-500 dark:text-gray-400 font-medium">
                      Пользователи не найдены
                    </p>
                    <p className="text-sm text-gray-400 dark:text-gray-500 mt-1">
                      Попробуйте изменить параметры поиска
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

