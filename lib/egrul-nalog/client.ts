/**
 * Неофициальный клиент к веб-форме https://egrul.nalog.ru/
 *
 * Протокол (на 2026): POST / с x-www-form-urlencoded query=ИНН|ОГРН|ОГРНИП
 * → JSON { t, captchaRequired }. GET /search-result/{t} → { rows: [...] }.
 * Поля строк см. summarizeEgrulRow в liquidation.ts.
 */

import { summarizeEgrulRow, type EgrulSearchRow } from "./liquidation";

const BASE = "https://egrul.nalog.ru";
const DEFAULT_UA =
  "Mozilla/5.0 (compatible; UnionProEgrulCheck/1.0; +https://github.com/) AppleWebKit/537.36 (KHTML, like Gecko)";

const CACHE_TTL_MS = 10 * 60 * 1000;
const MIN_REQUEST_INTERVAL_MS = 800;
const FETCH_TIMEOUT_MS = 25_000;
const MAX_ATTEMPTS = 3;

type CacheEntry = { expires: number; result: EgrulLookupResult };
const cache = new Map<string, CacheEntry>();

let lastRequestEnd = 0;

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function jitter(ms: number): number {
  return Math.floor(ms * (0.7 + Math.random() * 0.6));
}

async function rateLimitDelay(): Promise<void> {
  const now = Date.now();
  const wait = lastRequestEnd + MIN_REQUEST_INTERVAL_MS - now;
  if (wait > 0) await sleep(wait);
}

function markRequestDone(): void {
  lastRequestEnd = Date.now();
}

function onlyDigits(s: string): string {
  return s.replace(/\D/g, "");
}

export type EgrulLookupOk = {
  ok: true;
  row: EgrulSearchRow | null;
  summary: string;
  captchaRequired: boolean;
};

export type EgrulLookupErr = {
  ok: false;
  error: string;
  captchaRequired?: boolean;
};

export type EgrulLookupResult = EgrulLookupOk | EgrulLookupErr;

function pickRow(rows: EgrulSearchRow[], innDigits: string, ogrnDigits: string): EgrulSearchRow | null {
  if (!rows.length) return null;
  const match = rows.find((row) => {
    const ri = onlyDigits(String(row.i ?? ""));
    const ro = onlyDigits(String(row.o ?? ""));
    if (ogrnDigits && ro === ogrnDigits) return true;
    if (innDigits && ri === innDigits) return true;
    return false;
  });
  if (match) return match;
  if (rows.length === 1) return rows[0] ?? null;
  return null;
}

async function fetchWithTimeout(
  url: string,
  init: RequestInit
): Promise<Response> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: ctrl.signal });
  } finally {
    clearTimeout(t);
  }
}

async function postSearchToken(query: string): Promise<{ t?: string; captchaRequired?: boolean; raw: string }> {
  await rateLimitDelay();
  const body = new URLSearchParams({ query }).toString();
  const res = await fetchWithTimeout(`${BASE}/`, {
    method: "POST",
    headers: {
      "User-Agent": process.env.EGRUL_NALOG_USER_AGENT || DEFAULT_UA,
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json, text/plain, */*",
    },
    body,
  });
  markRequestDone();
  const raw = await res.text();
  if (!res.ok) {
    throw new Error(`egrul POST ${res.status}: ${raw.slice(0, 200)}`);
  }
  let json: { t?: string; captchaRequired?: boolean };
  try {
    json = JSON.parse(raw) as { t?: string; captchaRequired?: boolean };
  } catch {
    throw new Error(`egrul POST: non-JSON body: ${raw.slice(0, 200)}`);
  }
  return { t: json.t, captchaRequired: Boolean(json.captchaRequired), raw };
}

async function getSearchResult(token: string): Promise<EgrulSearchRow[]> {
  await rateLimitDelay();
  const res = await fetchWithTimeout(`${BASE}/search-result/${encodeURIComponent(token)}`, {
    method: "GET",
    headers: {
      "User-Agent": process.env.EGRUL_NALOG_USER_AGENT || DEFAULT_UA,
      Accept: "application/json, text/plain, */*",
    },
  });
  markRequestDone();
  const raw = await res.text();
  if (!res.ok) {
    throw new Error(`egrul GET search-result ${res.status}: ${raw.slice(0, 200)}`);
  }
  const json = JSON.parse(raw) as { rows?: EgrulSearchRow[] };
  return Array.isArray(json.rows) ? json.rows : [];
}

export type LookupEgrulOptions = {
  /** Не использовать кэш (ручная проверка в админке — каждый клик идёт в ФНС). */
  bypassCache?: boolean;
};

/**
 * ИНН/ОГРН из карточки партнёра: приоритет запроса — ОГРН (если есть), иначе ИНН.
 */
export async function lookupEgrulByInnOrOgrn(
  inn: string | null | undefined,
  ogrn: string | null | undefined,
  options?: LookupEgrulOptions
): Promise<EgrulLookupResult> {
  const innDigits = onlyDigits(inn ?? "");
  const ogrnDigits = onlyDigits(ogrn ?? "");
  const queryDigits = ogrnDigits || innDigits;
  if (!queryDigits) {
    return { ok: false, error: "Нет ИНН или ОГРН для запроса" };
  }

  const cacheKey = `${ogrnDigits || "noogrn"}|${innDigits || "noinn"}`;
  if (options?.bypassCache) {
    cache.delete(cacheKey);
  }
  const hit = cache.get(cacheKey);
  if (hit && hit.expires > Date.now()) {
    return hit.result;
  }

  let lastErr: string | null = null;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const tokenRes = await postSearchToken(queryDigits);
      if (tokenRes.captchaRequired) {
        const err: EgrulLookupErr = {
          ok: false,
          error: "ФНС запросила капчу; автоматическая проверка невозможна",
          captchaRequired: true,
        };
        return err;
      }
      if (!tokenRes.t) {
        return { ok: false, error: "Пустой токен ответа ФНС" };
      }
      const rows = await getSearchResult(tokenRes.t);
      const row = pickRow(rows, innDigits, ogrnDigits);
      const summary = summarizeEgrulRow(row);
      const ok: EgrulLookupOk = {
        ok: true,
        row,
        summary: summary || (rows.length === 0 ? "Запись не найдена в выдаче ЕГРЮЛ" : "Не удалось сопоставить строку выдачи с ИНН/ОГРН"),
        captchaRequired: false,
      };
      cache.set(cacheKey, { expires: Date.now() + CACHE_TTL_MS, result: ok });
      return ok;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      lastErr = msg;
      console.error(`[egrul-nalog] attempt ${attempt}/${MAX_ATTEMPTS}:`, msg);
      const retryable =
        /abort|network|fetch|ECONNRESET|ETIMEDOUT|socket/i.test(msg) ||
        /egrul POST (429|502|503|504)/i.test(msg) ||
        /egrul GET search-result (429|502|503|504)/i.test(msg);
      if (!retryable || attempt === MAX_ATTEMPTS) break;
      await sleep(jitter(400 * 2 ** (attempt - 1)));
    }
  }
  const err: EgrulLookupErr = { ok: false, error: lastErr || "Неизвестная ошибка ЕГРЮЛ" };
  return err;
}
