"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { dispatchPartnerApplicationsNewRefresh } from "@/components/dashboard/PartnerApplicationsNewBadge";
import PartnerVenueApplicationStatusBadge from "@/components/partner/PartnerVenueApplicationStatusBadge";

/** Заглушки в ряду действий (как у партнёра в карточке заявки) — палитра blue, как у основных CTA в кабинете. */
const partnerStubDisabledPayClass =
  "inline-flex cursor-not-allowed items-center justify-center rounded-lg bg-blue-600/50 px-5 py-2.5 text-sm font-medium text-white shadow-sm dark:bg-blue-600/45";

const partnerStubActivePayClass =
  "inline-flex items-center justify-center rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 focus-visible:ring-offset-gray-50 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-blue-500 dark:hover:bg-blue-600 dark:focus-visible:ring-blue-400 dark:focus-visible:ring-offset-gray-900";
const partnerStubDisabledApproveClass =
  "inline-flex cursor-not-allowed items-center justify-center rounded-lg bg-emerald-600/50 px-5 py-2.5 text-sm font-medium text-white shadow-sm dark:bg-emerald-600/40";
const partnerStubActiveApproveClass =
  "inline-flex items-center justify-center rounded-lg bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 focus-visible:ring-offset-gray-50 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-emerald-600 dark:hover:bg-emerald-500 dark:focus-visible:ring-emerald-400 dark:focus-visible:ring-offset-gray-900";

/** «Отклонить» / «Отменить» — та же геометрия и скругление, что у заглушек выше. */
const partnerStubDangerOutlineClass =
  "inline-flex items-center justify-center rounded-lg border border-red-600 bg-white px-5 py-2.5 text-sm font-medium text-red-600 shadow-sm transition-colors hover:bg-red-50 disabled:pointer-events-none disabled:opacity-60 dark:border-red-500 dark:bg-gray-800 dark:text-red-400 dark:hover:bg-red-950/30";

type Props = {
  venueId: string;
  applicationId: string;
  initialStatus: string;
  /** Участник смотрит свою заявку — скрываем действия партнёра (в т.ч. «Одобрить»). */
  viewContext?: "partner" | "applicant";
  /** Участник: в зоне «Документы» выбран хотя бы один файл — активирует «Отправить документ об оплате». */
  applicantHasPaymentFiles?: boolean;
  onApplicantSendPaymentDocuments?: () => void | Promise<void>;
  applicantSendingPaymentDocuments?: boolean;
  applicantPaymentDocumentNotice?: string | null;
  applicantPaymentDocumentError?: string | null;
  /** Партнёр: число сохранённых в БД документов об оплате от участника */
  partnerPaymentDocumentsCount?: number;
  /** Партнёр: ISO-дата подтверждения оплаты (если уже нажали «Подтвердить оплату») */
  partnerPaymentConfirmedAt?: string | null;
};

export default function PartnerApplicationStubActions({
  venueId,
  applicationId,
  initialStatus,
  viewContext = "partner",
  applicantHasPaymentFiles = false,
  onApplicantSendPaymentDocuments,
  applicantSendingPaymentDocuments = false,
  applicantPaymentDocumentNotice = null,
  applicantPaymentDocumentError = null,
  partnerPaymentDocumentsCount = 0,
  partnerPaymentConfirmedAt = null,
}: Props) {
  const router = useRouter();
  const [status, setStatus] = useState(initialStatus);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [paymentConfirmedAt, setPaymentConfirmedAt] = useState<string | null>(partnerPaymentConfirmedAt);

  useEffect(() => {
    setPaymentConfirmedAt(partnerPaymentConfirmedAt);
  }, [partnerPaymentConfirmedAt]);

  const paymentConfirmed = Boolean(paymentConfirmedAt);
  const canConfirmPayment =
    viewContext === "partner" &&
    partnerPaymentDocumentsCount > 0 &&
    !paymentConfirmed &&
    (status === "NEW" || status === "IN_PROGRESS");

  const canAct = status === "NEW" || status === "IN_PROGRESS";

  const cancelByApplicant = async () => {
    if (!canAct || submitting || viewContext !== "applicant") return;
    if (
      !confirm(
        "Отменить заявку? Статус станет «Отменена», место в лимите площадки освободится. При необходимости вы сможете подать заявку снова позже."
      )
    ) {
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/partner-venues/my-applications/${encodeURIComponent(applicationId)}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "cancel" }),
        }
      );
      const data = (await res.json().catch(() => ({}))) as { error?: string; status?: string };
      if (!res.ok) {
        setError(typeof data.error === "string" ? data.error : "Не удалось отменить заявку");
        return;
      }
      setStatus(data.status ?? "CANCELLED");
      dispatchPartnerApplicationsNewRefresh();
      router.refresh();
    } finally {
      setSubmitting(false);
    }
  };

  const approve = async () => {
    if (!canAct || submitting || viewContext !== "partner") return;
    if (!confirm("Одобрить заявку? Статус станет «Одобрено», место в лимите площадки освободится.")) {
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
          body: JSON.stringify({ action: "approve" }),
        }
      );
      const data = (await res.json().catch(() => ({}))) as { error?: string; status?: string };
      if (!res.ok) {
        setError(typeof data.error === "string" ? data.error : "Не удалось одобрить заявку");
        return;
      }
      setStatus(data.status ?? "APPROVED");
      dispatchPartnerApplicationsNewRefresh();
      router.refresh();
    } finally {
      setSubmitting(false);
    }
  };

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

  const confirmPayment = async () => {
    if (!canConfirmPayment || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/partner/venues/${encodeURIComponent(venueId)}/applications/${encodeURIComponent(applicationId)}/confirm-payment`,
        { method: "POST" }
      );
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        paymentConfirmedAt?: string;
        status?: string;
      };
      if (!res.ok) {
        setError(typeof data.error === "string" ? data.error : "Не удалось подтвердить оплату");
        return;
      }
      if (typeof data.status === "string") {
        setStatus(data.status);
      }
      if (typeof data.paymentConfirmedAt === "string") {
        setPaymentConfirmedAt(data.paymentConfirmedAt);
      }
      router.refresh();
    } finally {
      setSubmitting(false);
    }
  };

  if (!canAct) {
    return (
      <div className="flex flex-col items-center gap-3">
        <PartnerVenueApplicationStatusBadge status={status} />
        {paymentConfirmed ? (
          <p className="text-center text-sm text-emerald-700 dark:text-emerald-300">
            Оплата подтверждена
            {paymentConfirmedAt
              ? ` · ${new Date(paymentConfirmedAt).toLocaleString("ru-RU", {
                  day: "2-digit",
                  month: "2-digit",
                  year: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                })}`
              : null}
          </p>
        ) : null}
      </div>
    );
  }

  if (viewContext === "applicant") {
    const payLooksActive = applicantHasPaymentFiles && !applicantSendingPaymentDocuments;

    return (
      <div className="flex w-full flex-col gap-6">
        <div className="flex flex-col items-center gap-2 text-center">
          <PartnerVenueApplicationStatusBadge status={status} />
          <p className="max-w-md text-pretty text-sm leading-relaxed text-gray-600 dark:text-gray-300">
            Ожидайте рассмотрения заявки партнёром. При необходимости прикрепите документы выше.
          </p>
        </div>
        {applicantPaymentDocumentNotice ? (
          <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-center text-sm text-emerald-900 dark:border-emerald-900/40 dark:bg-emerald-950/35 dark:text-emerald-200">
            {applicantPaymentDocumentNotice}
          </p>
        ) : null}
        <div className="flex flex-col items-stretch gap-3 sm:flex-row sm:items-center sm:justify-center sm:gap-4">
          {error ? (
            <p className="w-full text-center text-sm text-red-600 dark:text-red-400 sm:order-first sm:basis-full">
              {error}
            </p>
          ) : null}
          {applicantPaymentDocumentError ? (
            <p className="w-full text-center text-sm text-red-600 dark:text-red-400 sm:order-first sm:basis-full">
              {applicantPaymentDocumentError}
            </p>
          ) : null}
          <button
            type="button"
            title={
              applicantHasPaymentFiles
                ? "Отправить выбранные файлы партнёру на проверку"
                : "Сначала добавьте файл в блоке «Документы» выше"
            }
            className={payLooksActive ? partnerStubActivePayClass : partnerStubDisabledPayClass}
            disabled={!applicantHasPaymentFiles || applicantSendingPaymentDocuments}
            onClick={() => {
              if (payLooksActive) void onApplicantSendPaymentDocuments?.();
            }}
          >
            {applicantSendingPaymentDocuments ? "Отправка…" : "Отправить документ об оплате"}
          </button>
          <button
            type="button"
            onClick={cancelByApplicant}
            disabled={submitting}
            className={partnerStubDangerOutlineClass}
          >
            {submitting ? "Отправка…" : "Отменить"}
          </button>
        </div>
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
      {paymentConfirmed ? (
        <p className="w-full text-center text-sm text-emerald-700 dark:text-emerald-300 sm:order-first sm:basis-full">
          Оплата подтверждена
          {paymentConfirmedAt
            ? ` · ${new Date(paymentConfirmedAt).toLocaleString("ru-RU", {
                day: "2-digit",
                month: "2-digit",
                year: "numeric",
                hour: "2-digit",
                minute: "2-digit",
              })}`
            : null}
        </p>
      ) : null}
      <button
        type="button"
        title={
          paymentConfirmed
            ? "Оплата уже подтверждена"
            : partnerPaymentDocumentsCount === 0
              ? "Дождитесь загрузки документов об оплате участником"
              : "Отметить, что документы об оплате получены и проверены"
        }
        className={canConfirmPayment && !submitting ? partnerStubActivePayClass : partnerStubDisabledPayClass}
        disabled={!canConfirmPayment || submitting}
        onClick={() => {
          if (canConfirmPayment && !submitting) void confirmPayment();
        }}
      >
        {submitting ? "Отправка…" : "Подтвердить оплату"}
      </button>
      <button
        type="button"
        title="Перевести заявку в статус «Одобрено» без подтверждения оплаты"
        className={canAct && !submitting ? partnerStubActiveApproveClass : partnerStubDisabledApproveClass}
        disabled={!canAct || submitting}
        onClick={() => {
          if (canAct && !submitting) void approve();
        }}
      >
        {submitting ? "Отправка…" : "Одобрить"}
      </button>
      <button
        type="button"
        onClick={reject}
        disabled={submitting}
        className={partnerStubDangerOutlineClass}
      >
        {submitting ? "Отправка…" : "Отклонить"}
      </button>
    </div>
  );
}
