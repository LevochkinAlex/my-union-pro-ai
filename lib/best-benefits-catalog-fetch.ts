/**
 * Постраничная загрузка каталога /api/products BestBenefits.
 * Единая логика для cron, HTTP sync и CLI — чтобы не терять страницы из‑за maxPages или битой meta.
 */

const DEFAULT_API =
  process.env.BEST_BENEFITS_API_URL ?? "https://bestbenefits.ru/api/products";

export type BestBenefitsCatalogFetchLog = (
  level: "info" | "warn",
  message: string
) => void;

export type FetchBbCatalogResult = {
  items: unknown[];
  pagesFetched: number;
  truncatedByCap: boolean;
};

function coalesceNumber(v: unknown): number | null {
  if (v == null) return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

function hasNextLink(links: unknown): boolean {
  if (!links || typeof links !== "object") return false;
  const next = (links as Record<string, unknown>).next;
  return typeof next === "string" && next.length > 0 && next !== "null";
}

/**
 * Определяем, есть ли следующая страница: Laravel meta, links.next, либо «полная порция».
 */
function computeHasMore(params: {
  meta: unknown;
  links: unknown;
  batchLength: number;
  requestedPerPage: number;
}): boolean {
  if (hasNextLink(params.links)) return true;

  const meta = params.meta;
  if (!meta || typeof meta !== "object") {
    return params.batchLength >= params.requestedPerPage;
  }

  const m = meta as Record<string, unknown>;
  const current = coalesceNumber(m.current_page);
  const last = coalesceNumber(m.last_page);
  const total = coalesceNumber(m.total);
  const perPage =
    coalesceNumber(m.per_page) && coalesceNumber(m.per_page)! > 0
      ? coalesceNumber(m.per_page)!
      : params.requestedPerPage;

  if (current != null && last != null && last >= 1) {
    return current < last;
  }

  if (total != null && total >= 0 && perPage > 0) {
    const computedLast = Math.max(1, Math.ceil(total / perPage));
    const effCurrent = current != null && current >= 1 ? current : 1;
    return effCurrent < computedLast;
  }

  return params.batchLength >= params.requestedPerPage;
}

function maxPagesFromEnv(): number {
  const raw = process.env.BESTBENEFITS_CATALOG_MAX_PAGES?.trim();
  if (!raw) return 500;
  const n = parseInt(raw, 10);
  return Number.isFinite(n) && n >= 1 ? Math.min(n, 5000) : 500;
}

/**
 * Загружает все продукты каталога BB (массив объектов скидок в формате API).
 */
export async function fetchAllBestBenefitsCatalogProducts(options: {
  token: string;
  apiBaseUrl?: string;
  perPage?: number;
  maxPages?: number;
  pageTimeoutMs?: number;
  pauseMs?: number;
  signal?: AbortSignal;
  log?: BestBenefitsCatalogFetchLog;
}): Promise<FetchBbCatalogResult> {
  const base = (options.apiBaseUrl ?? DEFAULT_API).replace(/\/$/, "");
  const perPage = options.perPage ?? 100;
  const maxPages = options.maxPages ?? maxPagesFromEnv();
  const pageTimeoutMs = options.pageTimeoutMs ?? 60_000;
  const pauseMs = options.pauseMs ?? 200;

  const items: unknown[] = [];
  let pagesFetched = 0;
  let truncatedByCap = false;

  for (let page = 1; page <= maxPages; page++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), pageTimeoutMs);
    const external = options.signal;
    if (external) {
      if (external.aborted) controller.abort();
      else external.addEventListener("abort", () => controller.abort(), { once: true });
    }

    let response: Response;
    try {
      const url = `${base}?per_page=${perPage}&page=${page}`;
      response = await fetch(url, {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${options.token}`,
          Accept: "application/json",
        },
        cache: "no-store",
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timer);
    }

    if (!response.ok) {
      const text = await response.text().catch(() => "");
      throw new Error(
        `BestBenefits API ${response.status}: ${text.slice(0, 500)}`
      );
    }

    const data = (await response.json()) as Record<string, unknown>;
    const discounts = Array.isArray(data.data) ? data.data : [];

    pagesFetched++;
    if (discounts.length === 0) {
      options.log?.("info", `[bb-catalog] page ${page}: пусто, стоп`);
      break;
    }

    items.push(...discounts);

    const hasMore = computeHasMore({
      meta: data.meta,
      links: data.links,
      batchLength: discounts.length,
      requestedPerPage: perPage,
    });

    options.log?.(
      "info",
      `[bb-catalog] page ${page}: +${discounts.length} (всего ${items.length}), ещё страниц: ${hasMore}`
    );

    if (!hasMore) break;

    if (page === maxPages) {
      truncatedByCap = true;
      options.log?.(
        "warn",
        `[bb-catalog] достигнут лимит maxPages=${maxPages} (~${maxPages * perPage} позиций). Задайте BESTBENEFITS_CATALOG_MAX_PAGES при необходимости.`
      );
      break;
    }

    await new Promise((r) => setTimeout(r, pauseMs));
  }

  return { items, pagesFetched, truncatedByCap };
}
