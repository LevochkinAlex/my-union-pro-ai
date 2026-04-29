import { sendEmail } from "@/lib/email";

const APPLICATION_EMAIL_BODY =
  'В "Мой Союз" подана заявка на участие. Обработайте её.';

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

export async function sendPartnerVenueApplicationEmail(to: string): Promise<{ sent: boolean }> {
  const text = APPLICATION_EMAIL_BODY;
  const html = `<p>${text}</p>`;
  const result = await sendEmail({
    to,
    subject: APPLICATION_EMAIL_SUBJECT,
    text,
    html,
  });
  return { sent: result.sent };
}
