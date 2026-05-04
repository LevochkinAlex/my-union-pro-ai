import path from "path";

/** Каталог вне `public/` — выдача только через защищённый API. */
export function partnerApplicationPaymentUploadDir(applicationId: string): string {
  const aid = applicationId.trim();
  return path.join(process.cwd(), "uploads", "partner-application-payment", aid);
}

export function partnerApplicationPaymentViewUrl(
  applicationId: string,
  storedFileName: string
): string {
  return `/api/uploads/partner-application-payment/${encodeURIComponent(applicationId.trim())}/${encodeURIComponent(storedFileName)}`;
}
