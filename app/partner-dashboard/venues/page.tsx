"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { adminTableActionOutlineClass } from "@/lib/admin-table-action-styles";
import { useTouchStickyRowSelection } from "@/lib/use-touch-sticky-row-selection";

interface Venue {
  id: string;
  name: string;
  city: string | null;
  promoCode: string | null;
  isActive: boolean;
}

export default function PartnerVenuesPage() {
  const [venues, setVenues] = useState<Venue[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const touchRow = useTouchStickyRowSelection();

  const fetchVenues = useCallback(async () => {
    setLoadError(null);
    try {
      const res = await fetch("/api/partner/venues");
      if (res.ok) {
        const data = await res.json();
        setVenues(data.venues ?? data);
        return;
      }
      let message = "Не удалось загрузить площадки";
      try {
        const data = await res.json();
        if (typeof data?.error === "string" && data.error) message = data.error;
      } catch {
        /* ignore */
      }
      setVenues([]);
      setLoadError(message);
    } catch {
      setVenues([]);
      setLoadError("Ошибка сети");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchVenues();
  }, [fetchVenues]);

  return (
    <div className="w-full min-w-0 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
          Мои площадки
        </h1>
        <Link
          href="/partner-dashboard/venues/new"
          className="inline-flex items-center justify-center rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700 transition-colors"
        >
          Добавить площадку
        </Link>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-600 border-t-transparent" />
        </div>
      ) : loadError ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-sm text-red-800 dark:border-red-900/40 dark:bg-red-950/30 dark:text-red-200">
          <p className="font-medium">{loadError}</p>
          <p className="mt-2 text-red-700 dark:text-red-300">
            Если вы недавно обновляли проект, выполните на сервере:{" "}
            <code className="rounded bg-red-100 px-1 py-0.5 text-xs dark:bg-red-900/50">npx prisma migrate deploy</code>
          </p>
          <button
            type="button"
            onClick={() => {
              setLoading(true);
              fetchVenues();
            }}
            className="mt-4 rounded-lg border border-red-300 bg-white px-3 py-1.5 text-sm font-medium text-red-800 hover:bg-red-50 dark:border-red-800 dark:bg-gray-900 dark:text-red-200 dark:hover:bg-red-950/40"
          >
            Повторить
          </button>
        </div>
      ) : venues.length === 0 ? (
        <div className="rounded-xl border border-gray-200 bg-white p-8 text-center shadow-sm dark:border-gray-700 dark:bg-gray-800">
          <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
          </svg>
          <p className="mt-4 text-gray-500 dark:text-gray-400">
            У вас пока нет площадок.
          </p>
          <Link
            href="/partner-dashboard/venues/new"
            className="mt-4 inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 transition-colors"
          >
            Создать первую площадку
          </Link>
        </div>
      ) : (
        <div
          ref={touchRow.containerRef}
          className="w-full max-w-full min-w-0 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-800"
        >
          {/* Desktop table */}
          <div className="hidden w-full min-w-0 max-h-[min(75dvh,720px)] overflow-x-auto overflow-y-auto overscroll-contain [-webkit-overflow-scrolling:touch] sm:block">
            <table className="w-full table-auto divide-y divide-gray-200 dark:divide-gray-700">
              <thead className="sticky top-0 z-10 bg-gray-50 shadow-sm dark:bg-gray-800/95 dark:shadow-none">
                <tr>
                  <th className="min-w-0 px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
                    Название
                  </th>
                  <th className="w-px whitespace-nowrap px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
                    Город
                  </th>
                  <th className="w-px whitespace-nowrap px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
                    Промокод
                  </th>
                  <th className="w-px whitespace-nowrap px-4 py-3 text-center text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
                    Статус
                  </th>
                  <th className="w-px whitespace-nowrap px-4 py-3 text-center text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
                    Действия
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                {venues.map((venue) => (
                  <tr
                    key={venue.id}
                    className={touchRow.getRowClassName(venue.id)}
                    onClick={(e) => touchRow.handleRowClick(e, venue.id)}
                  >
                    <td className="min-w-0 px-4 py-3 align-top text-sm font-medium break-words text-gray-900 dark:text-white">
                      {venue.name}
                    </td>
                    <td className="w-px whitespace-nowrap px-4 py-3 text-sm text-gray-500 dark:text-gray-400">
                      {venue.city || "—"}
                    </td>
                    <td className="w-px whitespace-nowrap px-4 py-3 text-sm text-gray-500 dark:text-gray-400">
                      {venue.promoCode ? (
                        <code className="rounded bg-gray-100 px-1.5 py-0.5 text-xs font-mono dark:bg-gray-700">
                          {venue.promoCode}
                        </code>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="w-px whitespace-nowrap px-4 py-3 text-center text-sm">
                      {venue.isActive ? (
                        <span className="inline-flex rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-800 dark:bg-green-900/30 dark:text-green-400">
                          Активна
                        </span>
                      ) : (
                        <span className="inline-flex rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-900 dark:bg-amber-950/40 dark:text-amber-300">
                          Неактивна
                        </span>
                      )}
                    </td>
                    <td className="w-px whitespace-nowrap px-4 py-3 text-center text-sm">
                      <Link href={`/partner-dashboard/venues/${venue.id}`} className={adminTableActionOutlineClass}>
                        Редактировать
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile cards */}
          <div className="max-h-[min(75dvh,720px)] overflow-y-auto overscroll-contain [-webkit-overflow-scrolling:touch] sm:hidden divide-y divide-gray-200 dark:divide-gray-700">
            {venues.map((venue) => (
              <div
                key={venue.id}
                className={touchRow.getRowClassName(venue.id, "space-y-2 p-4")}
                onClick={(e) => touchRow.handleRowClick(e, venue.id)}
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="font-medium text-gray-900 dark:text-white">{venue.name}</p>
                  {venue.isActive ? (
                    <span className="inline-flex shrink-0 rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-800 dark:bg-green-900/30 dark:text-green-400">
                      Активна
                    </span>
                  ) : (
                    <span className="inline-flex shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-900 dark:bg-amber-950/40 dark:text-amber-300">
                      Неактивна
                    </span>
                  )}
                </div>
                {venue.city && (
                  <p className="text-sm text-gray-500 dark:text-gray-400">{venue.city}</p>
                )}
                {venue.promoCode && (
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    Промокод:{" "}
                    <code className="rounded bg-gray-100 px-1.5 py-0.5 text-xs font-mono dark:bg-gray-700">
                      {venue.promoCode}
                    </code>
                  </p>
                )}
                <Link href={`/partner-dashboard/venues/${venue.id}`} className={adminTableActionOutlineClass}>
                  Редактировать
                </Link>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
