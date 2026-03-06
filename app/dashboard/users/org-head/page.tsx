"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  getMembershipStatusBadgeClass,
  getMembershipStatusLabel,
  getUserRoleLabel,
} from "@/lib/status-labels";

type Member = {
  id: string;
  firstName: string | null;
  lastName: string | null;
  middleName: string | null;
  email: string | null;
  phone: string | null;
  role?: string;
  isPPOHead?: boolean;
  membershipStatus: string;
  unionMembershipStatus?: string | null;
  membershipJoinedAt?: string | null;
  membershipExcludedAt?: string | null;
  membershipExclusionReason?: string | null;
  createdAt: string;
  organization?: { id: string; name: string; type: string } | null;
  documents?: { id: string; type: string; status: string }[];
};

type OrgItem = { id: string; name: string; type: string };

const PAGE_SIZE = 20;
const ORG_TYPE_LABELS: Record<string, string> = {
  PRIMARY: "ППО",
  LOCAL: "МПО",
  REGIONAL: "РПО",
  FEDERAL: "ФПО",
};

type TabKey = "all" | "validation" | "active" | "excluded";

export default function OrgHeadUsersPage() {
  const [activeTab, setActiveTab] = useState<TabKey>("all");
  const [members, setMembers] = useState<Member[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [page, setPage] = useState(1);
  const [searchInput, setSearchInput] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [addUserOpen, setAddUserOpen] = useState(false);
  const [organizations, setOrganizations] = useState<OrgItem[]>([]);
  const [addUserLoadingOrgs, setAddUserLoadingOrgs] = useState(false);
  const [addUserSubmitting, setAddUserSubmitting] = useState(false);
  const [addUserMessage, setAddUserMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [addUserForm, setAddUserForm] = useState({
    email: "",
    phone: "",
    firstName: "",
    lastName: "",
    middleName: "",
    jobTitle: "",
    organizationId: "",
    isChairman: false,
  });
  const [membersReloadKey, setMembersReloadKey] = useState(0);

  const loadMembers = useCallback(async (tab: TabKey, pageNum: number, q: string) => {
    setLoading(true);
    setError(null);
    try {
      const statusMap: Record<TabKey, string> = {
        all: "all",
        validation: "pending",
        active: "approved",
        excluded: "excluded",
      };
      const params = new URLSearchParams();
      params.set("status", statusMap[tab]);
      params.set("page", String(pageNum));
      params.set("limit", String(PAGE_SIZE));
      if (q.trim()) params.set("q", q.trim());
      const res = await fetch(`/api/org-head/members?${params.toString()}`);
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Ошибка загрузки");
      }
      const data = await res.json();
      setMembers(data.members || []);
      setTotal(data.total ?? 0);
      setTotalPages(data.totalPages ?? 1);
      setPage(data.page ?? pageNum);
    } catch (e: any) {
      setError(e?.message || "Ошибка загрузки");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadMembers(activeTab, page, searchQuery);
    setSelectedIds(new Set());
  }, [activeTab, page, searchQuery, membersReloadKey, loadMembers]);

  const filteredMembers = useMemo(() => members, [members]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSearchQuery(searchInput.trim());
    setPage(1);
  };

  useEffect(() => {
    if (!addUserOpen) return;
    setAddUserLoadingOrgs(true);
    setAddUserMessage(null);
    fetch("/api/org-head/organizations")
      .then((r) => r.json())
      .then((data) => {
        const list = data.organizations || [];
        setOrganizations(list);
        const firstPpo = list.find((o: OrgItem) => o.type === "PRIMARY");
        setAddUserForm((f) => ({ ...f, organizationId: f.organizationId || firstPpo?.id || list[0]?.id || "" }));
      })
      .catch(() => setOrganizations([]))
      .finally(() => setAddUserLoadingOrgs(false));
  }, [addUserOpen]);

  const ppoOrganizations = useMemo(
    () => organizations.filter((o) => o.type === "PRIMARY"),
    [organizations]
  );

  const handleAddUserSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAddUserMessage(null);
    if (!addUserForm.email.trim() || !addUserForm.firstName.trim() || !addUserForm.lastName.trim()) {
      setAddUserMessage({ type: "error", text: "Заполните email, имя и фамилию" });
      return;
    }
    if (!addUserForm.organizationId) {
      setAddUserMessage({ type: "error", text: "Выберите организацию" });
      return;
    }
    if (addUserForm.isChairman && !ppoOrganizations.some((o) => o.id === addUserForm.organizationId)) {
      setAddUserMessage({ type: "error", text: "Для председателя ППО выберите первичную организацию (ППО)" });
      return;
    }
    setAddUserSubmitting(true);
    try {
      const res = await fetch("/api/org-head/invite-user", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: addUserForm.email.trim(),
          phone: addUserForm.phone.trim() || null,
          firstName: addUserForm.firstName.trim(),
          lastName: addUserForm.lastName.trim(),
          middleName: addUserForm.middleName.trim() || null,
          jobTitle: addUserForm.jobTitle.trim() || null,
          organizationId: addUserForm.organizationId,
          isChairman: addUserForm.isChairman,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setAddUserMessage({ type: "error", text: data.error || "Ошибка при добавлении" });
        return;
      }
      setAddUserMessage({ type: "success", text: data.message || "Готово" });
      setMembersReloadKey((k) => k + 1);
      setAddUserForm({
        email: "",
        phone: "",
        firstName: "",
        lastName: "",
        middleName: "",
        jobTitle: "",
        organizationId: ppoOrganizations[0]?.id || organizations[0]?.id || "",
        isChairman: false,
      });
      setTimeout(() => {
        setAddUserOpen(false);
        setAddUserMessage(null);
      }, 2000);
    } catch {
      setAddUserMessage({ type: "error", text: "Ошибка сети" });
    } finally {
      setAddUserSubmitting(false);
    }
  };

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const copy = new Set(prev);
      if (copy.has(id)) copy.delete(id);
      else copy.add(id);
      return copy;
    });
  };

  const selectAll = () => {
    if (selectedIds.size === filteredMembers.length) {
      setSelectedIds(new Set());
      return;
    }
    setSelectedIds(new Set(filteredMembers.map((m) => m.id)));
  };

  const bulkApprove = async () => {
    if (selectedIds.size === 0) return;
    setIsSubmitting(true);
    try {
      const ids = Array.from(selectedIds);
      for (const id of ids) {
        await fetch(`/api/org-head/members/${id}/approve`, { method: "POST" });
      }
      setSelectedIds(new Set());
      loadMembers(activeTab, page, searchQuery);
    } finally {
      setIsSubmitting(false);
    }
  };

  const bulkExclude = async () => {
    if (selectedIds.size === 0) return;
    const confirmed = window.confirm(`Исключить ${selectedIds.size} пользователей?`);
    if (!confirmed) return;
    setIsSubmitting(true);
    try {
      const ids = Array.from(selectedIds);
      for (const id of ids) {
        await fetch(`/api/org-head/members/${id}/exclude`, { method: "POST" });
      }
      setSelectedIds(new Set());
      loadMembers(activeTab, page, searchQuery);
    } finally {
      setIsSubmitting(false);
    }
  };

  const bulkReject = async () => {
    if (selectedIds.size === 0) return;
    const reason = window.prompt("Причина отклонения:");
    if (!reason?.trim()) return;
    setIsSubmitting(true);
    try {
      const ids = Array.from(selectedIds);
      for (const id of ids) {
        await fetch(`/api/org-head/members/${id}/reject`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ reason: reason.trim() }),
        });
      }
      setSelectedIds(new Set());
      loadMembers(activeTab, page, searchQuery);
    } finally {
      setIsSubmitting(false);
    }
  };

  const effectiveStatus = (m: Member) =>
    m.unionMembershipStatus === "ACCEPTED"
      ? "ACCEPTED"
      : m.unionMembershipStatus === "REMOVED"
        ? "REMOVED"
        : m.membershipStatus;

  const tabCounts = activeTab === "all" ? ` (${total})` : "";

  const tabs: { key: TabKey; label: string }[] = [
    { key: "all", label: "Все" },
    { key: "validation", label: "На проверке" },
    { key: "active", label: "Активные" },
    { key: "excluded", label: "Исключённые / Отклонённые" },
  ];

  const showCheckboxes = activeTab === "validation" || activeTab === "active";

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-white p-4 shadow-sm dark:bg-gray-800">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Пользователи</h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Управление участниками по всем организациям в контуре
          </p>
        </div>
        <button
          type="button"
          onClick={() => setAddUserOpen(true)}
          className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600"
        >
          + Пользователя
        </button>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200 dark:border-gray-700">
        <nav className="-mb-px flex gap-4 overflow-x-auto">
          {tabs.map((t) => (
            <button
              key={t.key}
              onClick={() => { setActiveTab(t.key); setPage(1); }}
              className={`whitespace-nowrap border-b-2 py-3 text-sm font-medium ${
                activeTab === t.key
                  ? "border-blue-500 text-blue-600 dark:text-blue-400"
                  : "border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400"
              }`}
            >
              {t.label}
            </button>
          ))}
        </nav>
      </div>

      {/* Search */}
      <form onSubmit={handleSearchSubmit} className="rounded-xl bg-white p-4 shadow-sm dark:bg-gray-800">
        <div className="flex flex-wrap items-center gap-2">
          <input
            aria-label="Поиск пользователей"
            placeholder="Поиск по ФИО, email, телефону, должности"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            className="min-w-[200px] flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-white"
          />
          <button
            type="submit"
            className="rounded-lg bg-gray-200 px-4 py-2 text-sm font-medium text-gray-800 hover:bg-gray-300 dark:bg-gray-600 dark:text-white dark:hover:bg-gray-500"
          >
            Найти
          </button>
          {searchQuery && (
            <button
              type="button"
              onClick={() => { setSearchInput(""); setSearchQuery(""); setPage(1); }}
              className="rounded-lg px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-700"
            >
              Сбросить
            </button>
          )}
        </div>
      </form>

      {/* Bulk actions */}
      {selectedIds.size > 0 && showCheckboxes && (
        <div className="rounded-xl border border-blue-200 bg-blue-50 p-3 dark:border-blue-800 dark:bg-blue-900/20">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span className="text-sm font-medium text-blue-700 dark:text-blue-300">
              Выбрано: {selectedIds.size}
            </span>
            <div className="flex gap-2">
              {activeTab === "validation" && (
                <>
                  <button
                    onClick={bulkApprove}
                    disabled={isSubmitting}
                    className="rounded bg-green-600 px-3 py-1.5 text-sm text-white hover:bg-green-700 disabled:opacity-50"
                  >
                    Одобрить
                  </button>
                  <button
                    onClick={bulkReject}
                    disabled={isSubmitting}
                    className="rounded bg-red-600 px-3 py-1.5 text-sm text-white hover:bg-red-700 disabled:opacity-50"
                  >
                    Отклонить
                  </button>
                </>
              )}
              {activeTab === "active" && (
                <button
                  onClick={bulkExclude}
                  disabled={isSubmitting}
                  className="rounded bg-red-600 px-3 py-1.5 text-sm text-white hover:bg-red-700 disabled:opacity-50"
                >
                  Исключить
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Table */}
      {loading ? (
        <div className="rounded-xl bg-white p-8 text-center text-gray-500 shadow-sm dark:bg-gray-800 dark:text-gray-400">
          Загрузка...
        </div>
      ) : error ? (
        <div className="rounded-xl bg-red-50 p-4 text-red-700 dark:bg-red-900/20 dark:text-red-300">{error}</div>
      ) : (
        <div className="overflow-hidden rounded-xl bg-white shadow-sm dark:bg-gray-800">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
              <thead className="bg-gray-50 dark:bg-gray-700">
                <tr>
                  {showCheckboxes && (
                    <th className="px-4 py-3 w-10">
                      <input
                        aria-label="Выбрать всех"
                        type="checkbox"
                        checked={filteredMembers.length > 0 && selectedIds.size === filteredMembers.length}
                        onChange={selectAll}
                        className="h-4 w-4 rounded border-gray-300 text-blue-600"
                      />
                    </th>
                  )}
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-300">
                    Пользователь
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-300">
                    Организация
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-300">
                    Статус
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-300">
                    Дата
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-300">
                    Действия
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 bg-white dark:divide-gray-700 dark:bg-gray-800">
                {filteredMembers.length === 0 ? (
                  <tr>
                    <td colSpan={showCheckboxes ? 6 : 5} className="px-4 py-8 text-center text-gray-500 dark:text-gray-400">
                      Нет данных
                    </td>
                  </tr>
                ) : (
                  filteredMembers.map((m) => {
                    const status = effectiveStatus(m);
                    const fio = [m.lastName, m.firstName, m.middleName].filter(Boolean).join(" ") || "—";
                    return (
                      <tr key={m.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/40">
                        {showCheckboxes && (
                          <td className="px-4 py-3 w-10">
                            <input
                              aria-label={`Выбрать ${fio}`}
                              type="checkbox"
                              checked={selectedIds.has(m.id)}
                              onChange={() => toggleSelect(m.id)}
                              className="h-4 w-4 rounded border-gray-300 text-blue-600"
                            />
                          </td>
                        )}
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-3">
                            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-blue-100 text-xs font-semibold text-blue-700 dark:bg-blue-900/30 dark:text-blue-300">
                              {(m.lastName?.[0] || m.firstName?.[0] || "?").toUpperCase()}
                            </div>
                            <div className="min-w-0">
                              <Link
                                href={`/dashboard/users/org-head/${m.id}`}
                                className="block truncate text-sm font-medium text-gray-900 hover:text-blue-600 dark:text-white dark:hover:text-blue-400"
                              >
                                {fio}
                              </Link>
                              <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                                {m.email && <span className="truncate">{m.email}</span>}
                                {m.email && m.phone && <span>·</span>}
                                {m.phone && <span>{m.phone}</span>}
                              </div>
                              <span className="text-xs text-gray-400 dark:text-gray-500">
                                {getUserRoleLabel(m.role, m.isPPOHead)}
                              </span>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-300">
                          <div className="truncate max-w-[200px]">{m.organization?.name || "—"}</div>
                          {m.organization?.type && (
                            <span className="text-xs text-gray-400 dark:text-gray-500">
                              {ORG_TYPE_LABELS[m.organization.type] || m.organization.type}
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${getMembershipStatusBadgeClass(status)}`}>
                            {getMembershipStatusLabel(status)}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400 whitespace-nowrap">
                          {m.membershipJoinedAt
                            ? new Date(m.membershipJoinedAt).toLocaleDateString("ru-RU")
                            : new Date(m.createdAt).toLocaleDateString("ru-RU")}
                          <div className="text-xs text-gray-400">
                            {m.membershipJoinedAt ? "вступил" : "регистрация"}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="flex items-center justify-end gap-1">
                            <Link
                              href={`/dashboard/users/org-head/${m.id}`}
                              className="rounded-md px-2.5 py-1.5 text-xs font-medium text-blue-600 hover:bg-blue-50 dark:text-blue-400 dark:hover:bg-blue-900/20"
                            >
                              Открыть
                            </Link>
                            <a
                              href={`/api/org-head/members/${m.id}/pdf`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="rounded-md px-2.5 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-700"
                              title="Скачать PDF анкету"
                            >
                              PDF
                            </a>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Pagination */}
      {!loading && totalPages > 1 && (
        <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl bg-white p-3 shadow-sm dark:bg-gray-800">
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Показано {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, total)} из {total}
          </p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setPage(Math.max(1, page - 1))}
              disabled={page <= 1}
              className="inline-flex items-center gap-1 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:pointer-events-none disabled:opacity-50 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600"
            >
              Назад
            </button>
            <span className="px-3 py-2 text-sm text-gray-700 dark:text-gray-300">
              {page} / {totalPages}
            </span>
            <button
              type="button"
              onClick={() => setPage(Math.min(totalPages, page + 1))}
              disabled={page >= totalPages}
              className="inline-flex items-center gap-1 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:pointer-events-none disabled:opacity-50 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600"
            >
              Вперёд
            </button>
          </div>
        </div>
      )}

      {/* Add user modal */}
      {addUserOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/50 p-4" onClick={() => !addUserSubmitting && setAddUserOpen(false)}>
          <div
            className="my-auto flex max-h-[90vh] w-full max-w-lg flex-col rounded-xl bg-white shadow-xl dark:bg-gray-800"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="shrink-0 border-b border-gray-200 p-4 dark:border-gray-700">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Добавить пользователя</h2>
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                Приглашение по email. Можно назначить председателя ППО.
              </p>
            </div>
            <form onSubmit={handleAddUserSubmit} className="flex min-h-0 flex-1 flex-col">
              <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">Email <span className="text-red-500">*</span></label>
                <input
                  type="email"
                  required
                  value={addUserForm.email}
                  onChange={(e) => setAddUserForm((f) => ({ ...f, email: e.target.value }))}
                  placeholder="user@example.com"
                  className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-gray-900 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">Телефон</label>
                <input
                  type="tel"
                  value={addUserForm.phone}
                  onChange={(e) => setAddUserForm((f) => ({ ...f, phone: e.target.value }))}
                  placeholder="+7 900 123-45-67"
                  className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-gray-900 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">Фамилия <span className="text-red-500">*</span></label>
                  <input
                    type="text"
                    required
                    value={addUserForm.lastName}
                    onChange={(e) => setAddUserForm((f) => ({ ...f, lastName: e.target.value }))}
                    placeholder="Иванов"
                    className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-gray-900 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">Имя <span className="text-red-500">*</span></label>
                  <input
                    type="text"
                    required
                    value={addUserForm.firstName}
                    onChange={(e) => setAddUserForm((f) => ({ ...f, firstName: e.target.value }))}
                    placeholder="Иван"
                    className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-gray-900 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
                  />
                </div>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">Отчество</label>
                <input
                  type="text"
                  value={addUserForm.middleName}
                  onChange={(e) => setAddUserForm((f) => ({ ...f, middleName: e.target.value }))}
                  placeholder="Петрович"
                  className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-gray-900 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">Должность</label>
                <input
                  type="text"
                  value={addUserForm.jobTitle}
                  onChange={(e) => setAddUserForm((f) => ({ ...f, jobTitle: e.target.value }))}
                  placeholder="Председатель профкома"
                  className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-gray-900 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">Организация <span className="text-red-500">*</span></label>
                <select
                  required
                  aria-label="Выберите организацию"
                  value={addUserForm.organizationId}
                  onChange={(e) => setAddUserForm((f) => ({ ...f, organizationId: e.target.value }))}
                  className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-gray-900 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
                  disabled={addUserLoadingOrgs}
                >
                  <option value="">— Выберите организацию —</option>
                  {organizations.map((org) => (
                    <option key={org.id} value={org.id}>
                      {org.name} {ORG_TYPE_LABELS[org.type] ? `(${ORG_TYPE_LABELS[org.type]})` : ""}
                    </option>
                  ))}
                </select>
              </div>
              <label className="flex cursor-pointer items-center gap-2">
                <input
                  type="checkbox"
                  checked={addUserForm.isChairman}
                  onChange={(e) => setAddUserForm((f) => ({ ...f, isChairman: e.target.checked }))}
                  className="h-4 w-4 rounded border-gray-300 text-blue-600"
                />
                <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Является Председателем ППО</span>
              </label>
              </div>
              <div className="shrink-0 border-t border-gray-200 p-4 dark:border-gray-700">
                {addUserMessage && (
                  <div
                    className={`mb-3 rounded-lg px-3 py-2 text-sm ${
                      addUserMessage.type === "success"
                        ? "bg-green-50 text-green-800 dark:bg-green-900/20 dark:text-green-300"
                        : "bg-red-50 text-red-800 dark:bg-red-900/20 dark:text-red-300"
                    }`}
                  >
                    {addUserMessage.text}
                  </div>
                )}
                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => !addUserSubmitting && setAddUserOpen(false)}
                    className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600"
                  >
                    Отмена
                  </button>
                  <button
                    type="submit"
                    disabled={addUserSubmitting}
                    className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                  >
                    {addUserSubmitting ? "Отправка…" : "Добавить"}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
