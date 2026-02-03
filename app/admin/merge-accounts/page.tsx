"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Modal } from "@/components/ui/modal";

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

function userName(u: DuplicateUser) {
  return [u.lastName, u.firstName].filter(Boolean).join(" ") || "Без имени";
}

export default function MergeAccountsPage() {
  const [groups, setGroups] = useState<DuplicateGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [merging, setMerging] = useState(false);
  const [mergeResult, setMergeResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [modalGroup, setModalGroup] = useState<DuplicateGroup | null>(null);
  const [mainUserId, setMainUserId] = useState<string | null>(null);

  const fetchDuplicates = async () => {
    try {
      setLoading(true);
      setError(null);
      setMergeResult(null);
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

  const openMergeModal = (group: DuplicateGroup) => {
    setModalGroup(group);
    setMainUserId(null);
    setMergeResult(null);
  };

  const closeMergeModal = () => {
    setModalGroup(null);
    setMainUserId(null);
  };

  const handleMergeIntoMain = async () => {
    if (!modalGroup || !mainUserId) return;
    const others = modalGroup.users.filter((u) => u.id !== mainUserId);
    if (others.length === 0) return;
    try {
      setMerging(true);
      setMergeResult(null);
      for (const other of others) {
        const res = await fetch("/api/admin/users/merge", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ targetUserId: mainUserId, sourceUserId: other.id }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Ошибка объединения");
      }
      setMergeResult({ ok: true, message: "Аккаунты объединены. Данные из дубликатов перенесены в основной." });
      await fetchDuplicates();
      closeMergeModal();
    } catch (e) {
      setMergeResult({ ok: false, message: e instanceof Error ? e.message : "Ошибка" });
    } finally {
      setMerging(false);
    }
  };

  const totalDuplicateAccounts = groups.reduce((acc, g) => acc + g.users.length, 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
            Объединение аккаунтов
          </h1>
          <p className="mt-1 text-gray-500 dark:text-gray-400">
            Маркеры дубликатов: <strong>телефон</strong> и <strong>email</strong>. Выберите основной аккаунт — в него перетекут данные из дубликатов (в т.ч. недостающие поля профиля).
          </p>
        </div>
        <button
          type="button"
          onClick={fetchDuplicates}
          disabled={loading}
          className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:opacity-50"
        >
          {loading ? (
            <>
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
              Поиск…
            </>
          ) : (
            "Поиск дубликатов"
          )}
        </button>
      </div>

      {!loading && groups.length > 0 && (
        <p className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-2 text-sm text-blue-800 dark:border-blue-800 dark:bg-blue-900/20 dark:text-blue-200">
          Найдено <strong>{groups.length}</strong> {groups.length === 1 ? "группа" : "групп"} дубликатов ({totalDuplicateAccounts} аккаунтов).
        </p>
      )}

      {mergeResult && (
        <div
          className={`rounded-xl p-4 ${
            mergeResult.ok
              ? "bg-green-50 dark:bg-green-900/20 text-green-800 dark:text-green-200"
              : "bg-red-50 dark:bg-red-900/20 text-red-800 dark:text-red-200"
          }`}
        >
          {mergeResult.message}
        </div>
      )}

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-red-600 dark:border-red-800 dark:bg-red-900/20 dark:text-red-400">
          {error}
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-12">
          <div className="h-10 w-10 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
        </div>
      ) : groups.length === 0 ? (
        <div className="rounded-xl border border-gray-200 bg-white p-8 text-center dark:border-gray-700 dark:bg-gray-800">
          <p className="text-gray-500 dark:text-gray-400">
            Групп с возможными дубликатами не найдено.
          </p>
          <p className="mt-2 text-sm text-gray-400 dark:text-gray-500">
            Дубликаты определяются по одному телефону, одному email или одному номеру в истории телефонов.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {groups.map((group, idx) => (
            <div
              key={`${group.reason}-${group.value}-${idx}`}
              className="rounded-xl border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800 overflow-hidden"
            >
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-200 px-4 py-3 dark:border-gray-700 sm:flex-nowrap">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-gray-900 dark:text-white">
                    {reasonLabels[group.reason] ?? group.reason}:
                  </span>
                  <span className="font-mono text-sm text-gray-600 dark:text-gray-400">
                    {group.value}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => openMergeModal(group)}
                  className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
                >
                  Объединить ({group.users.length})
                </button>
              </div>
              <div className="p-4">
                <ul className="flex flex-wrap gap-2">
                  {group.users.map((u) => (
                    <li
                      key={u.id}
                      className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-700/50"
                    >
                      <span className="font-medium text-gray-900 dark:text-white">{userName(u)}</span>
                      <span className="ml-2 text-gray-500 dark:text-gray-400">
                        {[u.email, u.phone ?? u.authPhone].filter(Boolean).join(" · ") || "—"}
                      </span>
                      {u._count && (
                        <span className="ml-2 text-xs text-gray-400 dark:text-gray-500">
                          док: {u._count.documents}, обр: {u._count.tickets}
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Модалка выбора основного аккаунта и объединения (как в Битрикс24) */}
      <Modal
        isOpen={!!modalGroup}
        onClose={closeMergeModal}
        className="max-w-4xl max-h-[90vh] flex flex-col"
      >
        {modalGroup && (
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
            <div className="shrink-0 border-b border-gray-200 p-4 dark:border-gray-700">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                Объединение: {reasonLabels[modalGroup.reason]} — {modalGroup.value}
              </h2>
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                Выберите основной аккаунт (клик по карточке) — в него перетекут данные из остальных. Будут перенесены документы, обращения и недостающие поля профиля.
              </p>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto p-4">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {modalGroup.users.map((u) => (
                  <button
                    key={u.id}
                    type="button"
                    onClick={() => setMainUserId(u.id)}
                    className={`flex flex-col rounded-xl border-2 p-4 text-left transition-all ${
                      mainUserId === u.id
                        ? "border-blue-500 bg-blue-50 ring-2 ring-blue-500/30 dark:bg-blue-900/20 dark:ring-blue-400/30"
                        : "border-gray-200 bg-white hover:border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:hover:border-gray-500"
                    }`}
                  >
                    <div className="mb-2 flex items-center justify-between">
                      <span className="font-semibold text-gray-900 dark:text-white">
                        {userName(u)}
                      </span>
                      {mainUserId === u.id && (
                        <span className="rounded bg-blue-600 px-2 py-0.5 text-xs font-medium text-white">
                          Основной
                        </span>
                      )}
                    </div>
                    <div className="text-sm text-gray-500 dark:text-gray-400">
                      {u.email && <div>{u.email}</div>}
                      {(u.phone || u.authPhone) && (
                        <div>{u.phone ?? u.authPhone}</div>
                      )}
                    </div>
                    <div className="mt-2 text-xs text-gray-400 dark:text-gray-500">
                      ID: {u.id.slice(0, 8)}… · создан {new Date(u.createdAt).toLocaleDateString("ru-RU")}
                      {u._count && (
                        <> · док: {u._count.documents}, обр: {u._count.tickets}</>
                      )}
                    </div>
                    <Link
                      href={`/admin/users/${u.id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      className="mt-2 text-xs text-blue-600 hover:underline dark:text-blue-400"
                    >
                      Открыть профиль →
                    </Link>
                  </button>
                ))}
              </div>
            </div>
            <div className="flex shrink-0 items-center justify-between gap-4 border-t border-gray-200 p-4 dark:border-gray-700">
              <p className="text-sm text-gray-500 dark:text-gray-400">
                {mainUserId ? "Выбран основной аккаунт. Нажмите «Объединить в выбранный»." : "Кликните по карточке основного аккаунта."}
              </p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={closeMergeModal}
                  className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
                >
                  Отмена
                </button>
                <button
                  type="button"
                  onClick={handleMergeIntoMain}
                  disabled={!mainUserId || merging}
                  className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                >
                  {merging ? "Объединение…" : "Объединить в выбранный"}
                </button>
              </div>
            </div>
            {mergeResult && !mergeResult.ok && (
              <div className="mx-4 mb-4 rounded-lg bg-red-100 p-3 text-sm text-red-800 dark:bg-red-900/30 dark:text-red-200">
                {mergeResult.message}
              </div>
            )}
          </div>
        )}
      </Modal>

      <div className="rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
        <h2 className="mb-2 font-medium text-gray-900 dark:text-white">Ревизия по номеру</h2>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Проверить аккаунты по конкретному телефону можно скриптом:{" "}
          <code className="rounded bg-gray-100 px-1 dark:bg-gray-700">npx tsx scripts/audit-phone-accounts.ts +79032911816</code>
        </p>
      </div>
    </div>
  );
}
