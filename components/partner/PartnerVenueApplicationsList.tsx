"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { dispatchPartnerApplicationsNewRefresh } from "@/components/dashboard/PartnerApplicationsNewBadge";
import { adminTableActionOutlineClass } from "@/lib/admin-table-action-styles";
import { useTouchStickyRowSelection } from "@/lib/use-touch-sticky-row-selection";

export type ApplicationVenueRow = {
  id: string;
  name: string;
  city: string | null;
  promoCode?: string | null;
  isActive?: boolean;
  partnerName?: string | null;
  applicationsCount: number;
  lastAppliedAt: string;
};

type Props = {
  apiUrl: string;
  variant: "partner" | "member";
};

function formatDate(iso: string) {
  try {
    return new Date(iso).toLocaleString("ru-RU", {
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

export default function PartnerVenueApplicationsList({ apiUrl, variant }: Props) {
  const [venues, setVenues] = useState<ApplicationVenueRow[]>([]);
  const [loading, setLoading] = useState(true);
  const touchRow = useTouchStickyRowSelection();

  const load = useCallback(async () => {
    try {
      const res = await fetch(apiUrl);
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setVenues(Array.isArray(data.venues) ? data.venues : []);
        if (apiUrl === "/api/partner/applications") {
          dispatchPartnerApplicationsNewRefresh();
        }
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [apiUrl]);

  useEffect(() => {
    load();
  }, [load]);

  const detailHref = (id: string) =>
    variant === "partner"
      ? `/partner-dashboard/applications/${id}`
      : `/dashboard/discounts/partner/${id}`;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-600 border-t-transparent" />
      </div>
    );
  }

  if (venues.length === 0) {
    return (
      <div className="rounded-xl border border-gray-200 bg-white p-8 text-center shadow-sm dark:border-gray-700 dark:bg-gray-800">
        <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
            d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
          />
        </svg>
        <p className="mt-4 text-gray-500 dark:text-gray-400">
          {variant === "partner"
            ? "Пока нет заявок ни по одной площадке."
            : "Вы ещё не подавали заявки на участие в площадках партнёров."}
        </p>
      </div>
    );
  }

  return (
    <div
      ref={touchRow.containerRef}
      className="w-full max-w-full min-w-0 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-800"
    >
      <div className="hidden w-full min-w-0 max-h-[min(75dvh,720px)] overflow-x-auto overflow-y-auto overscroll-contain [-webkit-overflow-scrolling:touch] sm:block">
        <table className="w-full table-auto divide-y divide-gray-200 dark:divide-gray-700">
          <thead className="sticky top-0 z-10 bg-gray-50 shadow-sm dark:bg-gray-800/95 dark:shadow-none">
            <tr>
              <th className="min-w-0 px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
                Название
              </th>
              {variant === "member" && (
                <th className="w-px whitespace-nowrap px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
                  Партнёр
                </th>
              )}
              <th className="w-px whitespace-nowrap px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
                Город
              </th>
              <th className="w-px whitespace-nowrap px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
                Промокод
              </th>
              {variant === "partner" && (
                <th className="w-px whitespace-nowrap px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
                  Заявок
                </th>
              )}
              <th className="w-px whitespace-nowrap px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
                {variant === "member" ? "Дата заявки" : "Последняя заявка"}
              </th>
              {variant === "partner" && (
                <th className="w-px whitespace-nowrap px-4 py-3 text-center text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
                  Статус
                </th>
              )}
              {variant === "member" && (
                <th className="w-px whitespace-nowrap px-4 py-3 text-center text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
                  Статус
                </th>
              )}
              <th className="w-px whitespace-nowrap px-4 py-3 text-center text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
                Действия
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
            {venues.map((v) => (
              <tr
                key={v.id}
                className={touchRow.getRowClassName(v.id)}
                onClick={(e) => touchRow.handleRowClick(e, v.id)}
              >
                <td className="min-w-0 px-4 py-3 text-sm font-medium text-gray-900 dark:text-white break-words align-top">
                  {v.name}
                </td>
                {variant === "member" && (
                  <td className="w-px whitespace-nowrap px-4 py-3 text-sm text-gray-600 dark:text-gray-300">
                    {v.partnerName || "—"}
                  </td>
                )}
                <td className="w-px whitespace-nowrap px-4 py-3 text-sm text-gray-500 dark:text-gray-400">
                  {v.city || "—"}
                </td>
                <td className="w-px whitespace-nowrap px-4 py-3 text-sm text-gray-500 dark:text-gray-400">
                  {v.promoCode ? (
                    <code className="rounded bg-gray-100 px-1.5 py-0.5 text-xs font-mono dark:bg-gray-700">
                      {v.promoCode}
                    </code>
                  ) : (
                    "—"
                  )}
                </td>
                {variant === "partner" && (
                  <td className="w-px whitespace-nowrap px-4 py-3 text-sm text-gray-600 dark:text-gray-300">
                    {v.applicationsCount}
                  </td>
                )}
                <td className="w-px whitespace-nowrap px-4 py-3 text-sm text-gray-500 dark:text-gray-400">
                  {formatDate(v.lastAppliedAt)}
                </td>
                {variant === "partner" && (
                  <td className="w-px whitespace-nowrap px-4 py-3 text-center text-sm">
                    {v.isActive ? (
                      <span className="inline-flex rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-800 dark:bg-green-900/30 dark:text-green-400">
                        Активна
                      </span>
                    ) : (
                      <span className="inline-flex rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-900 dark:bg-amber-950/40 dark:text-amber-300">
                        Неактивна
                      </span>
                    )}
                  </td>
                )}
                {variant === "member" && (
                  <td className="w-px whitespace-nowrap px-4 py-3 text-center text-sm">
                    {v.isActive ? (
                      <span className="inline-flex rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-800 dark:bg-green-900/30 dark:text-green-400">
                        Активна
                      </span>
                    ) : (
                      <span className="inline-flex rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-900 dark:bg-amber-950/40 dark:text-amber-300">
                        Неактивна
                      </span>
                    )}
                  </td>
                )}
                <td className="w-px whitespace-nowrap px-4 py-3 text-center text-sm">
                  <Link
                    href={detailHref(v.id)}
                    className={
                      variant === "partner"
                        ? adminTableActionOutlineClass
                        : "rounded-md px-2.5 py-1.5 font-medium text-blue-600 transition-colors hover:bg-blue-50 dark:text-blue-400 dark:hover:bg-blue-900/20"
                    }
                  >
                    {variant === "partner" ? "Просмотр" : "Открыть"}
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="max-h-[min(75dvh,720px)] overflow-y-auto overscroll-contain [-webkit-overflow-scrolling:touch] sm:hidden divide-y divide-gray-200 dark:divide-gray-700">
        {venues.map((v) => (
          <div
            key={v.id}
            className={touchRow.getRowClassName(v.id, "space-y-2 p-4")}
            onClick={(e) => touchRow.handleRowClick(e, v.id)}
          >
            <div className="flex items-center justify-between gap-2">
              <p className="font-medium text-gray-900 dark:text-white">{v.name}</p>
              {v.isActive ? (
                <span className="inline-flex shrink-0 rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-800 dark:bg-green-900/30 dark:text-green-400">
                  Активна
                </span>
              ) : (
                <span className="inline-flex shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-900 dark:bg-amber-950/40 dark:text-amber-300">
                  Неактивна
                </span>
              )}
            </div>
            {variant === "member" && v.partnerName && (
              <p className="text-sm text-gray-600 dark:text-gray-300">{v.partnerName}</p>
            )}
            {v.city && <p className="text-sm text-gray-500 dark:text-gray-400">{v.city}</p>}
            {v.promoCode && (
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Промокод:{" "}
                <code className="rounded bg-gray-100 px-1.5 py-0.5 text-xs font-mono dark:bg-gray-700">
                  {v.promoCode}
                </code>
              </p>
            )}
            <p className="text-xs text-gray-500 dark:text-gray-400">
              {variant === "partner" ? (
                <>
                  Заявок: {v.applicationsCount} · {formatDate(v.lastAppliedAt)}
                </>
              ) : (
                <>Дата заявки: {formatDate(v.lastAppliedAt)}</>
              )}
            </p>
            <Link
              href={detailHref(v.id)}
              className={
                variant === "partner"
                  ? adminTableActionOutlineClass
                  : "inline-block text-sm font-medium text-blue-600 dark:text-blue-400"
              }
            >
              {variant === "partner" ? "Просмотр" : "Открыть"}
            </Link>
          </div>
        ))}
      </div>
    </div>
  );
}
