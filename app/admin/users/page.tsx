"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import ImpersonateButton from "@/components/admin/users/ImpersonateButton";
import { Search, ChevronLeft, ChevronRight } from "lucide-react";
import {
  getUserRoleLabel,
  getMembershipStatusLabel,
  getMembershipStatusBadgeClass,
} from "@/lib/status-labels";

const PAGE_SIZE = 20;

interface UserDoc {
  id: string;
  type: string;
  status: string;
}

interface UserRow {
  id: string;
  email: string | null;
  firstName: string | null;
  lastName: string | null;
  role: string;
  membershipStatus: string;
  createdAt: string;
  documents: UserDoc[];
  workplace: string | null;
  organization: { id: string; name: string } | null;
  ppoHeadOrganization: { id: string; name: string } | null;
  effectiveOrganization: { id: string; name: string } | null;
  chairmanOfOrganization: { id: string; name: string } | null;
  effectiveWorkplace: string | null;
}

export default function AdminUsers() {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const loadUsers = useCallback(async (pageNum: number, searchQuery: string) => {
    setLoading(true);
    setLoadError(null);
    try {
      const params = new URLSearchParams();
      params.set("page", String(pageNum));
      params.set("limit", String(PAGE_SIZE));
      if (searchQuery.trim()) params.set("search", searchQuery.trim());
      const res = await fetch(`/api/admin/users?${params.toString()}`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const msg = data.error || (res.status === 403 ? "Недостаточно прав. Войдите как суперадмин." : "Ошибка загрузки");
        setLoadError(msg);
        setUsers([]);
        setTotal(0);
        setTotalPages(0);
        return;
      }
      setUsers(data.users || []);
      setTotal(data.total ?? 0);
      setTotalPages(data.totalPages ?? 1);
      setPage(data.page ?? pageNum);
    } catch {
      setLoadError("Ошибка сети");
      setUsers([]);
      setTotal(0);
      setTotalPages(0);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadUsers(1, search);
  }, [search, loadUsers]);

  const goToPage = (p: number) => {
    const next = Math.max(1, Math.min(p, totalPages));
    loadUsers(next, search);
  };

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSearch(searchInput.trim());
    setPage(1);
  };

  return (
    <div className="space-y-6 min-w-0 w-full">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
          Управление пользователями
        </h1>
        <Link
          href="/admin/users/invite"
          className="inline-flex shrink-0 items-center justify-center rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow transition hover:bg-blue-700"
        >
          Пригласить пользователя
        </Link>
      </div>

      {/* Поиск */}
      <form onSubmit={handleSearchSubmit}>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              type="search"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Поиск по email, имени, фамилии..."
              className="w-full rounded-lg border border-gray-300 bg-white py-2 pl-10 pr-4 text-gray-900 placeholder-gray-500 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-800 dark:text-white dark:placeholder-gray-400"
            />
          </div>
          <button
            type="submit"
            className="rounded-lg bg-gray-200 px-4 py-2 text-gray-800 hover:bg-gray-300 dark:bg-gray-700 dark:text-white dark:hover:bg-gray-600"
          >
            Найти
          </button>
          {search && (
            <button
              type="button"
              onClick={() => {
                setSearchInput("");
                setSearch("");
              }}
              className="rounded-lg px-4 py-2 text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-700"
            >
              Сбросить
            </button>
          )}
        </div>
      </form>

      {loadError && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-red-800 dark:border-red-800 dark:bg-red-900/20 dark:text-red-300">
          {loadError}
        </div>
      )}

      {/* Таблица */}
      <div className="overflow-x-auto rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-sm">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <div className="h-10 w-10 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
          </div>
        ) : (
          <table className="w-full">
            <thead className="border-b border-gray-200 bg-gray-50 dark:border-gray-700 dark:bg-gray-900">
              <tr>
                <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900 dark:text-white">
                  Email
                </th>
                <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900 dark:text-white">
                  Имя
                </th>
                <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900 dark:text-white">
                  Роль
                </th>
                <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900 dark:text-white">
                  Статус
                </th>
                <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900 dark:text-white">
                  Организация
                </th>
                <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900 dark:text-white">
                  Место работы
                </th>
                <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900 dark:text-white">
                  Дата регистрации
                </th>
                <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900 dark:text-white">
                  Действия
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
              {users.map((user) => {
                const hasPendingDocuments = (user.documents?.length ?? 0) > 0;
                const needsAttention =
                  hasPendingDocuments &&
                  (user.membershipStatus === "DOCUMENTS_PENDING" ||
                    user.membershipStatus === "PENDING_VERIFICATION");

                return (
                  <tr
                    key={user.id}
                    className={`hover:bg-gray-50 dark:hover:bg-gray-700 ${
                      needsAttention
                        ? "border-l-4 border-yellow-500 bg-yellow-50 dark:bg-yellow-900/20 animate-pulse"
                        : ""
                    }`}
                  >
                    <td className="px-6 py-4 text-sm text-gray-900 dark:text-white">
                      {user.email ?? "—"}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600 dark:text-gray-400">
                      {[user.firstName, user.lastName].filter(Boolean).join(" ") || "—"}
                    </td>
                    <td className="px-6 py-4 text-sm">
                      <span className="inline-flex rounded-full bg-blue-100 px-3 py-1 text-xs font-semibold text-blue-800 dark:bg-blue-900 dark:text-blue-200">
                        {getUserRoleLabel(user.role)}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm">
                      <span
                        className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${getMembershipStatusBadgeClass(
                          user.membershipStatus
                        )}`}
                      >
                        {getMembershipStatusLabel(user.membershipStatus)}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600 dark:text-gray-400">
                      {user.effectiveOrganization?.name || "—"}
                      {user.chairmanOfOrganization?.id && (
                        <div className="mt-1">
                          <span className="inline-flex rounded-full bg-purple-100 px-2 py-0.5 text-xs font-medium text-purple-700 dark:bg-purple-900/30 dark:text-purple-300">
                            Председатель
                          </span>
                        </div>
                      )}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600 dark:text-gray-400">
                      {user.effectiveWorkplace || "—"}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600 dark:text-gray-400">
                      {user.createdAt
                        ? new Date(user.createdAt).toLocaleDateString("ru-RU")
                        : "—"}
                    </td>
                    <td className="px-6 py-4 text-sm">
                      <div className="flex flex-wrap items-center gap-3">
                        <Link
                          href={`/admin/users/${user.id}`}
                          className="text-blue-600 hover:text-blue-700 dark:text-blue-400"
                        >
                          Просмотр
                        </Link>
                        <ImpersonateButton
                          userId={user.id}
                          userEmail={user.email || ""}
                        />
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}

        {!loading && users.length === 0 && !loadError && (
          <div className="py-12 text-center text-gray-600 dark:text-gray-400">
            Пользователей не найдено
          </div>
        )}
      </div>

      {/* Пагинация */}
      {!loading && totalPages > 1 && (
        <div className="flex flex-wrap items-center justify-between gap-4">
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Показано {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, total)} из {total}
          </p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => goToPage(page - 1)}
              disabled={page <= 1}
              className="inline-flex items-center gap-1 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:pointer-events-none disabled:opacity-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
            >
              <ChevronLeft className="h-4 w-4" />
              Назад
            </button>
            <span className="px-3 py-2 text-sm text-gray-700 dark:text-gray-300">
              Страница {page} из {totalPages}
            </span>
            <button
              type="button"
              onClick={() => goToPage(page + 1)}
              disabled={page >= totalPages}
              className="inline-flex items-center gap-1 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:pointer-events-none disabled:opacity-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
            >
              Вперёд
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
