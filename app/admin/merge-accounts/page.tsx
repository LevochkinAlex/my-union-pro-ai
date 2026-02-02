"use client";

import { useState, useEffect } from "react";
import Link from "next/link";

interface DuplicateUser {
  id: string;
  email: string | null;
  phone: string | null;
  authPhone: string | null;
  firstName: string | null;
  lastName: string | null;
  createdAt: string;
  _count?: { documents: number; tickets: number };
}

interface DuplicateGroup {
  reason: "phone" | "email" | "phone_history";
  value: string;
  users: DuplicateUser[];
}

const reasonLabels: Record<string, string> = {
  phone: "Один телефон",
  email: "Один email",
  phone_history: "Один номер в истории",
};

export default function MergeAccountsPage() {
  const [groups, setGroups] = useState<DuplicateGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [merging, setMerging] = useState<string | null>(null);
  const [mergeResult, setMergeResult] = useState<{ ok: boolean; message: string } | null>(null);

  const fetchDuplicates = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch("/api/admin/users/duplicates");
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Ошибка загрузки");
      }
      const data = await res.json();
      setGroups(data.groups || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDuplicates();
  }, []);

  const handleMerge = async (targetId: string, sourceId: string) => {
    if (!confirm("Объединить выбранные аккаунты? Аккаунт-источник будет помечен как объединённый, все документы и обращения перейдут в аккаунт-приёмник.")) return;
    try {
      setMerging(`${sourceId}-${targetId}`);
      setMergeResult(null);
      const res = await fetch("/api/admin/users/merge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetUserId: targetId, sourceUserId: sourceId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Ошибка объединения");
      setMergeResult({ ok: true, message: data.message || "Аккаунты объединены" });
      fetchDuplicates();
    } catch (e) {
      setMergeResult({ ok: false, message: e instanceof Error ? e.message : "Ошибка" });
    } finally {
      setMerging(null);
    }
  };

  const userName = (u: DuplicateUser) =>
    [u.lastName, u.firstName].filter(Boolean).join(" ") || "Без имени";

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
            Объединение аккаунтов
          </h1>
          <p className="text-gray-500 dark:text-gray-400 mt-1">
            Группы по одному телефону, email или номеру в истории. Выберите аккаунт-приёмник и объедините дубликаты.
          </p>
        </div>
        <button
          onClick={fetchDuplicates}
          disabled={loading}
          className="px-4 py-2 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 disabled:opacity-50"
        >
          {loading ? "Загрузка…" : "Обновить"}
        </button>
      </div>

      {mergeResult && (
        <div
          className={`p-4 rounded-xl ${
            mergeResult.ok
              ? "bg-green-50 dark:bg-green-900/20 text-green-800 dark:text-green-200"
              : "bg-red-50 dark:bg-red-900/20 text-red-800 dark:text-red-200"
          }`}
        >
          {mergeResult.message}
        </div>
      )}

      {error && (
        <div className="p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl text-red-600 dark:text-red-400">
          {error}
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-12">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-500" />
        </div>
      ) : groups.length === 0 ? (
        <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-8 text-center">
          <p className="text-gray-500 dark:text-gray-400">
            Групп с возможными дубликатами не найдено.
          </p>
          <p className="text-sm text-gray-400 dark:text-gray-500 mt-2">
            Дубликаты определяются по одному телефону, одному email или одному номеру в истории телефонов.
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {groups.map((group, idx) => (
            <div
              key={`${group.reason}-${group.value}-${idx}`}
              className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 overflow-hidden"
            >
              <div className="px-4 py-3 bg-gray-50 dark:bg-gray-700/50 border-b border-gray-200 dark:border-gray-700 flex items-center gap-2">
                <span className="font-medium text-gray-900 dark:text-white">
                  {reasonLabels[group.reason] || group.reason}:
                </span>
                <span className="text-gray-600 dark:text-gray-400 font-mono text-sm">
                  {group.value}
                </span>
              </div>
              <div className="p-4">
                <ul className="space-y-3">
                  {group.users.map((u) => (
                    <li
                      key={u.id}
                      className="flex flex-wrap items-center justify-between gap-4 py-2 border-b border-gray-100 dark:border-gray-700 last:border-0"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-gray-900 dark:text-white">
                          {userName(u)}
                        </div>
                        <div className="text-sm text-gray-500 dark:text-gray-400">
                          {u.email && <span>{u.email}</span>}
                          {(u.phone || u.authPhone) && (
                            <span className="ml-2">{u.phone || u.authPhone}</span>
                          )}
                        </div>
                        <div className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
                          ID: {u.id} · создан:{" "}
                          {new Date(u.createdAt).toLocaleDateString("ru-RU")}
                          {u._count && (
                            <> · документов: {u._count.documents}, обращений: {u._count.tickets}</>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Link
                          href={`/admin/users/${u.id}`}
                          className="text-sm text-blue-600 dark:text-blue-400 hover:underline"
                        >
                          Открыть
                        </Link>
                        {group.users
                          .filter((other) => other.id !== u.id)
                          .map((other) => (
                            <button
                              key={other.id}
                              onClick={() => handleMerge(u.id, other.id)}
                              disabled={!!merging}
                              className="px-3 py-1.5 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded-lg disabled:opacity-50"
                            >
                              {merging === `${u.id}-${other.id}` ? "Объединение…" : `Влить сюда ${userName(other)}`}
                            </button>
                          ))}
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4">
        <h2 className="font-medium text-gray-900 dark:text-white mb-2">Ревизия по номеру</h2>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Проверить аккаунты по конкретному телефону можно скриптом:{" "}
          <code className="bg-gray-100 dark:bg-gray-700 px-1 rounded">npx tsx scripts/audit-phone-accounts.ts +79032911816</code>
        </p>
      </div>
    </div>
  );
}
