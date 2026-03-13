"use client";

import React, { useState, useEffect } from "react";

interface InvoiceItem {
  id: string;
  organizationId: string;
  organizationName: string | null;
  offerNumber: string;
  amountRub: number;
  period: string;
  periodLabel: string;
  memberLimit: number;
  tariffLabel: string;
  createdAt: string;
}

export default function AdminInvoicesPage() {
  const [invoices, setInvoices] = useState<InvoiceItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [offerFilter, setOfferFilter] = useState("");
  const [skip, setSkip] = useState(0);
  const limit = 30;

  const load = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ limit: String(limit), skip: String(skip) });
      if (offerFilter.trim()) params.set("offerNumber", offerFilter.trim());
      const res = await fetch(`/api/admin/subscription/invoices?${params}`);
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      setInvoices(data.invoices ?? []);
      setTotal(data.total ?? 0);
    } catch (e) {
      console.error(e);
      setInvoices([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [skip, offerFilter]);

  const onSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setSkip(0);
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Выставленные счета-оферты</h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Все счета, сгенерированные председателями в разделе «Подписка». По номеру счёта можно найти, кто и на какой тариф получил оферту.
        </p>
      </div>

      <form onSubmit={onSearch} className="flex flex-wrap items-center gap-2">
        <input
          type="text"
          placeholder="Номер счёта (MYU-...)"
          value={offerFilter}
          onChange={(e) => setOfferFilter(e.target.value)}
          className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-800 dark:text-white"
        />
        <button
          type="submit"
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          Найти
        </button>
        <button
          type="button"
          onClick={() => { setOfferFilter(""); setSkip(0); }}
          className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm dark:border-gray-600 dark:bg-gray-800 dark:text-white"
        >
          Сбросить
        </button>
      </form>

      {loading ? (
        <div className="flex justify-center py-8">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-500 border-r-transparent" />
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800">
          <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
            <thead className="bg-gray-50 dark:bg-gray-700">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-300">
                  № счёта
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-300">
                  Организация
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-300">
                  Сумма, ₽
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-300">
                  Период
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-300">
                  Участников
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-300">
                  Тариф
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-300">
                  Дата
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
              {invoices.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-sm text-gray-500 dark:text-gray-400">
                    {offerFilter ? "Ни одного счёта не найдено" : "Счета ещё не выставлялись"}
                  </td>
                </tr>
              ) : (
                invoices.map((inv) => (
                  <tr key={inv.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                    <td className="whitespace-nowrap px-4 py-3 text-sm font-medium text-gray-900 dark:text-white">
                      {inv.offerNumber}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">
                      {inv.organizationName ?? "—"}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-900 dark:text-white">
                      {inv.amountRub.toLocaleString("ru-RU")}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-600 dark:text-gray-400">
                      {inv.periodLabel}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-600 dark:text-gray-400">
                      {inv.memberLimit}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">
                      {inv.tariffLabel}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-500 dark:text-gray-400">
                      {new Date(inv.createdAt).toLocaleString("ru-RU")}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {total > limit && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Показано {invoices.length} из {total}
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={skip === 0}
              onClick={() => setSkip((s) => Math.max(0, s - limit))}
              className="rounded border border-gray-300 bg-white px-3 py-1 text-sm disabled:opacity-50 dark:border-gray-600 dark:bg-gray-800"
            >
              Назад
            </button>
            <button
              type="button"
              disabled={skip + limit >= total}
              onClick={() => setSkip((s) => s + limit)}
              className="rounded border border-gray-300 bg-white px-3 py-1 text-sm disabled:opacity-50 dark:border-gray-600 dark:bg-gray-800"
            >
              Вперёд
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
