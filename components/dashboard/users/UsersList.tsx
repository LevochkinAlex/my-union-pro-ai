"use client";

import dynamic from "next/dynamic";

const UserCard = dynamic(() => import("@/components/dashboard/users/UserCard"), {
  ssr: false,
  loading: () => (
    <div className="animate-pulse bg-gray-200 dark:bg-gray-700 rounded-lg h-32"></div>
  ),
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
  createdAt: Date | string;
  organization: {
    id: string;
    name: string;
  } | null;
}

interface UsersListProps {
  users: User[];
  loading: boolean;
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  isMobile?: boolean;
}

export default function UsersList({
  users,
  loading,
  page,
  totalPages,
  onPageChange,
  isMobile = false,
}: UsersListProps) {
  if (loading) {
    const skeletonCount = isMobile ? 4 : 6;
    return (
      <div className="space-y-4">
        {[...Array(skeletonCount)].map((_, i) => (
          <div
            key={i}
            className={`${
              isMobile
                ? "bg-gray-50 dark:bg-gray-900"
                : "bg-white dark:bg-gray-800"
            } rounded-lg border border-gray-200 dark:border-gray-700 p-4 animate-pulse`}
          >
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
    );
  }

  if (users.length === 0) {
    return (
      <div
        className={`${
          isMobile
            ? "bg-gray-50 dark:bg-gray-900"
            : "bg-white dark:bg-gray-800"
        } rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm ${
          isMobile ? "p-8" : "p-12"
        } text-center`}
      >
        <div className="flex flex-col items-center">
          <div
            className={`${
              isMobile ? "h-12 w-12" : "h-16 w-16"
            } rounded-full bg-gray-100 dark:bg-gray-700 flex items-center justify-center ${
              isMobile ? "mb-3" : "mb-4"
            }`}
          >
            <svg
              className={`${isMobile ? "h-6 w-6" : "h-8 w-8"} text-gray-400`}
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
          <p
            className={`text-sm text-gray-400 dark:text-gray-500 ${
              isMobile ? "mt-1" : "mt-2"
            }`}
          >
            Попробуйте изменить параметры поиска
          </p>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="space-y-4">
        {users.map((user) => (
          <UserCard
            key={user.id}
            user={{
              ...user,
              createdAt:
                typeof user.createdAt === "string"
                  ? new Date(user.createdAt)
                  : user.createdAt,
            }}
          />
        ))}
      </div>

      {/* Пагинация */}
      {totalPages > 1 && (
        <div
          className={`flex items-center justify-center gap-2 ${
            isMobile ? "pt-4 pb-4" : ""
          }`}
        >
          <button
            onClick={() => onPageChange(Math.max(1, page - 1))}
            disabled={page === 1}
            className={`${
              isMobile
                ? "px-4 py-2.5 text-base min-w-[80px] active:bg-gray-50 dark:active:bg-gray-700 touch-manipulation"
                : "px-4 py-2 hover:bg-gray-50 dark:hover:bg-gray-700"
            } border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 disabled:opacity-50 disabled:cursor-not-allowed`}
          >
            Назад
          </button>
          <span
            className={`px-4 ${
              isMobile ? "py-2.5 text-sm" : "py-2"
            } text-gray-700 dark:text-gray-300`}
          >
            Страница {page} из {totalPages}
          </span>
          <button
            onClick={() => onPageChange(Math.min(totalPages, page + 1))}
            disabled={page === totalPages}
            className={`${
              isMobile
                ? "px-4 py-2.5 text-base min-w-[80px] active:bg-gray-50 dark:active:bg-gray-700 touch-manipulation"
                : "px-4 py-2 hover:bg-gray-50 dark:hover:bg-gray-700"
            } border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 disabled:opacity-50 disabled:cursor-not-allowed`}
          >
            Вперед
          </button>
        </div>
      )}
    </>
  );
}

