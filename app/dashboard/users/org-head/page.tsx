"use client";

import { useEffect, useMemo, useState } from "react";

type Member = {
  id: string;
  firstName: string | null;
  lastName: string | null;
  middleName: string | null;
  email: string | null;
  phone: string | null;
  membershipStatus: string;
  createdAt: string;
  organization?: { id: string; name: string; type: string } | null;
};

export default function OrgHeadUsersPage() {
  const [activeTab, setActiveTab] = useState<"validation" | "active">("validation");
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [search, setSearch] = useState("");

  const filteredMembers = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return members;
    return members.filter((m) => {
      const fio = [m.lastName, m.firstName, m.middleName].filter(Boolean).join(" ").toLowerCase();
      return (
        fio.includes(q) ||
        (m.email || "").toLowerCase().includes(q) ||
        (m.phone || "").toLowerCase().includes(q) ||
        (m.organization?.name || "").toLowerCase().includes(q)
      );
    });
  }, [members, search]);

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true);
        setError(null);
        const status = activeTab === "validation" ? "pending" : "approved";
        const res = await fetch(`/api/org-head/members?status=${status}&limit=100`);
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error || "Ошибка загрузки");
        }
        const data = await res.json();
        setMembers(data.members || []);
      } catch (e: any) {
        setError(e?.message || "Ошибка загрузки");
      } finally {
        setLoading(false);
      }
    };
    load();
    setSelectedIds(new Set());
  }, [activeTab]);

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
      setMembers((prev) => prev.filter((m) => !selectedIds.has(m.id)));
      setSelectedIds(new Set());
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
      setMembers((prev) => prev.filter((m) => !selectedIds.has(m.id)));
      setSelectedIds(new Set());
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Пользователи</h1>
        <p className="mt-1 text-gray-500 dark:text-gray-400">
          Управление участниками по всем организациям в контуре регионалки
        </p>
      </div>

      <div className="border-b border-gray-200 dark:border-gray-700">
        <nav className="-mb-px flex gap-6">
          <button
            onClick={() => setActiveTab("validation")}
            className={`border-b-2 py-3 text-sm font-medium ${
              activeTab === "validation"
                ? "border-blue-500 text-blue-600 dark:text-blue-400"
                : "border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400"
            }`}
          >
            Валидация
          </button>
          <button
            onClick={() => setActiveTab("active")}
            className={`border-b-2 py-3 text-sm font-medium ${
              activeTab === "active"
                ? "border-blue-500 text-blue-600 dark:text-blue-400"
                : "border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400"
            }`}
          >
            Активные
          </button>
        </nav>
      </div>

      <div className="rounded-xl bg-white p-4 shadow-sm dark:bg-gray-800">
        <input
          aria-label="Поиск пользователей"
          title="Поиск пользователей"
          placeholder="Поиск по ФИО, email, телефону, организации"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-white"
        />
      </div>

      {selectedIds.size > 0 && (
        <div className="rounded-xl border border-blue-200 bg-blue-50 p-3 dark:border-blue-800 dark:bg-blue-900/20">
          <div className="flex items-center justify-between gap-3">
            <span className="text-sm font-medium text-blue-700 dark:text-blue-300">
              Выбрано: {selectedIds.size}
            </span>
            <div className="flex gap-2">
              {activeTab === "validation" ? (
                <button
                  onClick={bulkApprove}
                  disabled={isSubmitting}
                  className="rounded bg-green-600 px-3 py-1.5 text-sm text-white hover:bg-green-700 disabled:opacity-50"
                >
                  Одобрить
                </button>
              ) : (
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
                  <th className="px-4 py-3">
                    <input
                      aria-label="Выбрать всех"
                      type="checkbox"
                      checked={filteredMembers.length > 0 && selectedIds.size === filteredMembers.length}
                      onChange={selectAll}
                      className="h-4 w-4 rounded border-gray-300 text-blue-600"
                    />
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-300">
                    ФИО
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-300">
                    Контакты
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-300">
                    Организация
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-300">
                    Дата
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 bg-white dark:divide-gray-700 dark:bg-gray-800">
                {filteredMembers.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-gray-500 dark:text-gray-400">
                      Нет данных
                    </td>
                  </tr>
                ) : (
                  filteredMembers.map((m) => (
                    <tr key={m.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/40">
                      <td className="px-4 py-3">
                        <input
                          aria-label={`Выбрать ${[m.lastName, m.firstName].filter(Boolean).join(" ") || "пользователя"}`}
                          type="checkbox"
                          checked={selectedIds.has(m.id)}
                          onChange={() => toggleSelect(m.id)}
                          className="h-4 w-4 rounded border-gray-300 text-blue-600"
                        />
                      </td>
                      <td className="px-4 py-3 text-sm font-medium text-gray-900 dark:text-white">
                        {[m.lastName, m.firstName, m.middleName].filter(Boolean).join(" ") || "—"}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-300">
                        <div>{m.email || "—"}</div>
                        <div className="text-xs text-gray-500 dark:text-gray-400">{m.phone || ""}</div>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-300">
                        {m.organization?.name || "—"}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-300">
                        {new Date(m.createdAt).toLocaleDateString("ru-RU")}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
