import { sendEmail } from "@/lib/email";
import { isLooseEmailValid } from "@/lib/partner-requisites";
import { getSupportEmail } from "@/lib/support-user";

const MAX_SEND_ATTEMPTS = 5;
const INITIAL_BACKOFF_MS = 400;

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function normalizeEmail(s: string): string {
  return s.replace(/[<>]/g, "").trim().toLowerCase();
}

function uniqueValidRecipients(primary: string | null | undefined, secondary: string | null | undefined): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of [primary, secondary]) {
    const t = String(raw ?? "").trim();
    if (!t || !isLooseEmailValid(t)) continue;
    const n = normalizeEmail(t);
    if (seen.has(n)) continue;
    seen.add(n);
    out.push(t.trim());
  }
  return out;
}

/**
 * Повторяет sendEmail при сетевых/временных сбоях и при `sent: false` (очередь провайдера).
 * Абсолютная гарантия доставки на стороне получателя невозможна; здесь — максимум на стороне отправителя.
 */
async function sendEmailWithRetries(params: {
  to: string;
  subject: string;
  html: string;
  text: string;
  logLabel: string;
}): Promise<boolean> {
  let lastErr: unknown;
  for (let attempt = 1; attempt <= MAX_SEND_ATTEMPTS; attempt++) {
    try {
      const result = await sendEmail({
        to: params.to,
        subject: params.subject,
        html: params.html,
        text: params.text,
      });
      if (result.sent) {
        if (attempt > 1) {
          console.log(`[partner-liquidation-email] ${params.logLabel}: успех с попытки ${attempt}/${MAX_SEND_ATTEMPTS}`);
        }
        return true;
      }
      lastErr = new Error("sendEmail returned sent:false");
    } catch (e) {
      lastErr = e;
      console.warn(
        `[partner-liquidation-email] ${params.logLabel}: попытка ${attempt}/${MAX_SEND_ATTEMPTS} не удалась:`,
        e instanceof Error ? e.message : e
      );
    }
    if (attempt < MAX_SEND_ATTEMPTS) {
      const delay = Math.min(10_000, INITIAL_BACKOFF_MS * 2 ** (attempt - 1));
      await sleep(delay);
    }
  }
  console.error(
    `[partner-liquidation-email] ${params.logLabel}: исчерпаны попытки (${MAX_SEND_ATTEMPTS}), to=${params.to}`,
    lastErr
  );
  return false;
}

function buildPartnerBlockBodies(params: { partnerName: string; egrulSummary: string; support: string }) {
  const name = params.partnerName.trim() || "Партнёр";
  const snippet = params.egrulSummary.trim().slice(0, 500);
  const support = params.support;

  const lines = [
    "Здравствуйте!",
    "",
    `Кабинет партнёра «${name}» заблокирован: по данным ЕГРЮЛ юридическое лицо находится в стадии ликвидации или прекращения деятельности.`,
  ];
  if (snippet) {
    lines.push("", `Сводка из реестра: ${snippet}`);
  }
  lines.push(
    "",
    `Если вы считаете, что блокировка ошибочна, свяжитесь с поддержкой: ${support}`,
    "",
    "С уважением,",
    "Команда MyUnion"
  );
  const text = lines.join("\n");

  const html = `
<!DOCTYPE html>
<html lang="ru">
<head><meta charset="utf-8" /></head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #111827;">
  <p>Здравствуйте!</p>
  <p>Кабинет партнёра <strong>${escapeHtml(name)}</strong> <strong>заблокирован</strong>: по данным ЕГРЮЛ юридическое лицо находится в стадии ликвидации или прекращения деятельности.</p>
  ${
    snippet
      ? `<p style="margin-top:16px;padding:12px 16px;background:#f3f4f6;border-radius:8px;font-size:14px;color:#374151;"><strong>Сводка из реестра:</strong><br/>${escapeHtml(snippet)}</p>`
      : ""
  }
  <p style="margin-top:20px;">Если вы считаете, что блокировка ошибочна, свяжитесь с поддержкой:<br/>
    <a href="mailto:${escapeHtml(support)}">${escapeHtml(support)}</a>
  </p>
  <p style="margin-top:24px;color:#6b7280;font-size:14px;">С уважением,<br/>Команда MyUnion</p>
</body>
</html>`;

  return { subject: "Кабинет партнёра заблокирован", html, text };
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Письмо партнёру(ам) после автоблокировки по ЕГРЮЛ + резервные попытки и дубль на contactEmail.
 * Если в карточке нет валидных адресов — письмо на поддержку (операционный контроль).
 */
export async function notifyPartnerLiquidationBlocked(params: {
  partnerId: string;
  to: string | null | undefined;
  contactEmail?: string | null | undefined;
  partnerName: string | null | undefined;
  egrulSummary: string;
}): Promise<void> {
  const support = getSupportEmail();
  const name = (params.partnerName ?? "").trim() || "Партнёр";
  const snippet = (params.egrulSummary ?? "").trim().slice(0, 500);
  const { subject, html, text } = buildPartnerBlockBodies({ partnerName: name, egrulSummary: snippet, support });

  const recipients = uniqueValidRecipients(params.to, params.contactEmail);

  if (recipients.length === 0) {
    const opsSubject = "[MyUnion] Автоблокировка партнёра — нет email в карточке";
    const opsText = [
      `Партнёр заблокирован по ЕГРЮЛ, но в карточке нет корректного email (реквизиты / контакт).`,
      ``,
      `ID: ${params.partnerId}`,
      `Название: ${name}`,
      snippet ? `Сводка ЕГРЮЛ: ${snippet}` : "",
      ``,
      `Свяжитесь с партнёром вручную.`,
    ]
      .filter(Boolean)
      .join("\n");
    const opsHtml = `<p>Партнёр заблокирован по ЕГРЮЛ, но в карточке <strong>нет корректного email</strong>.</p>
<p><strong>ID:</strong> ${escapeHtml(params.partnerId)}<br/><strong>Название:</strong> ${escapeHtml(name)}</p>
${snippet ? `<p><strong>Сводка ЕГРЮЛ:</strong><br/>${escapeHtml(snippet)}</p>` : ""}
<p>Свяжитесь с партнёром вручную.</p>`;
    await sendEmailWithRetries({
      to: support,
      subject: opsSubject,
      html: opsHtml,
      text: opsText,
      logLabel: `ops-no-email partner=${params.partnerId}`,
    });
    return;
  }

  const delivered: string[] = [];
  const failed: string[] = [];

  for (const addr of recipients) {
    const ok = await sendEmailWithRetries({
      to: addr,
      subject,
      html,
      text,
      logLabel: `partner-block partner=${params.partnerId}`,
    });
    if (ok) {
      delivered.push(addr);
      console.log("[partner-liquidation-email] уведомление о блокировке доставлено провайдеру:", addr);
    } else {
      failed.push(addr);
    }
  }

  if (failed.length > 0) {
    const escSubject = `[MyUnion] Не удалось уведомить партнёра о блокировке (${params.partnerId})`;
    const escText = [
      `Не удалось отправить письмо о блокировке кабинета после ${MAX_SEND_ATTEMPTS} попыток на адрес(а): ${failed.join(", ")}.`,
      delivered.length ? `Успешно: ${delivered.join(", ")}` : "",
      ``,
      `ID партнёра: ${params.partnerId}`,
      `Название: ${name}`,
      snippet ? `Сводка ЕГРЮЛ: ${snippet}` : "",
    ]
      .filter(Boolean)
      .join("\n");
    const escHtml = `<p>Не удалось отправить письмо о блокировке после ${MAX_SEND_ATTEMPTS} попыток.</p>
<p><strong>Не доставлено:</strong> ${escapeHtml(failed.join(", "))}</p>
${delivered.length ? `<p><strong>Доставлено:</strong> ${escapeHtml(delivered.join(", "))}</p>` : ""}
<p><strong>ID партнёра:</strong> ${escapeHtml(params.partnerId)}<br/><strong>Название:</strong> ${escapeHtml(name)}</p>
${snippet ? `<p><strong>Сводка ЕГРЮЛ:</strong><br/>${escapeHtml(snippet)}</p>` : ""}`;

    await sendEmailWithRetries({
      to: support,
      subject: escSubject,
      html: escHtml,
      text: escText,
      logLabel: `ops-escalate partner=${params.partnerId}`,
    });
  }
}
