import { sendEmail } from "@/lib/email";
import {
  PARTNER_VENUE_APPLICATION_NEW_SLA_HOURS,
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
  return [
    `Обработайте заявку в личном кабинете партнёра: ${url}`,
    "",
    `У вас есть ${PARTNER_VENUE_APPLICATION_NEW_SLA_HOURS} часов с момента подачи заявки, чтобы открыть её (статус «В работе»). Площадка может скрываться из каталога «Скидки от партнёров», если неоткрытые новые заявки висят дольше этого срока.`,
    `После перевода в «В работе» на обработку отводится ${PARTNER_VENUE_APPLICATION_SLA_HOURS} часов; при просрочке площадка также может скрываться из каталога, пока не будут обработаны все просроченные заявки «В работе».`,
  ].join("\n");
}

function manageParagraphHtml(ctx: PartnerVenueApplicationEmailContext): string {
  const url = partnerVenueApplicationsManageUrl(ctx.venueId);
  return `<p>Обработайте заявку в личном кабинете партнёра:</p><p><a href="${url}">${url}</a></p><p>У вас есть <strong>${PARTNER_VENUE_APPLICATION_NEW_SLA_HOURS} часов</strong> с момента подачи заявки, чтобы открыть её (статус «В работе»). Площадка может скрываться из каталога «Скидки от партнёров», если неоткрытые новые заявки висят дольше этого срока.</p><p>После перевода в «В работе» на обработку отводится <strong>${PARTNER_VENUE_APPLICATION_SLA_HOURS} часов</strong>; при просрочке площадка также может скрываться из каталога, пока не будут обработаны все просроченные заявки «В работе».</p>`;
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

type ReminderApplicantParams = {
  to: string;
  venueName: string;
  venueId: string;
  participantName: string;
};

/** За 24 ч до окончания 48-часового срока по заявке «Новая». */
export async function sendPartnerVenueApplicationSlaNew24hReminderEmail(
  p: ReminderApplicantParams
): Promise<{ sent: boolean }> {
  const manageUrl = partnerVenueApplicationsManageUrl(p.venueId);
  const subject = "Мой Союз: напоминание — осталось 24 ч на открытие заявки";
  const who = p.participantName.trim() || "участник";
  const text = [
    `По площадке «${p.venueName}» новая заявка (${who}) всё ещё не открыта.`,
    `До истечения ${PARTNER_VENUE_APPLICATION_NEW_SLA_HOURS}-часового срока с момента подачи остаётся около 24 часов. Откройте заявку в статусе «В работе».`,
    "",
    manageUrl,
  ].join("\n");
  const html = `<p>По площадке <strong>${escapeHtml(p.venueName)}</strong> новая заявка (${escapeHtml(who)}) всё ещё не открыта.</p><p>До истечения <strong>${PARTNER_VENUE_APPLICATION_NEW_SLA_HOURS}-часового</strong> срока с момента подачи остаётся <strong>около 24 часов</strong>. Откройте заявку в статусе «В работе».</p><p><a href="${manageUrl}">${manageUrl}</a></p>`;
  return sendEmail({ to: p.to, subject, text, html });
}

/** За 2 ч до окончания 48-часового срока по заявке «Новая». */
export async function sendPartnerVenueApplicationSlaNew2hReminderEmail(
  p: ReminderApplicantParams
): Promise<{ sent: boolean }> {
  const manageUrl = partnerVenueApplicationsManageUrl(p.venueId);
  const subject = "Мой Союз: срочно — 2 ч до скрытия площадки (неоткрытые заявки)";
  const who = p.participantName.trim() || "участник";
  const text = [
    `Срочно: по площадке «${p.venueName}» заявка (${who}) всё ещё в статусе «Новая».`,
    `Через 2 часа истечёт срок ${PARTNER_VENUE_APPLICATION_NEW_SLA_HOURS} ч. Площадка может быть скрыта из каталога «Скидки от партнёров», пока не будут открыты или обработаны все просроченные новые заявки.`,
    "",
    manageUrl,
  ].join("\n");
  const html = `<p>Срочно: по площадке <strong>${escapeHtml(p.venueName)}</strong> заявка (${escapeHtml(who)}) всё ещё в статусе «Новая».</p><p>Через <strong>2 часа</strong> истечёт срок ${PARTNER_VENUE_APPLICATION_NEW_SLA_HOURS} ч.</p><p><a href="${manageUrl}">${manageUrl}</a></p>`;
  return sendEmail({ to: p.to, subject, text, html });
}

/** За 24 ч до окончания 72-часового срока после «В работе». */
export async function sendPartnerVenueApplicationSla24hReminderEmail(
  p: ReminderApplicantParams
): Promise<{ sent: boolean }> {
  const manageUrl = partnerVenueApplicationsManageUrl(p.venueId);
  const subject = "Мой Союз: напоминание — осталось 24 ч до окончания срока по заявке";
  const who = p.participantName.trim() || "участник";
  const text = [
    `По площадке «${p.venueName}» заявка (${who}) всё ещё в статусе «В работе».`,
    `До истечения ${PARTNER_VENUE_APPLICATION_SLA_HOURS}-часового срока (отсчёт с момента перевода заявки в «В работе») остаётся около 24 часов.`,
    "",
    `Обработайте заявки: ${manageUrl}`,
  ].join("\n");
  const html = `<p>По площадке <strong>${escapeHtml(p.venueName)}</strong> заявка (${escapeHtml(who)}) всё ещё в статусе «В работе».</p><p>До истечения <strong>${PARTNER_VENUE_APPLICATION_SLA_HOURS}-часового</strong> срока (отсчёт с момента перевода в «В работе») остаётся <strong>около 24 часов</strong>.</p><p><a href="${manageUrl}">${manageUrl}</a></p>`;
  return sendEmail({ to: p.to, subject, text, html });
}

type BlockEmailParams = {
  to: string;
  venueId: string;
};

/** Просрочены только «Новая» (48 ч): отдельное письмо от трека «В работе». */
export async function sendPartnerVenueApplicationSlaNewBlockEmail(
  p: BlockEmailParams
): Promise<{ sent: boolean }> {
  const subject = "Мой Союз: площадка скрыта из каталога — откройте новые заявки";
  const url = partnerVenueApplicationsManageUrl(p.venueId);
  const text = [
    `Площадка скрыта из каталога «Скидки от партнёров»: есть неоткрытые новые заявки дольше ${PARTNER_VENUE_APPLICATION_NEW_SLA_HOURS} часов.`,
    "Обработайте все заявки.",
    "",
    url,
  ].join("\n");
  const html = `<p>Площадка скрыта из каталога «Скидки от партнёров»: есть неоткрытые новые заявки дольше ${PARTNER_VENUE_APPLICATION_NEW_SLA_HOURS} часов.</p><p><strong>Обработайте все заявки.</strong></p><p><a href="${url}">${url}</a></p>`;
  return sendEmail({ to: p.to, subject, text, html });
}

/** Просрочены заявки «В работе» (72 ч): текст ТЗ + ссылка. */
export async function sendPartnerVenueApplicationSlaBlockEmail(
  p: BlockEmailParams
): Promise<{ sent: boolean }> {
  const subject = "Мой Союз: площадка в каталоге скидок — обработайте заявки";
  const url = partnerVenueApplicationsManageUrl(p.venueId);
  const text = ["Ваша площадка заблокирована. Обработайте все заявки.", "", url].join("\n");
  const html = `<p>Ваша площадка заблокирована. Обработайте все заявки.</p><p><a href="${url}">${url}</a></p>`;
  return sendEmail({ to: p.to, subject, text, html });
}
