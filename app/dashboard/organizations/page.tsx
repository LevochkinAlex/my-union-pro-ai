"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import Link from "next/link";
import { OrganizationType } from "@prisma/client";

interface Organization {
  id: string;
  name: string;
  type: OrganizationType;
  chairmanName: string | null;
  parentId: string | null;
  membersCount: number;
  reportsCount: number;
  documentsCount: number;
  ticketsCount: number;
}

const ORG_TYPE_LABELS: Record<OrganizationType, string> = {
  PRIMARY: "ППО",
  LOCAL: "МПО",
  REGIONAL: "РПО",
  FEDERAL: "ФПО",
};

const ORG_TYPE_COLORS: Record<OrganizationType, string> = {
  PRIMARY: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
  LOCAL: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
  REGIONAL: "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300",
  FEDERAL: "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300",
};

export default function OrganizationsPage() {
  const { data: session } = useSession();
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<OrganizationType | "ALL">("ALL");
  const [search, setSearch] = useState("");

  useEffect(() => {
    const loadData = async () => {
      try {
        const res = await fetch("/api/org-head/stats");
        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.error || "Ошибка загрузки");
        }
        const data = await res.json();
        setOrganizations(data.organizations || []);
      } catch (err: any) {
        setError(err.message);
      } finally {
        setIsLoading(false);
      }
    };

    loadData();
  }, []);

  // Фильтрация организаций
  const filteredOrgs = organizations.filter((org) => {
    const matchesFilter = filter === "ALL" || org.type === filter;
    const matchesSearch =
      !search ||
      org.name.toLowerCase().includes(search.toLowerCase()) ||
      org.chairmanName?.toLowerCase().includes(search.toLowerCase());
    return matchesFilter && matchesSearch;
  });

  // Группировка по типу
  const orgsByType = filteredOrgs.reduce((acc, org) => {
    if (!acc[org.type]) {
      acc[org.type] = [];
    }
    acc[org.type].push(org);
    return acc;
  }, {} as Record<OrganizationType, Organization[]>);

  if (isLoading) {
    return (
      <div className="flex min-h-[400px] items-center justify-center">
        <div className="h-12 w-12 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg bg-red-50 p-6 text-center dark:bg-red-900/20">
        <p className="text-red-600 dark:text-red-400">{error}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Заголовок */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
            🏛️ Подчинённые организации
          </h1>
          <p className="mt-1 text-gray-500 dark:text-gray-400">
            Всего организаций: {organizations.length}
          </p>
        </div>
      </div>

      {/* Фильтры */}
      <div className="flex flex-col gap-4 rounded-xl bg-white p-4 shadow-sm dark:bg-gray-800 sm:flex-row sm:items-center">
        <div className="flex-1">
          <input
            type="text"
            placeholder="Поиск по названию или председателю..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-lg border border-gray-300 px-4 py-2 text-sm focus:border-blue-500 focus:outline-none dark:border-gray-600 dark:bg-gray-700 dark:text-white"
          />
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setFilter("ALL")}
            className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
              filter === "ALL"
                ? "bg-blue-600 text-white"
                : "bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300"
            }`}
          >
            Все
          </button>
          {(Object.keys(ORG_TYPE_LABELS) as OrganizationType[]).map((type) => (
            <button
              key={type}
              onClick={() => setFilter(type)}
              className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
                filter === type
                  ? "bg-blue-600 text-white"
                  : "bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300"
              }`}
            >
              {ORG_TYPE_LABELS[type]}
            </button>
          ))}
        </div>
      </div>

      {/* Статистика по типам */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {(Object.keys(ORG_TYPE_LABELS) as OrganizationType[]).map((type) => {
          const count = organizations.filter((o) => o.type === type).length;
          if (count === 0) return null;
          return (
            <div
              key={type}
              className="rounded-xl bg-white p-4 shadow-sm dark:bg-gray-800"
            >
              <div className="flex items-center gap-3">
                <span className={`rounded-lg px-3 py-1 text-sm font-medium ${ORG_TYPE_COLORS[type]}`}>
                  {ORG_TYPE_LABELS[type]}
                </span>
                <span className="text-2xl font-bold text-gray-900 dark:text-white">
                  {count}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Таблица организаций */}
      <div className="overflow-hidden rounded-xl bg-white shadow-sm dark:bg-gray-800">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
            <thead className="bg-gray-50 dark:bg-gray-700">
              <tr>
                <th className="px-6 py-4 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
                  Организация
                </th>
                <th className="px-6 py-4 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
                  Тип
                </th>
                <th className="px-6 py-4 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
                  Председатель
                </th>
                <th className="px-6 py-4 text-center text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
                  Членов
                </th>
                <th className="px-6 py-4 text-center text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
                  Отчётов
                </th>
                <th className="px-6 py-4 text-center text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
                  Документов
                </th>
                <th className="px-6 py-4 text-center text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
                  Обращений
                </th>
                <th className="px-6 py-4 text-right text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
                  Действия
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 bg-white dark:divide-gray-700 dark:bg-gray-800">
              {filteredOrgs.length > 0 ? (
                filteredOrgs.map((org) => (
                  <tr key={org.id} className="hover:bg-gray-50 dark:hover:bg-gray-700">
                    <td className="whitespace-nowrap px-6 py-4">
                      <p className="font-medium text-gray-900 dark:text-white">{org.name}</p>
                    </td>
                    <td className="whitespace-nowrap px-6 py-4">
                      <span className={`rounded-lg px-3 py-1 text-xs font-medium ${ORG_TYPE_COLORS[org.type]}`}>
                        {ORG_TYPE_LABELS[org.type]}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-6 py-4 text-gray-600 dark:text-gray-400">
                      {org.chairmanName || <span className="text-gray-400">Не назначен</span>}
                    </td>
                    <td className="whitespace-nowrap px-6 py-4 text-center text-gray-600 dark:text-gray-400">
                      {org.membersCount}
                    </td>
                    <td className="whitespace-nowrap px-6 py-4 text-center text-gray-600 dark:text-gray-400">
                      {org.reportsCount}
                    </td>
                    <td className="whitespace-nowrap px-6 py-4 text-center text-gray-600 dark:text-gray-400">
                      {org.documentsCount}
                    </td>
                    <td className="whitespace-nowrap px-6 py-4 text-center text-gray-600 dark:text-gray-400">
                      {org.ticketsCount}
                    </td>
                    <td className="whitespace-nowrap px-6 py-4 text-right">
                      <Link
                        href={`/dashboard/organizations/${org.id}`}
                        className="text-sm font-medium text-blue-600 hover:text-blue-700 dark:text-blue-400"
                      >
                        Подробнее →
                      </Link>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={8} className="px-6 py-12 text-center text-gray-500 dark:text-gray-400">
                    {search || filter !== "ALL"
                      ? "Организации не найдены по заданным критериям"
                      : "Нет подчинённых организаций"}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
