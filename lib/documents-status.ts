/**
 * Константы и хелперы статусов заявлений (членство, взносы).
 * Только чистый JS — без Node/Puppeteer, можно импортировать в клиентских компонентах.
 */

/**
 * Статусы заявлений, при которых шаг «Отправить документы» считается выполненным:
 * подписан и загружен (SIGNED) или уже на проверке/завершён.
 */
export const DOCUMENT_SUBMITTED_STATUSES = [
  "SIGNED",
  "PENDING_REVIEW",
  "PENDING_APPROVAL",
  "PENDING_SIGNATURE",
  "COMPLETED",
] as const;

/**
 * Статусы заявлений «уже отправлено на проверку» (для шага 4 в анкете).
 */
export const DOCUMENT_ON_REVIEW_STATUSES = [
  "PENDING_REVIEW",
  "PENDING_APPROVAL",
  "PENDING_SIGNATURE",
  "COMPLETED",
] as const;

export type DocumentSubmittedStatus = (typeof DOCUMENT_SUBMITTED_STATUSES)[number];
export type DocumentOnReviewStatus = (typeof DOCUMENT_ON_REVIEW_STATUSES)[number];

/**
 * Проверяет, что оба заявления (членство и взносы) в «отправленном» состоянии.
 * @param documents — массив документов (outgoingDocuments или user.documents)
 * @param statuses — список статусов (по умолчанию DOCUMENT_SUBMITTED_STATUSES)
 */
export function hasBothApplicationsSubmitted(
  documents: Array<{ type: string; status: string }>,
  statuses: readonly string[] = DOCUMENT_SUBMITTED_STATUSES
): boolean {
  const membershipSubmitted = documents.some(
    (d) => d.type === "MEMBERSHIP_APPLICATION" && statuses.includes(d.status)
  );
  const contributionSubmitted = documents.some(
    (d) => d.type === "CONTRIBUTION_APPLICATION" && statuses.includes(d.status)
  );
  return membershipSubmitted && contributionSubmitted;
}
