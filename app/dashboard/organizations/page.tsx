"use client";

import { useCallback, useState, useEffect } from "react";
import type { ReactElement } from "react";
import { useSession } from "next-auth/react";
import Link from "next/link";
import { OrganizationType } from "@prisma/client";
import { Building2 } from "lucide-react";

const PAGE_SIZE = 20;

interface Organization {
  id: string;
  name: string;
  type: OrganizationType;
  chairmanName: string | null;
  chairmanJobTitle?: string | null;
  parentId: string | null;
  membersCount: number;
  reportsCount: number;
  documentsCount: number;
  ticketsCount: number;
  inn?: string | null;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
  totalEmployees?: number;
  isActive?: boolean;
  children?: Organization[];
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
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [page, setPage] = useState(1);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<OrganizationType | "ALL">("ALL");
  const [searchInput, setSearchInput] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [assignOpenForOrgId, setAssignOpenForOrgId] = useState<string | null>(null);
  const [headSearch, setHeadSearch] = useState("");
  const [headCandidates, setHeadCandidates] = useState<Array<{ id: string; firstName: string | null; lastName: string | null; email: string | null; phone: string | null }>>([]);
  const [selectedHeadUserId, setSelectedHeadUserId] = useState<string | null>(null);
  const [headJobTitle, setHeadJobTitle] = useState("");
  const [isAssigningHead, setIsAssigningHead] = useState(false);
  const [treeOrganizations, setTreeOrganizations] = useState<Organization[]>([]);
  const [isTreeLoading, setIsTreeLoading] = useState(false);

  const loadOrganizations = useCallback(async (pageNum: number, q: string, typeFilter: OrganizationType | "ALL") => {
    setIsLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      params.set("page", String(pageNum));
      params.set("limit", String(PAGE_SIZE));
      if (q) params.set("q", q);
      if (typeFilter !== "ALL") params.set("type", typeFilter);
      const res = await fetch(`/api/org-head/organizations?${params.toString()}`);
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Ошибка загрузки");
      }
      const data = await res.json();
      setOrganizations(data.organizations || []);
      setTotal(data.total ?? 0);
      setTotalPages(data.totalPages ?? 1);
      setPage(data.page ?? pageNum);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadOrganizations(page, searchQuery, filter);
  }, [page, searchQuery, filter, loadOrganizations]);

  const loadHierarchy = useCallback(async () => {
    setIsTreeLoading(true);
    try {
      const limit = 100;
      let currentPage = 1;
      let pages = 1;
      const all: Organization[] = [];

      while (currentPage <= pages) {
        const params = new URLSearchParams();
        params.set("page", String(currentPage));
        params.set("limit", String(limit));
        const res = await fetch(`/api/org-head/organizations?${params.toString()}`);
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error || "Ошибка загрузки иерархии");
        }
        const data = await res.json();
        all.push(...(data.organizations || []));
        pages = data.totalPages ?? 1;
        currentPage += 1;
      }

      setTreeOrganizations(all);
    } catch (err: any) {
      setError(err.message || "Ошибка загрузки иерархии");
    } finally {
      setIsTreeLoading(false);
    }
  }, []);

  const hierarchyMode = filter === "ALL" && !searchQuery;
  useEffect(() => {
    if (hierarchyMode) loadHierarchy();
  }, [hierarchyMode, loadHierarchy]);

  const buildTree = (orgs: Organization[]): Organization[] => {
    const map = new Map<string, Organization>();
    const roots: Organization[] = [];
    orgs.forEach((o) => map.set(o.id, { ...o, children: [] }));
    orgs.forEach((o) => {
      const current = map.get(o.id)!;
      if (o.parentId && map.has(o.parentId)) {
        map.get(o.parentId)!.children!.push(current);
      } else {
        roots.push(current);
      }
    });
    const sortNodes = (nodes: Organization[]): Organization[] =>
      nodes
        .sort((a, b) => a.name.localeCompare(b.name, "ru"))
        .map((n) => ({ ...n, children: n.children ? sortNodes(n.children) : [] }));
    return sortNodes(roots);
  };

  const hierarchyTree = buildTree(treeOrganizations);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSearchQuery(searchInput.trim());
    setPage(1);
  };

  useEffect(() => {
    const run = async () => {
      if (!assignOpenForOrgId) return;
      const q = headSearch.trim();
      if (q.length < 2) {
        setHeadCandidates([]);
        return;
      }

      try {
        const res = await fetch(`/api/chat/users/search?q=${encodeURIComponent(q)}&limit=20`);
        if (!res.ok) return;
        const data = await res.json();
        setHeadCandidates(data.users || []);
      } catch {
        setHeadCandidates([]);
      }
    };
    run();
  }, [headSearch, assignOpenForOrgId]);

  const assignHead = async () => {
    if (!assignOpenForOrgId || !selectedHeadUserId) return;
    try {
      setIsAssigningHead(true);
      const res = await fetch(`/api/org-head/organizations/${assignOpenForOrgId}/assign-head`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: selectedHeadUserId,
          chairmanJobTitle: headJobTitle.trim() || null,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Ошибка назначения председателя");
      }

      const selected = headCandidates.find((u) => u.id === selectedHeadUserId);
      const fullName = [selected?.lastName, selected?.firstName].filter(Boolean).join(" ").trim();
      if (fullName) {
        setOrganizations((prev) =>
          prev.map((org) =>
            org.id === assignOpenForOrgId
              ? { ...org, chairmanName: fullName, chairmanJobTitle: headJobTitle.trim() || null }
              : org
          )
        );
      }

      setAssignOpenForOrgId(null);
      setHeadSearch("");
      setHeadCandidates([]);
      setSelectedHeadUserId(null);
      setHeadJobTitle("");
      loadOrganizations(page, searchQuery, filter);
      if (hierarchyMode) {
        loadHierarchy();
      }
    } catch (e: any) {
      alert(e?.message || "Не удалось назначить председателя");
    } finally {
      setIsAssigningHead(false);
    }
  };

  const renderHierarchyNode = (org: Organization, level = 0): ReactElement => (
    <div key={org.id} className={level > 0 ? "ml-4 border-l-2 border-gray-200 dark:border-gray-700 pl-4 mt-2" : "mt-2"}>
      <div className="rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="font-medium text-gray-900 dark:text-white break-words">{org.name}</p>
            <div className="mt-1 flex items-center gap-2 flex-wrap">
              <span className={`rounded-lg px-2.5 py-1 text-xs font-medium ${ORG_TYPE_COLORS[org.type]}`}>
                {ORG_TYPE_LABELS[org.type]}
              </span>
              <span className="text-xs text-gray-500 dark:text-gray-400">
                Председатель: {org.chairmanName || "Не назначен"}
              </span>
              <span className="text-xs text-gray-500 dark:text-gray-400">
                Членов: {org.membersCount}
              </span>
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Link
              href={`/dashboard/organizations/${org.id}`}
              className="rounded bg-blue-600 px-3 py-1 text-xs font-medium text-white hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600"
            >
              Просмотр
            </Link>
            <button
              type="button"
              onClick={() => {
                setAssignOpenForOrgId(org.id);
                setHeadSearch("");
                setHeadCandidates([]);
                setSelectedHeadUserId(null);
                setHeadJobTitle(org.chairmanJobTitle || "");
              }}
              className="rounded bg-purple-600 px-3 py-1 text-xs font-medium text-white hover:bg-purple-700"
            >
              Назначить председателя
            </button>
          </div>
        </div>
      </div>
      {org.children && org.children.length > 0 && (
        <div>{org.children.map((child) => renderHierarchyNode(child, level + 1))}</div>
      )}
    </div>
  );

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
          <h1 className="flex items-center gap-2 text-2xl font-bold text-gray-900 dark:text-white">
            <Building2 className="h-7 w-7" /> Подчинённые организации
          </h1>
          <p className="mt-1 text-gray-500 dark:text-gray-400">
            Всего: {total}
          </p>
        </div>
      </div>

      {/* Поиск и фильтры */}
      <form onSubmit={handleSearchSubmit} className="flex flex-col gap-4 rounded-xl bg-white p-4 shadow-sm dark:bg-gray-800 sm:flex-row sm:items-center">
        <div className="flex min-w-0 flex-1 gap-2">
          <input
            type="text"
            placeholder="Поиск по названию, председателю, email, ИНН..."
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            className="min-w-0 flex-1 rounded-lg border border-gray-300 px-4 py-2 text-sm focus:border-blue-500 focus:outline-none dark:border-gray-600 dark:bg-gray-700 dark:text-white"
            aria-label="Поиск организаций"
          />
          <button
            type="submit"
            className="shrink-0 rounded-lg bg-gray-200 px-4 py-2 text-sm font-medium text-gray-800 hover:bg-gray-300 dark:bg-gray-600 dark:text-white dark:hover:bg-gray-500"
          >
            Найти
          </button>
          {searchQuery && (
            <button
              type="button"
              onClick={() => { setSearchInput(""); setSearchQuery(""); setPage(1); }}
              className="shrink-0 rounded-lg px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-700"
            >
              Сбросить
            </button>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => { setFilter("ALL"); setPage(1); }}
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
              type="button"
              onClick={() => { setFilter(type); setPage(1); }}
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
      </form>

      {hierarchyMode ? (
        <div className="rounded-xl bg-white p-4 shadow-sm dark:bg-gray-800">
          <h2 className="mb-3 text-lg font-semibold text-gray-900 dark:text-white">Иерархия организаций</h2>
          {isTreeLoading ? (
            <div className="flex min-h-[220px] items-center justify-center">
              <div className="h-10 w-10 animate-spin rounded-full border-4 border-primary border-t-transparent" />
            </div>
          ) : hierarchyTree.length > 0 ? (
            <div>{hierarchyTree.map((node) => renderHierarchyNode(node))}</div>
          ) : (
            <div className="rounded-lg border border-dashed border-gray-300 px-4 py-10 text-center text-gray-500 dark:border-gray-700 dark:text-gray-400">
              Нет подчинённых организаций
            </div>
          )}
        </div>
      ) : (
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
                {organizations.length > 0 ? (
                  organizations.map((org) => (
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
                        <div className="flex justify-end gap-2">
                          <Link
                            href={`/dashboard/organizations/${org.id}`}
                            className="rounded bg-blue-600 px-3 py-1 text-xs font-medium text-white hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600"
                          >
                            Просмотр
                          </Link>
                          <button
                            type="button"
                            onClick={() => {
                              setAssignOpenForOrgId(org.id);
                              setHeadSearch("");
                              setHeadCandidates([]);
                              setSelectedHeadUserId(null);
                              setHeadJobTitle(org.chairmanJobTitle || "");
                            }}
                            className="rounded bg-purple-600 px-3 py-1 text-xs font-medium text-white hover:bg-purple-700"
                          >
                            Назначить председателя
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={8} className="px-6 py-12 text-center text-gray-500 dark:text-gray-400">
                      Организации не найдены по заданным критериям
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {!hierarchyMode && !isLoading && totalPages > 1 && (
        <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl bg-white p-3 shadow-sm dark:bg-gray-800">
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Показано {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, total)} из {total}
          </p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => loadOrganizations(Math.max(1, page - 1), searchQuery, filter)}
              disabled={page <= 1}
              className="inline-flex items-center gap-1 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:pointer-events-none disabled:opacity-50 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600"
            >
              Назад
            </button>
            <span className="px-3 py-2 text-sm text-gray-700 dark:text-gray-300">
              Страница {page} из {totalPages}
            </span>
            <button
              type="button"
              onClick={() => loadOrganizations(Math.min(totalPages, page + 1), searchQuery, filter)}
              disabled={page >= totalPages}
              className="inline-flex items-center gap-1 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:pointer-events-none disabled:opacity-50 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600"
            >
              Вперёд
            </button>
          </div>
        </div>
      )}

      {assignOpenForOrgId && (
        <div className="rounded-xl bg-white p-4 shadow-sm dark:bg-gray-800">
          <h3 className="mb-3 text-base font-semibold text-gray-900 dark:text-white">
            Назначение председателя
          </h3>
          <div className="grid gap-3 sm:grid-cols-2">
            <input
              value={headSearch}
              onChange={(e) => setHeadSearch(e.target.value)}
              placeholder="Поиск пользователя (ФИО, email, телефон)"
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-white"
            />
            <input
              value={headJobTitle}
              onChange={(e) => setHeadJobTitle(e.target.value)}
              placeholder="Должность председателя"
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-white"
            />
          </div>

          <div className="mt-3 max-h-56 overflow-y-auto rounded-lg border border-gray-200 dark:border-gray-700">
            {headCandidates.length === 0 ? (
              <p className="px-3 py-2 text-sm text-gray-500 dark:text-gray-400">Введите минимум 2 символа для поиска</p>
            ) : (
              headCandidates.map((u) => {
                const fullName = [u.lastName, u.firstName].filter(Boolean).join(" ").trim() || "Без имени";
                return (
                  <button
                    key={u.id}
                    onClick={() => setSelectedHeadUserId(u.id)}
                    className={`flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-gray-50 dark:hover:bg-gray-700 ${
                      selectedHeadUserId === u.id ? "bg-blue-50 dark:bg-blue-900/20" : ""
                    }`}
                  >
                    <span className="font-medium text-gray-900 dark:text-white">{fullName}</span>
                    <span className="text-xs text-gray-500 dark:text-gray-400">{u.email || u.phone || "—"}</span>
                  </button>
                );
              })
            )}
          </div>

          <div className="mt-3 flex justify-end gap-2">
            <button
              onClick={() => setAssignOpenForOrgId(null)}
              className="rounded bg-gray-200 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-300 dark:bg-gray-700 dark:text-gray-300"
            >
              Отмена
            </button>
            <button
              onClick={assignHead}
              disabled={!selectedHeadUserId || isAssigningHead}
              className="rounded bg-purple-600 px-3 py-1.5 text-sm text-white hover:bg-purple-700 disabled:opacity-50"
            >
              {isAssigningHead ? "Назначение..." : "Назначить"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
