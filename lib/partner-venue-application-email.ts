import { sendEmail } from "@/lib/email";
import {
  PARTNER_VENUE_APPLICATION_SLA_HOURS,
  partnerVenueApplicationsManageUrl,
} from "@/lib/partner-venue-sla";

const APPLICATION_EMAIL_SUBJECT = "Мой Союз: заявка на участие";

export function resolvePartnerVenueNotificationEmail(venue: {
  email: string | null;
  partner: { contactEmail: string | null; email: string | null };
}): string | null {
  const to =
    venue.email?.trim() ||
    venue.partner.contactEmail?.trim() ||
    venue.partner.email?.trim() ||
    null;
  return to || null;
}

export type PartnerVenueApplicationEmailContext = {
  venueId: string;
  venueName: string;
};

function manageParagraph(ctx: PartnerVenueApplicationEmailContext): string {
  const url = partnerVenueApplicationsManageUrl(ctx.venueId);
  return `Обработайте заявку в личном кабинете партнёра: ${url}\n\nУ вас есть ${PARTNER_VENUE_APPLICATION_SLA_HOURS} часов с момента подачи, чтобы открыть заявку (статус «В работе»). После истечения срока площадка временно скрывается из каталога «Скидки от партнёров», пока не будут обработаны все просроченные новые заявки.`;
}

function manageParagraphHtml(ctx: PartnerVenueApplicationEmailContext): string {
  const url = partnerVenueApplicationsManageUrl(ctx.venueId);
  return `<p>Обработайте заявку в личном кабинете партнёра:</p><p><a href="${url}">${url}</a></p><p>У вас есть <strong>${PARTNER_VENUE_APPLICATION_SLA_HOURS} часов</strong> с момента подачи, чтобы открыть заявку (статус «В работе»). После истечения срока площадка временно скрывается из каталога «Скидки от партнёров», пока не будут обработаны все просроченные новые заявки.</p>`;
}

/** Письмо сразу после подачи заявки членом. */
export async function sendPartnerVenueApplicationEmail(
  to: string,
  ctx: PartnerVenueApplicationEmailContext
): Promise<{ sent: boolean }> {
  const text = [`В «Мой Союз» подана новая заявка на участие по площадке «${ctx.venueName}».`, "", manageParagraph(ctx)].join("\n");
  const html = `<p>В «Мой Союз» подана новая заявка на участие по площадке <strong>${escapeHtml(
    ctx.venueName
  )}</strong>.</p>${manageParagraphHtml(ctx)}`;
  const result = await sendEmail({
    to,
    subject: APPLICATION_EMAIL_SUBJECT,
    text,
    html,
  });
  return { sent: result.sent };
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** За 24 часа до окончания 48-часового срока. */
export async function sendPartnerVenueApplicationSlaReminder24hEmail(
  to: string,
  ctx: PartnerVenueApplicationEmailContext
): Promise<{ sent: boolean }> {
  const subject = "Мой Союз: напоминание — осталось 24 ч на обработку заявки";
  const text = [
    `Напоминание: по площадке «${ctx.venueName}» новая заявка всё ещё ждёт реакции.`,
    `До истечения срока (${PARTNER_VENUE_APPLICATION_SLA_HOURS} ч с момента подачи) остаётся около 24 часов.`,
    "",
    manageParagraph(ctx),
  ].join("\n");
  const html = `<p>Напоминание: по площадке <strong>${escapeHtml(ctx.venueName)}</strong> новая заявка всё ещё ждёт реакции.</p><p>До истечения срока (${PARTNER_VENUE_APPLICATION_SLA_HOURS} ч с момента подачи) остаётся <strong>около 24 часов</strong>.</p>${manageParagraphHtml(ctx)}`;
  const result = await sendEmail({ to, subject, text, html });
  return { sent: result.sent };
}

/** За 2 часа до окончания 48-часового срока. */
export async function sendPartnerVenueApplicationSlaReminder2hEmail(
  to: string,
  ctx: PartnerVenueApplicationEmailContext
): Promise<{ sent: boolean }> {
  const subject = "Мой Союз: срочно — 2 ч до скрытия площадки из каталога";
  const text = [
    `Срочно: по площадке «${ctx.venueName}» заявка всё ещё в статусе «Новая».`,
    `Через 2 часа истечёт срок реакции (${PARTNER_VENUE_APPLICATION_SLA_HOURS} ч). Площадка будет скрыта из каталога «Скидки от партнёров», пока заявки не будут обработаны.`,
    "",
    manageParagraph(ctx),
  ].join("\n");
  const html = `<p>Срочно: по площадке <strong>${escapeHtml(ctx.venueName)}</strong> заявка всё ещё в статусе «Новая».</p><p>Через <strong>2 часа</strong> истечёт срок реакции (${PARTNER_VENUE_APPLICATION_SLA_HOURS} ч). Площадка будет скрыта из каталога «Скидки от партнёров», пока заявки не будут обработаны.</p>${manageParagraphHtml(ctx)}`;
  const result = await sendEmail({ to, subject, text, html });
  return { sent: result.sent };
}

/** Площадка скрыта из каталога из‑за просроченных заявок NEW. */
export async function sendPartnerVenueSlaBlockedEmail(
  to: string,
  ctx: PartnerVenueApplicationEmailContext
): Promise<{ sent: boolean }> {
  const subject = "Мой Союз: площадка скрыта из каталога — обработайте заявки";
  const url = partnerVenueApplicationsManageUrl(ctx.venueId);
  const text = [
    "Ваша площадка заблокирована в каталоге «Скидки от партнёров»: не обработаны новые заявки в течение 48 часов.",
    "Обработайте все заявки.",
    "",
    `Список заявок по площадке «${ctx.venueName}»: ${url}`,
  ].join("\n");
  const html = `<p>Ваша площадка заблокирована в каталоге «Скидки от партнёров»: не обработаны новые заявки в течение ${PARTNER_VENUE_APPLICATION_SLA_HOURS} часов.</p><p><strong>Обработайте все заявки.</strong></p><p>Список заявок по площадке «${escapeHtml(ctx.venueName)}»:<br><a href="${url}">${url}</a></p>`;
  const result = await sendEmail({ to, subject, text, html });
  return { sent: result.sent };
}
