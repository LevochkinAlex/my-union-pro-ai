"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import PartnerApplicationAttachmentZone from "@/components/partner/PartnerApplicationAttachmentZone";
import PartnerApplicationPaymentDocumentsLinks from "@/components/partner/PartnerApplicationPaymentDocumentsLinks";
import type { PartnerPaymentDocumentLink } from "@/components/partner/PartnerApplicationPaymentDocumentsLinks";
import PartnerApplicationStubActions from "@/components/partner/PartnerApplicationStubActions";

type Props = {
  venueId: string;
  applicationId: string;
  initialStatus: string;
  initialPaymentDocuments: PartnerPaymentDocumentLink[];
};

export default function MemberPartnerApplicationDocumentsPanel({
  venueId,
  applicationId,
  initialStatus,
  initialPaymentDocuments,
}: Props) {
  const router = useRouter();
  const [paymentFiles, setPaymentFiles] = useState<File[]>([]);
  const [sendingPayment, setSendingPayment] = useState(false);
  const [paymentNotice, setPaymentNotice] = useState<string | null>(null);
  const [paymentError, setPaymentError] = useState<string | null>(null);
  const [savedDocuments, setSavedDocuments] = useState<PartnerPaymentDocumentLink[]>(initialPaymentDocuments);

  useEffect(() => {
    setSavedDocuments(initialPaymentDocuments);
  }, [initialPaymentDocuments]);

  useEffect(() => {
    if (paymentFiles.length > 0) {
      setPaymentNotice(null);
    }
  }, [paymentFiles.length]);

  const sendPaymentDocuments = useCallback(async () => {
    if (paymentFiles.length === 0 || sendingPayment) return;
    setSendingPayment(true);
    setPaymentError(null);
    setPaymentNotice(null);
    try {
      const fd = new FormData();
      for (const f of paymentFiles) {
        fd.append("files", f);
      }
      const res = await fetch(
        `/api/partner-venues/my-applications/${encodeURIComponent(applicationId)}/payment-documents`,
        { method: "POST", body: fd }
      );
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        count?: number;
        documents?: PartnerPaymentDocumentLink[];
      };
      if (!res.ok) {
        setPaymentError(typeof data.error === "string" ? data.error : "Не удалось отправить файлы");
        return;
      }
      if (Array.isArray(data.documents) && data.documents.length > 0) {
        setSavedDocuments((prev) => [...prev, ...data.documents]);
      }
      setPaymentNotice(
        typeof data.count === "number" && data.count > 1
          ? `Отправлено файлов: ${data.count}. Партнёр получит их на проверку.`
          : "Документ об оплате отправлен партнёру на проверку."
      );
      setPaymentFiles([]);
      router.refresh();
    } catch {
      setPaymentError("Ошибка сети. Попробуйте позже.");
    } finally {
      setSendingPayment(false);
    }
  }, [applicationId, paymentFiles, router, sendingPayment]);

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-3">
        <PartnerApplicationAttachmentZone value={paymentFiles} onChange={setPaymentFiles} />
        <PartnerApplicationPaymentDocumentsLinks documents={savedDocuments} />
      </div>
      <PartnerApplicationStubActions
        venueId={venueId}
        applicationId={applicationId}
        initialStatus={initialStatus}
        viewContext="applicant"
        applicantHasPaymentFiles={paymentFiles.length > 0}
        onApplicantSendPaymentDocuments={sendPaymentDocuments}
        applicantSendingPaymentDocuments={sendingPayment}
        applicantPaymentDocumentNotice={paymentNotice}
        applicantPaymentDocumentError={paymentError}
      />
    </div>
  );
}
