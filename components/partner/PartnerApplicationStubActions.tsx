"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { dispatchPartnerApplicationsNewRefresh } from "@/components/dashboard/PartnerApplicationsNewBadge";
import PartnerVenueApplicationStatusBadge from "@/components/partner/PartnerVenueApplicationStatusBadge";

type Props = {
  venueId: string;
  applicationId: string;
  initialStatus: string;
};

export default function PartnerApplicationStubActions({ venueId, applicationId, initialStatus }: Props) {
  const router = useRouter();
  const [status, setStatus] = useState(initialStatus);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canAct = status === "NEW" || status === "IN_PROGRESS";

  const reject = async () => {
    if (!canAct || submitting) return;
    if (!confirm("Отклонить заявку? Статус станет «Отменена», для участников освободится одно место в лимите.")) {
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/partner/venues/${encodeURIComponent(venueId)}/applications/${encodeURIComponent(applicationId)}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "reject" }),
        }
      );
      const data = (await res.json().catch(() => ({}))) as { error?: string; status?: string };
      if (!res.ok) {
        setError(typeof data.error === "string" ? data.error : "Не удалось отклонить заявку");
        return;
      }
      setStatus(data.status ?? "CANCELLED");
      dispatchPartnerApplicationsNewRefresh();
      router.refresh();
    } finally {
      setSubmitting(false);
    }
  };

  if (!canAct) {
    return (
      <div className="flex flex-col items-center gap-3">
        <PartnerVenueApplicationStatusBadge status={status} />
      </div>
    );
  }

  return (
    <div className="flex flex-col items-stretch gap-3 sm:flex-row sm:items-center sm:justify-center sm:gap-4">
      {error ? (
        <p className="w-full text-center text-sm text-red-600 dark:text-red-400 sm:order-first sm:basis-full">
          {error}
        </p>
      ) : null}
      <button
        type="button"
        title="Функция в разработке"
        className="inline-flex cursor-not-allowed items-center justify-center rounded-lg bg-emerald-600/50 px-5 py-2.5 text-sm font-medium text-white shadow-sm dark:bg-emerald-600/40"
        disabled
        aria-disabled
      >
        Одобрить
      </button>
      <button
        type="button"
        onClick={reject}
        disabled={submitting}
        className="inline-flex items-center justify-center rounded-lg border border-red-600 bg-white px-5 py-2.5 text-sm font-medium text-red-600 shadow-sm transition-colors hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-red-500 dark:bg-gray-800 dark:text-red-400 dark:hover:bg-red-950/30"
      >
        {submitting ? "Отправка…" : "Отклонить"}
      </button>
    </div>
  );
}
