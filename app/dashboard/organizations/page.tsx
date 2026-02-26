"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import Link from "next/link";
import { OrganizationType } from "@prisma/client";
import { Building2 } from "lucide-react";

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
  totalEmployees?: number;
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
  const [editingOrgId, setEditingOrgId] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [editForm, setEditForm] = useState({
    name: "",
    email: "",
    phone: "",
    inn: "",
    chairmanName: "",
    chairmanJobTitle: "",
    totalEmployees: "",
  });
  const [assignOpenForOrgId, setAssignOpenForOrgId] = useState<string | null>(null);
  const [headSearch, setHeadSearch] = useState("");
  const [headCandidates, setHeadCandidates] = useState<Array<{ id: string; firstName: string | null; lastName: string | null; email: string | null; phone: string | null }>>([]);
  const [selectedHeadUserId, setSelectedHeadUserId] = useState<string | null>(null);
  const [headJobTitle, setHeadJobTitle] = useState("");
  const [isAssigningHead, setIsAssigningHead] = useState(false);

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

  const startEdit = (org: Organization) => {
    setEditingOrgId(org.id);
    setEditForm({
      name: org.name || "",
      email: org.email || "",
      phone: org.phone || "",
      inn: org.inn || "",
      chairmanName: org.chairmanName || "",
      chairmanJobTitle: org.chairmanJobTitle || "",
      totalEmployees: String(org.totalEmployees || 0),
    });
  };

  const cancelEdit = () => {
    setEditingOrgId(null);
    setEditForm({
      name: "",
      email: "",
      phone: "",
      inn: "",
      chairmanName: "",
      chairmanJobTitle: "",
      totalEmployees: "",
    });
  };

  const saveEdit = async (orgId: string) => {
    try {
      setIsSaving(true);
      const payload = {
        name: editForm.name.trim(),
        email: editForm.email.trim() || null,
        phone: editForm.phone.trim() || null,
        inn: editForm.inn.trim() || null,
        chairmanName: editForm.chairmanName.trim() || null,
        chairmanJobTitle: editForm.chairmanJobTitle.trim() || null,
        totalEmployees: Number(editForm.totalEmployees || 0),
      };

      const res = await fetch(`/api/org-head/organizations/${orgId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Ошибка сохранения");
      }

      setOrganizations((prev) =>
        prev.map((org) =>
          org.id === orgId
            ? {
                ...org,
                name: payload.name,
                email: payload.email,
                phone: payload.phone,
                inn: payload.inn,
                chairmanName: payload.chairmanName,
                chairmanJobTitle: payload.chairmanJobTitle,
                totalEmployees: payload.totalEmployees,
              }
            : org
        )
      );
      cancelEdit();
    } catch (e: any) {
      alert(e?.message || "Не удалось сохранить организацию");
    } finally {
      setIsSaving(false);
    }
  };

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
    } catch (e: any) {
      alert(e?.message || "Не удалось назначить председателя");
    } finally {
      setIsAssigningHead(false);
    }
  };

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
          <h1 className="flex items-center gap-2 text-2xl font-bold text-gray-900 dark:text-white">
            <Building2 className="h-7 w-7" /> Подчинённые организации
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
                      {editingOrgId === org.id ? (
                        <input
                          aria-label="Название организации"
                          title="Название организации"
                          placeholder="Название организации"
                          value={editForm.name}
                          onChange={(e) => setEditForm((p) => ({ ...p, name: e.target.value }))}
                          className="w-full rounded border border-gray-300 px-2 py-1 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-white"
                        />
                      ) : (
                        <p className="font-medium text-gray-900 dark:text-white">{org.name}</p>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-6 py-4">
                      <span className={`rounded-lg px-3 py-1 text-xs font-medium ${ORG_TYPE_COLORS[org.type]}`}>
                        {ORG_TYPE_LABELS[org.type]}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-6 py-4 text-gray-600 dark:text-gray-400">
                      {editingOrgId === org.id ? (
                        <input
                          aria-label="ФИО председателя"
                          title="ФИО председателя"
                          placeholder="ФИО председателя"
                          value={editForm.chairmanName}
                          onChange={(e) => setEditForm((p) => ({ ...p, chairmanName: e.target.value }))}
                          className="w-full rounded border border-gray-300 px-2 py-1 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-white"
                        />
                      ) : (
                        org.chairmanName || <span className="text-gray-400">Не назначен</span>
                      )}
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
                      {editingOrgId === org.id ? (
                        <div className="flex justify-end gap-2">
                          <button
                            onClick={() => saveEdit(org.id)}
                            disabled={isSaving}
                            className="rounded bg-blue-600 px-3 py-1 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                          >
                            Сохранить
                          </button>
                          <button
                            onClick={cancelEdit}
                            className="rounded bg-gray-200 px-3 py-1 text-xs font-medium text-gray-700 hover:bg-gray-300 dark:bg-gray-700 dark:text-gray-300"
                          >
                            Отмена
                          </button>
                        </div>
                      ) : (
                        <div className="flex justify-end gap-2">
                          <button
                            onClick={() => startEdit(org)}
                            className="rounded bg-gray-200 px-3 py-1 text-xs font-medium text-gray-700 hover:bg-gray-300 dark:bg-gray-700 dark:text-gray-300"
                          >
                            Редактировать
                          </button>
                          <button
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
                      )}
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
