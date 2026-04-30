"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { dispatchPartnerApplicationsNewRefresh } from "@/components/dashboard/PartnerApplicationsNewBadge";
import PartnerVenueApplicationStatusBadge from "@/components/partner/PartnerVenueApplicationStatusBadge";

type ApplicantUser = {
  id: string;
  email: string | null;
  firstName: string | null;
  lastName: string | null;
  middleName: string | null;
  phone: string | null;
};

type ApplicantRow = {
  applicationId: string;
  appliedAt: string;
  status: string;
  user: ApplicantUser;
};

function formatName(u: ApplicantUser) {
  const parts = [u.lastName, u.firstName, u.middleName].filter(Boolean);
  return parts.length ? parts.join(" ") : "—";
}

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

const viewApplicantButtonClass =
  "inline-flex rounded-md border border-blue-600 bg-white px-2.5 py-1.5 text-sm font-medium text-blue-600 shadow-sm transition hover:bg-blue-50 dark:border-blue-500 dark:bg-gray-800 dark:text-blue-400 dark:hover:bg-blue-900/20";

export default function PartnerVenueApplicationsDetailPage() {
  const params = useParams();
  const venueId = params.venueId as string;

  const [venueName, setVenueName] = useState<string>("");
  const [venueCity, setVenueCity] = useState<string | null>(null);
  const [applicants, setApplicants] = useState<ApplicantRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/partner/venues/${encodeURIComponent(venueId)}/applications`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(typeof data.error === "string" ? data.error : "Не удалось загрузить");
        setApplicants([]);
        return;
      }
      setVenueName(data.venue?.name ?? "Площадка");
      setVenueCity(data.venue?.city ?? null);
      dispatchPartnerApplicationsNewRefresh();
      const list = Array.isArray(data.applicants) ? data.applicants : [];
      setApplicants(
        list.map((row) => {
          const r = row as ApplicantRow;
          return {
            ...r,
            status: typeof r.status === "string" && r.status ? r.status : "NEW",
          };
        })
      );
    } catch {
      setError("Ошибка сети");
      setApplicants([]);
    } finally {
      setLoading(false);
    }
  }, [venueId]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/partner-dashboard/applications"
          className="text-sm font-medium text-blue-600 hover:underline dark:text-blue-400"
        >
          ← К списку заявок
        </Link>
        <h1 className="mt-2 text-2xl font-bold text-gray-900 dark:text-white">Заявки на участие</h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          {venueName}
          {venueCity ? ` · ${venueCity}` : ""}
        </p>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-600 border-t-transparent" />
        </div>
      ) : error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800 dark:border-red-900/40 dark:bg-red-950/30 dark:text-red-200">
          {error}
        </div>
      ) : applicants.length === 0 ? (
        <div className="rounded-xl border border-gray-200 bg-white p-8 text-center shadow-sm dark:border-gray-700 dark:bg-gray-800">
          <p className="text-gray-500 dark:text-gray-400">По этой площадке пока нет заявок.</p>
        </div>
      ) : (
        <div className="w-full max-w-full min-w-0 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-800">
          <div className="hidden w-full min-w-0 max-h-[min(75dvh,720px)] overflow-x-auto overflow-y-auto overscroll-contain [-webkit-overflow-scrolling:touch] sm:block">
            <table className="w-full table-auto divide-y divide-gray-200 dark:divide-gray-700">
              <thead className="sticky top-0 z-10 bg-gray-50 shadow-sm dark:bg-gray-800/95 dark:shadow-none">
                <tr>
                  <th className="min-w-0 px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
                    Участник
                  </th>
                  <th className="w-px whitespace-nowrap px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
                    Email
                  </th>
                  <th className="w-px whitespace-nowrap px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
                    Телефон
                  </th>
                  <th className="w-px whitespace-nowrap px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
                    Дата заявки
                  </th>
                  <th className="w-px whitespace-nowrap px-4 py-3 text-center text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
                    Статус
                  </th>
                  <th className="w-px whitespace-nowrap px-4 py-3 text-center text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
                    Действие
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                {applicants.map((row) => (
                  <tr
                    key={row.applicationId}
                    className="hover-surface"
                  >
                    <td className="min-w-0 px-4 py-3 text-sm font-medium text-gray-900 dark:text-white break-words align-top">
                      {formatName(row.user)}
                    </td>
                    <td className="w-px whitespace-nowrap px-4 py-3 text-sm text-gray-600 dark:text-gray-300">
                      {row.user.email || "—"}
                    </td>
                    <td className="w-px whitespace-nowrap px-4 py-3 text-sm text-gray-600 dark:text-gray-300">
                      {row.user.phone || "—"}
                    </td>
                    <td className="w-px whitespace-nowrap px-4 py-3 text-sm text-gray-500 dark:text-gray-400">
                      {formatDate(row.appliedAt)}
                    </td>
                    <td className="w-px whitespace-nowrap px-4 py-3 text-center text-sm">
                      <PartnerVenueApplicationStatusBadge status={row.status} />
                    </td>
                    <td className="w-px whitespace-nowrap px-4 py-3 text-center text-sm">
                      <Link
                        href={`/partner-dashboard/applications/${encodeURIComponent(venueId)}/${encodeURIComponent(row.applicationId)}`}
                        className={viewApplicantButtonClass}
                      >
                        Просмотр
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="max-h-[min(75dvh,720px)] overflow-y-auto overscroll-contain [-webkit-overflow-scrolling:touch] divide-y divide-gray-200 sm:hidden dark:divide-gray-700">
            {applicants.map((row) => (
              <div key={row.applicationId} className="space-y-2 p-4">
                <div className="flex items-start justify-between gap-2">
                  <p className="font-medium text-gray-900 dark:text-white">{formatName(row.user)}</p>
                  <PartnerVenueApplicationStatusBadge status={row.status} />
                </div>
                {row.user.email && (
                  <p className="text-sm text-gray-600 dark:text-gray-300">{row.user.email}</p>
                )}
                {row.user.phone && (
                  <p className="text-sm text-gray-600 dark:text-gray-300">{row.user.phone}</p>
                )}
                <p className="text-xs text-gray-500 dark:text-gray-400">{formatDate(row.appliedAt)}</p>
                <Link
                  href={`/partner-dashboard/applications/${encodeURIComponent(venueId)}/${encodeURIComponent(row.applicationId)}`}
                  className={viewApplicantButtonClass}
                >
                  Просмотр
                </Link>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
