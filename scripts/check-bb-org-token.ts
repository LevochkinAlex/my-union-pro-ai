/**
 * Проверка org-токена BestBenefits (каталог GET /api/products).
 *
 *   pnpm dotenv -e .env.local -- tsx scripts/check-bb-org-token.ts
 *
 * Не печатает сам токен — только длину после нормализации и HTTP-статус.
 */

import { config } from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

import { normalizeBbOrgTokenFromEnv } from "../lib/best-benefits-token-env";
import { getBestBenefitsToken } from "../lib/best-benefits-auth";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
config({ path: path.join(root, ".env") });
config({ path: path.join(root, ".env.local"), override: true });

const PRODUCTS_BASE =
  process.env.BEST_BENEFITS_API_URL?.trim() ||
  "https://bestbenefits.ru/api/products";

async function main() {
  const rawProf = process.env.BB_PROFSOYUZY_TOKEN;
  const rawApi = process.env.BB_API_TOKEN;
  const nProf = normalizeBbOrgTokenFromEnv(rawProf);
  const nApi = normalizeBbOrgTokenFromEnv(rawApi);
  console.log("Источник токена:", nProf ? "BB_PROFSOYUZY_TOKEN" : nApi ? "BB_API_TOKEN" : "нет");
  console.log(
    "Длина после нормализации:",
    (nProf || nApi || "").length,
    "(raw prof:",
    rawProf?.length ?? 0,
    "raw api:",
    rawApi?.length ?? 0,
    ")"
  );

  const token = await getBestBenefitsToken();
  const url = `${PRODUCTS_BASE.replace(/\/$/, "")}?per_page=1&page=1`;

  const res = await fetch(url, {
    method: "GET",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    cache: "no-store",
  });

  const text = await res.text();
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    body = text.slice(0, 200);
  }

  console.log("GET", url);
  console.log("HTTP", res.status);
  if (!res.ok) {
    console.log("Ответ:", body);
    if (res.status === 401) {
      console.log(
        "\n→ Токен отклонён BestBenefits. Запросите у BB новый ключ интеграции «МойСоюз» (org / каталог + myunion API), обновите BB_PROFSOYUZY_TOKEN в .env.local на VDS и выполните: pm2 restart my-union-pro && pnpm sync:discounts"
      );
    }
    process.exit(1);
  }

  const data = body as { data?: unknown[] };
  const n = Array.isArray(data?.data) ? data.data.length : 0;
  console.log("OK: каталог отвечает, записей в первой порции:", n);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
